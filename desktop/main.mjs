/**
 * EduTutor.AI desktop launcher — Electron main process.
 *
 * Boots the full local stack via the shell-agnostic orchestrator, shows a splash
 * while it comes up, then opens the app window on the Next.js frontend (which
 * embeds the live UE5 avatar stream). Tears the whole stack down on quit.
 *
 * EDU_LAUNCH_SKIP_STACK=1 → just open the window (assumes the stack is already
 * running). Used for fast UI/shell iteration.
 */
import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, createWriteStream, statSync, createReadStream, unlinkSync, renameSync, cpSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { getLauncher, shutdownAll, CONFIG } from './orchestrator.mjs';

// Where UE5 ships from. See release v<UE5_VERSION>/ue5-engine-<UE5_VERSION>.zip.
// The zip extracts to <userData>/ue5/{SlovakEdu.exe, SlovakEdu/, Engine/}.
//
// This MUST be a PUBLIC repo. The Electron app fetches with no auth header
// (we won't ship a token — extracting it from app.asar is trivial), so
// private-repo asset URLs return HTTP 404 to anonymous requests. v0.4.4
// shipped this constant pointing at the private source repo and EVERY user's
// download silently failed with 9 bytes of "Not Found". Source code lives in
// `princeofwellness/edotutor` (private); release binaries live in this
// public mirror repo.
const UE5_RELEASE_REPO = 'sorrywecann/edututor-ai';

// Decoupled from app version. The UE5 cook only needs to change when the
// avatar Blueprint or assets change — most app patch releases (orchestrator
// tweaks, frontend fixes, backend bumps) don't touch UE5 at all. Pinning
// UE5_VERSION separately means users with a cached UE5 don't re-download
// the 1.69 GiB zip on every patch. Bump this manually when the cooked UE5
// build actually changes.
const UE5_VERSION = '0.5.1';

// Wilbur (Epic's PixelStreaming signalling) ships as a separate ~3 MB asset
// on the same release tag. Same fetch+verify+extract pattern as UE5 but tiny,
// so no retry-with-prompt dialog. Cached at <userData>/wilbur/.
const WILBUR_VERSION = '0.5.1';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP_STACK = process.env.EDU_LAUNCH_SKIP_STACK === '1';
const FRONTEND_URL = `http://127.0.0.1:${CONFIG.ports.frontend}`;

// Loading-state labels in English — feels more "tech / minimal" while the rest
// of the app stays Slovak. The rotating ritual words above also run in English.
const SVC_LABEL = { ollama: 'thinking', backend: 'engine', frontend: 'interface', wilbur: 'connection', ue5: 'presence' };

let mainWindow = null;
let splash = null;
let quitting = false;

function splashStatus(text) {
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)})`).catch(() => {});
  }
}

// The frontend ships as frontend.tgz — electron-builder can't carry a loose
// node_modules/.next dir in extraResources. Extract it into the writable data
// dir once, and re-extract only when the app version changes (an upgrade ships
// a new frontend). Runs before the orchestrator launches the frontend.
function ensureFrontendExtracted() {
  return new Promise((resolve) => {
    if (!app.isPackaged) return resolve();
    const tgz = join(process.resourcesPath, 'frontend.tgz');
    const dest = join(app.getPath('userData'), 'frontend');
    const marker = join(dest, '.bundle-version');
    // Frontend cache version tracks APP version — every release ships a fresh
    // frontend.tgz, so the cached extract is invalidated on every upgrade.
    const version = app.getVersion();
    try {
      if (existsSync(join(dest, 'server.js')) && existsSync(marker) && readFileSync(marker, 'utf8') === version) return resolve();
    } catch { /* fall through to re-extract */ }
    if (!existsSync(tgz)) { console.error('[frontend] archive missing:', tgz); return resolve(); }
    splashStatus('Rozbaľujem rozhranie…');
    try { rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
    mkdirSync(dest, { recursive: true });
    const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    const p = spawn(tar, ['-xzf', tgz, '-C', dest], { windowsHide: true });
    p.on('error', (e) => { console.error('[frontend] extract error:', e); resolve(); });
    p.on('exit', (code) => {
      if (code === 0) { try { writeFileSync(marker, version); } catch { /* ignore */ } console.log('[frontend] extracted →', dest); }
      else console.error('[frontend] extract exited', code);
      resolve();
    });
  });
}

// Copy the bundled HF embedding cache from <RES>/backend/hf-cache (read-only
// in Program Files) to <userData>/hf-cache (writable). The orchestrator then
// points HF_HOME at the writable copy. ~458 MB copy on first launch takes
// 5-10s on SSD; cached afterwards via .bundle-version marker. Same pattern as
// ensureFrontendExtracted. Resolves on success or non-fatal failure (backend
// falls back to network download if cache is missing).
function ensureHfCacheExtracted() {
  return new Promise((resolve) => {
    if (!app.isPackaged) return resolve();
    // v0.8.9: HF cache now ships as backend/hf-cache.tgz instead of a raw dir,
    // because NSIS makensis.exe can't handle the 280-char paths inside
    // models--Systran--faster-whisper-small/snapshots/<sha>/*. Tar-extracting
    // at runtime sidesteps the build-time MAX_PATH issue entirely.
    const srcTgz = join(process.resourcesPath, 'backend', 'hf-cache.tgz');
    const srcDir = join(process.resourcesPath, 'backend', 'hf-cache');
    const dest = join(app.getPath('userData'), 'hf-cache');
    const marker = join(dest, '.bundle-version');
    const version = app.getVersion();
    // v0.6.4: don't trust marker alone — verify the actual cache content is
    // present. A previous run could have left the marker but had the cache
    // dir wiped by the user, a cleaner, or AV quarantine.
    const hubDir = join(dest, 'hub');
    try {
      if (existsSync(marker)
          && readFileSync(marker, 'utf8') === version
          && existsSync(hubDir)
          && readdirSync(hubDir).length > 0) {
        console.log('[hf-cache] already extracted for', version);
        return resolve();
      }
    } catch { /* fall through to re-extract */ }

    splashStatus('Pripravujem AI model…');
    try { rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
    mkdirSync(dest, { recursive: true });

    if (existsSync(srcTgz)) {
      // tgz path (v0.8.9+): bundle ships hf-cache.tgz, extract via Windows tar.exe.
      const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      const p = spawn(tar, ['-xzf', srcTgz, '-C', dest, '--strip-components=1'], { windowsHide: true });
      p.on('error', (e) => { console.error('[hf-cache] tar spawn error:', e); resolve(); });
      p.on('exit', (code) => {
        if (code === 0) {
          try { writeFileSync(marker, version); } catch { /* ignore */ }
          console.log('[hf-cache] extracted from tgz →', dest);
        } else {
          console.error('[hf-cache] tar exited code=', code);
        }
        resolve();
      });
      return;
    }

    if (existsSync(srcDir)) {
      // legacy raw-dir path (≤ v0.8.8): bundle shipped the unpacked hf-cache.
      try {
        cpSync(srcDir, dest, { recursive: true, dereference: false, verbatimSymlinks: true });
        writeFileSync(marker, version);
        console.log('[hf-cache] extracted from raw dir →', dest);
      } catch (e) {
        console.error('[hf-cache] copy failed:', e);
      }
      return resolve();
    }

    console.warn('[hf-cache] bundled source missing (neither .tgz nor raw dir at', srcDir, ') — backend will download from HF on first use');
    resolve();
  });
}

function splashProgress(label, ratio /* 0..1 or null */) {
  // Sends a labeled progress update with optional percentage to the splash.
  // splash.html's setProgress() draws the bar; setStatus() just sets the line.
  if (splash && !splash.isDestroyed()) {
    const arg = JSON.stringify({ label, ratio: ratio == null ? null : Number(ratio) });
    splash.webContents.executeJavaScript(`window.setProgress && window.setProgress(${arg})`).catch(() => {});
  }
}

// Stream-download a URL to disk with HTTP redirect handling, Content-Range
// resume support (so a half-finished 1.5 GB pull doesn't restart from zero),
// and a progress callback fed bytes-received vs bytes-expected.
// Resolves on success; rejects with an Error on any transport/protocol failure.
function downloadWithResume(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const partial = destPath + '.part';
    // v0.6.4: stat can throw on transient errors (AV scan momentarily locks
    // the .part file). Treat any stat failure as "no partial" rather than
    // letting the function reject before downloading.
    let startBytes = 0;
    try { if (existsSync(partial)) startBytes = statSync(partial).size; } catch { /* ignore */ }
    const u = new URL(url);
    const headers = startBytes > 0 ? { Range: `bytes=${startBytes}-` } : {};
    const req = httpsRequest({
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'EduTutor.AI-Desktop', ...headers },
    }, (res) => {
      // Follow 30x redirects (GitHub release downloads bounce through S3).
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadWithResume(res.headers.location, destPath, onProgress).then(resolve, reject);
      }
      // v0.6.4: 416 Requested Range Not Satisfiable means our .part file is
      // larger than or equal to the asset (asset was re-published smaller).
      // Without this special-case we'd reject and leave the poisoned .part on
      // disk; next launch would send the same Range and 416 again forever.
      // Delete the partial and restart from byte 0 once.
      if (res.statusCode === 416 && startBytes > 0) {
        res.resume();
        try { unlinkSync(partial); } catch { /* ignore */ }
        return downloadWithResume(url, destPath, onProgress).then(resolve, reject);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        // v0.6.4: nuke the poisoned partial so the next attempt starts clean.
        try { unlinkSync(partial); } catch { /* ignore */ }
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      // Content-Length for 206 is the size of the REMAINING bytes, not total.
      // For the progress bar we want the total size of the file.
      const total = res.statusCode === 206
        ? startBytes + Number(res.headers['content-length'] || 0)
        : Number(res.headers['content-length'] || 0);
      let received = startBytes;
      const sink = createWriteStream(partial, { flags: startBytes > 0 ? 'a' : 'w' });
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total && onProgress) onProgress(received, total);
      });
      res.pipe(sink);
      sink.on('finish', () => {
        sink.close(() => {
          try { renameSync(partial, destPath); resolve(); }
          catch (e) { reject(e); }
        });
      });
      sink.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(filePath);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

// On first launch (or after an upgrade that bumps the bundled UE5 version),
// download ue5-engine-<version>.zip from the matching GitHub release into
// the writable per-user dir, verify SHA-256 against the published .sha256
// asset, extract with tar.exe (Windows 10+ supports .zip extraction
// natively via tar). Cached on subsequent launches via .bundle-version marker.
//
// We split UE5 out of the installer because the all-in-one .exe outgrew NSIS's
// 2 GB mmap cliff (the bootstrap script is 32-bit) and GitHub's 2 GiB asset cap.
// See orchestrator.mjs CONFIG.ue5Exe — packaged mode now reads from dataDir.
// File-based logger for the UE5 download flow. Electron main-process
// console.log/error doesn't go to launcher.log automatically — and the
// v0.4.4 incident proved that without file logging we have NO way to
// diagnose why a download failed on a user's machine. Writes a
// timestamped line to <userData>/logs/ue5-downloader.log every step.
function ue5Log(msg) {
  try {
    const logsDir = join(app.getPath('userData'), 'logs');
    mkdirSync(logsDir, { recursive: true });
    const line = `${new Date().toISOString()} ${msg}\n`;
    writeFileSync(join(logsDir, 'ue5-downloader.log'), line, { flag: 'a' });
  } catch { /* ignore — best-effort logging */ }
  // Mirror to console so dev mode (`pnpm electron`) still shows it.
  console.log('[ue5]', msg);
}

function ensureUE5Downloaded() {
  return new Promise((resolve) => {
    if (!app.isPackaged) { ue5Log('dev mode — skip downloader'); return resolve(); }
    const dest = join(app.getPath('userData'), 'ue5');
    const marker = join(dest, '.bundle-version');
    const version = UE5_VERSION;
    const stub = join(dest, 'SlovakEdu.exe');
    ue5Log(`ensureUE5Downloaded start  version=${version}  dest=${dest}`);
    try {
      if (existsSync(stub) && existsSync(marker) && readFileSync(marker, 'utf8').trim() === version) {
        ue5Log(`cache hit — SlovakEdu.exe + .bundle-version=${version} both present, skipping download`);
        return resolve();
      }
    } catch { /* fall through to re-download */ }

    const zipName = `ue5-engine-${version}.zip`;
    const zipUrl = `https://github.com/${UE5_RELEASE_REPO}/releases/download/v${version}/${zipName}`;
    const sha256Url = `${zipUrl}.sha256`;
    const tmpZip = join(app.getPath('userData'), zipName);

    splashProgress('Pripravujem avatar engine…', null);
    ue5Log(`download start  url=${zipUrl}`);

    let downloadOk = false;

    (async () => {
      // 1. Fetch expected SHA-256 (small text file — no resume needed).
      let expectedHash = null;
      try {
        const hashPath = tmpZip + '.sha256';
        rmSync(hashPath, { force: true });
        await downloadWithResume(sha256Url, hashPath, null);
        const raw = readFileSync(hashPath, 'utf8').trim();
        expectedHash = raw.split(/\s+/)[0]; // "<hex>  filename" format
        ue5Log(`fetched expected sha256=${expectedHash}`);
        rmSync(hashPath, { force: true });
      } catch (e) {
        ue5Log(`sha256 fetch failed (will skip integrity check): ${e.message}`);
      }

      // 2. Download the zip (with resume if a partial exists).
      try {
        await downloadWithResume(zipUrl, tmpZip, (got, total) => {
          const mb = (n) => (n / 1024 / 1024).toFixed(0);
          splashProgress(`Sťahujem avatar (${mb(got)} / ${mb(total)} MB)`, total ? got / total : null);
        });
        ue5Log(`download OK  bytes=${statSync(tmpZip).size}`);
      } catch (e) {
        ue5Log(`download FAILED: ${e.message}`);
        splashProgress(`✗ Stiahnutie avatara zlyhalo: ${e.message}`, null);
        return resolve(); // dialog is shown after this Promise resolves; see ensureUE5DownloadedOrPrompt
      }

      // 3. Verify SHA-256 if we have an expected hash.
      if (expectedHash) {
        splashProgress('Overujem integritu…', null);
        try {
          const actual = await sha256OfFile(tmpZip);
          if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
            ue5Log(`HASH MISMATCH expected=${expectedHash} got=${actual} — deleting partial`);
            unlinkSync(tmpZip);
            splashProgress('✗ Avatar engine corrupted; reštartuj aplikáciu.', null);
            return resolve();
          }
          ue5Log(`sha256 verified OK`);
        } catch (e) {
          ue5Log(`hash check threw: ${e.message}`);
        }
      }

      // 4. Extract — tar.exe on Win10+ understands .zip natively.
      splashProgress('Rozbaľujem avatar engine…', null);
      try { rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
      mkdirSync(dest, { recursive: true });
      const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      ue5Log(`extract start  tar=${tar}  src=${tmpZip}  dest=${dest}`);
      const p = spawn(tar, ['-xf', tmpZip, '-C', dest], { windowsHide: true });
      p.on('error', (e) => { ue5Log(`extract spawn error: ${e.message}`); resolve(); });
      p.on('exit', (code) => {
        if (code === 0) {
          try { writeFileSync(marker, version); } catch { /* ignore */ }
          try { unlinkSync(tmpZip); } catch { /* keep zip if delete fails — non-fatal */ }
          ue5Log(`extracted OK → ${dest}`);
          splashProgress(null, null); // clear progress; orchestrator takes over the splash
          downloadOk = true;
        } else {
          ue5Log(`extract exited code=${code}`);
          splashProgress(`✗ Rozbalenie zlyhalo (kód ${code})`, null);
        }
        resolve();
      });
    })().catch((e) => { ue5Log(`unexpected: ${e.message}`); resolve(); });
  });
}

function wilburLog(msg) {
  try {
    const logsDir = join(app.getPath('userData'), 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(join(logsDir, 'wilbur-downloader.log'), `${new Date().toISOString()} ${msg}\n`, { flag: 'a' });
  } catch { /* ignore */ }
  console.log('[wilbur]', msg);
}

// Mirrors ensureUE5Downloaded but for the 3 MB Wilbur signalling bundle.
// Cached at <userData>/wilbur/{wilbur.bundle.cjs, config.json, www/}.
// Cache hit short-circuits; orchestrator reads the same path via CONFIG.wilburDir.
function ensureWilburDownloaded() {
  return new Promise((resolve) => {
    if (!app.isPackaged) { wilburLog('dev mode — skip downloader'); return resolve(); }
    const dest = join(app.getPath('userData'), 'wilbur');
    const marker = join(dest, '.bundle-version');
    const version = WILBUR_VERSION;
    const bundle = join(dest, 'wilbur.bundle.cjs');
    wilburLog(`ensureWilburDownloaded start  version=${version}  dest=${dest}`);
    try {
      if (existsSync(bundle) && existsSync(marker) && readFileSync(marker, 'utf8').trim() === version) {
        wilburLog(`cache hit — wilbur.bundle.cjs + .bundle-version=${version} present, skipping download`);
        return resolve();
      }
    } catch { /* fall through to re-download */ }

    const zipName = `wilbur-bundle-${version}.zip`;
    const zipUrl = `https://github.com/${UE5_RELEASE_REPO}/releases/download/v${version}/${zipName}`;
    const sha256Url = `${zipUrl}.sha256`;
    const tmpZip = join(app.getPath('userData'), zipName);

    splashProgress('Pripravujem signálny server…', null);
    wilburLog(`download start  url=${zipUrl}`);

    (async () => {
      let expectedHash = null;
      try {
        const hashPath = tmpZip + '.sha256';
        rmSync(hashPath, { force: true });
        await downloadWithResume(sha256Url, hashPath, null);
        expectedHash = readFileSync(hashPath, 'utf8').trim().split(/\s+/)[0];
        wilburLog(`fetched expected sha256=${expectedHash}`);
        rmSync(hashPath, { force: true });
      } catch (e) {
        wilburLog(`sha256 fetch failed (will skip integrity check): ${e.message}`);
      }

      try {
        await downloadWithResume(zipUrl, tmpZip, (got, total) => {
          const mb = (n) => (n / 1024 / 1024).toFixed(1);
          splashProgress(`Sťahujem signálny server (${mb(got)} / ${mb(total)} MB)`, total ? got / total : null);
        });
        wilburLog(`download OK  bytes=${statSync(tmpZip).size}`);
      } catch (e) {
        wilburLog(`download FAILED: ${e.message}`);
        splashProgress(`✗ Stiahnutie signálneho servera zlyhalo: ${e.message}`, null);
        return resolve();
      }

      if (expectedHash) {
        try {
          const actual = await sha256OfFile(tmpZip);
          if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
            wilburLog(`HASH MISMATCH expected=${expectedHash} got=${actual}`);
            unlinkSync(tmpZip);
            return resolve();
          }
          wilburLog(`sha256 verified OK`);
        } catch (e) {
          wilburLog(`hash check threw: ${e.message}`);
        }
      }

      try { rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
      mkdirSync(dest, { recursive: true });
      const tar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      wilburLog(`extract start  src=${tmpZip}  dest=${dest}`);
      const p = spawn(tar, ['-xf', tmpZip, '-C', dest], { windowsHide: true });
      p.on('error', (e) => { wilburLog(`extract spawn error: ${e.message}`); resolve(); });
      p.on('exit', (code) => {
        if (code === 0) {
          try { writeFileSync(marker, version); } catch { /* ignore */ }
          try { unlinkSync(tmpZip); } catch { /* keep zip if delete fails */ }
          wilburLog(`extracted OK → ${dest}`);
          splashProgress(null, null);
        } else {
          wilburLog(`extract exited code=${code}`);
        }
        resolve();
      });
    })().catch((e) => { wilburLog(`unexpected: ${e.message}`); resolve(); });
  });
}

// Wraps ensureUE5Downloaded; if the download fails on first-launch (no
// cached UE5 from a previous successful run), show a user-visible error
// dialog with a Retry button instead of silently continuing into an
// avatar-less app. Subsequent failures (e.g. corrupt cache) are also
// surfaced. The "Continue" button still lets the user use the app without
// the avatar — orchestrator's UE5 spec is critical:false.
async function ensureUE5DownloadedOrPrompt() {
  const dest = join(app.getPath('userData'), 'ue5');
  const stub = join(dest, 'SlovakEdu.exe');
  const logsDir = join(app.getPath('userData'), 'logs');
  // v0.6.4: while-loop instead of recursive self-call. If the network is
  // permanently broken and the user repeatedly hits Retry, the previous
  // recursion grew the JS stack and queued nested promises per attempt. A
  // flat loop keeps memory + stack stable across arbitrary retry counts.
  while (true) {
    // Up to 3 in-flight retries before showing the dialog (transient network).
    for (let attempt = 1; attempt <= 3; attempt++) {
      await ensureUE5Downloaded();
      if (existsSync(stub)) return; // success
      ue5Log(`attempt ${attempt}/3 failed — SlovakEdu.exe not found at ${stub}`);
    }
    // After 3 attempts the splash text already says why; let user decide.
    const result = await dialog.showMessageBox(null, {
      type: 'warning',
      title: 'EduTutor.AI — avatar engine download failed',
      message: 'Couldn\'t download the avatar engine.',
      detail: `The app needs to download the 3D avatar engine (~1.5 GB) on first launch from GitHub. The download failed three times. Likely causes: no internet, firewall, or proxy blocking github.com.\n\nThe rest of the app will still work without the avatar (chat, voice, knowledge base — all functional).\n\nDetailed log: ${join(logsDir, 'ue5-downloader.log')}`,
      buttons: ['Retry download', 'Continue without avatar', 'Quit'],
      defaultId: 0, cancelId: 1, noLink: true,
    }).catch(() => ({ response: 1 }));
    if (result.response === 2) { app.quit(); return new Promise(() => {}); }
    if (result.response !== 0) { // 1 = Continue without avatar (or dialog dismissed)
      ue5Log('user chose: continue without avatar');
      return;
    }
    // response === 0: retry the loop with a fresh 3-attempt batch
    ue5Log('user chose: retry download');
  }
}

function createSplash() {
  // Larger + warmer than the old 460×280 so the cinematic orb has room to breathe.
  splash = new BrowserWindow({
    width: 480, height: 360, frame: false, resizable: false, center: true,
    backgroundColor: '#0b0705', alwaysOnTop: true, skipTaskbar: true,
    icon: join(HERE, 'build', 'icon.ico'),
    // v0.8.0 W7 S8: explicit sandbox/webSecurity defaults. Splash has no
    // preload and loads a local file — sandbox: true is trivially safe here.
    webPreferences: { contextIsolation: true, sandbox: true, webSecurity: true },
  });
  splash.loadFile(join(HERE, 'splash.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, show: false, backgroundColor: '#0d0b09',
    title: 'EduTutor.AI',
    icon: join(HERE, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      // v0.8.0 W7 S8: explicit hardening. sandbox:true is safe because
      // preload.cjs only uses electron's contextBridge (no Node modules);
      // webSecurity:true matches Electron default but pinned explicitly so
      // a future edit can't accidentally regress same-origin enforcement.
      sandbox: true,
      webSecurity: true,
      preload: join(HERE, 'preload.cjs'),
      // v0.6.5: explicit devTools:true so the keyboard shortcut below can
      // actually open the inspector in packaged builds.
      devTools: true,
      // The avatar stream is a localhost WebRTC iframe served by Wilbur (:80).
    },
  });
  mainWindow.loadURL(FRONTEND_URL);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Smooth cinematic handoff: fade the splash body out (520ms CSS transition,
    // see splash.html body.fade-out), then close. Avoids the abrupt cut that
    // made the boot feel rushed.
    if (splash && !splash.isDestroyed()) {
      splash.webContents.executeJavaScript("document.body.classList.add('fade-out')").catch(() => {});
      setTimeout(() => { if (splash && !splash.isDestroyed()) splash.close(); }, 560);
    }
  });
  // v0.6.5: DevTools keyboard shortcuts. Without this, Ctrl+Shift+I and F12 do
  // NOTHING in packaged builds because Menu.setApplicationMenu(null) at boot
  // killed the default accelerators. We need DevTools open during voice-loop
  // testing on test machines so we can capture the console transcript that
  // tells us WHICH suspect is firing. Local-only (per window) — not
  // globalShortcut which would intercept system-wide.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isF12 = input.key === 'F12' && input.type === 'keyDown';
    const isCtrlShiftI =
      (input.control || input.meta) &&
      input.shift &&
      (input.key === 'I' || input.key === 'i') &&
      input.type === 'keyDown';
    if (isF12 || isCtrlShiftI) {
      event.preventDefault();
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
  // External links open in the OS browser, not inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(FRONTEND_URL)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // no default menu bar
  // Tell the orchestrator where the bundled resources live (read-only) and where
  // it may write data/logs (the per-user dir) — packaged builds only.
  if (app.isPackaged) {
    process.env.EDU_RESOURCES = process.resourcesPath;
    process.env.EDU_DATA_DIR = app.getPath('userData');
  }
  createSplash();
  await ensureFrontendExtracted();
  // v0.6.1: extract the pre-baked HuggingFace embedding model cache from
  // read-only Program Files into the writable per-user dir. Same pattern as
  // frontend.tgz. Required because in v0.6.0 we pointed HF_HOME directly at
  // the bundled cache (read-only) — that broke faster-whisper STT which
  // needs to download its whisper-small model to HF_HOME on first mic click.
  // After this extract, HF_HOME = userData/hf-cache (writable): the embedding
  // model is already there (pre-baked), and faster-whisper can download its
  // STT model alongside it.
  await ensureHfCacheExtracted();
  // UE5 ships as a separate ~1.5 GB GitHub release asset (was too big for
  // single-installer NSIS + GitHub 2 GiB cap). First launch downloads it
  // with progress + SHA-256 verification + Content-Range resume on
  // interruption; subsequent launches use the cached extracted UE5.
  // ensureUE5DownloadedOrPrompt() wraps the raw downloader with 3 silent
  // retries + a user-visible error dialog (Retry / Continue / Quit) so
  // failures no longer silently leave the user in an avatar-less app
  // with no explanation — the v0.4.4 regression we're fixing in v0.4.5.
  await ensureUE5DownloadedOrPrompt();
  // Wilbur (PixelStreaming signalling, ~3 MB) ships as wilbur-bundle-<ver>.zip
  // on the same release tag. Tiny enough that we silent-retry without the
  // user-prompt dialog used for the 1.5 GB UE5 zip. Cached at
  // <userData>/wilbur/; orchestrator reads from CONFIG.wilburDir.
  await ensureWilburDownloaded();
  if (!SKIP_STACK) {
    const launcher = getLauncher();
    // Boot progress bar. Each service has a weighted share of the bar reflecting
    // typical-time-to-ready. Backend dominates (torch + chromadb + Windows
    // Defender first-load .pyd scan can take 30-90s on a clean machine). When
    // a service is mid-flight we show its share as indeterminate shimmer;
    // ready/already-running solidifies that share; the next service starts
    // its own. Total progress sums to 1.0 (=100%) when all critical services
    // reach ready. Elapsed time (`Xs`) appended so the user can tell when
    // boot is genuinely slow vs hung.
    // Per-service weight (share of full 0-100% bar) + expected duration in
    // seconds. Bar advances FRACTIONALLY within the active service's share
    // based on elapsed time so it visibly moves during the long backend
    // import phase instead of sitting frozen at 5%. If service finishes
    // earlier than expected the bar snaps to the full share; if it runs
    // longer the bar caps at 95% of the share (saves headroom for the
    // 'ready' jump).
    const BOOT_WEIGHTS    = { ollama: 0.05, backend: 0.60, frontend: 0.15, wilbur: 0.10, ue5: 0.10 };
    const BOOT_EXPECTED_S = { ollama: 1,    backend: 60,   frontend: 5,    wilbur: 3,    ue5: 5    };
    const bootProgress = { done: 0 }; // sum of completed-service weights, 0..1
    const bootStart = Date.now();
    let activeService = null;     // service currently 'starting'
    let activeStartMs = 0;
    let lastServiceLabel = '';
    // 200ms ticker — smooth enough to feel like motion, cheap enough to
    // not eat CPU. Computes fractional progress for the active service.
    const tickInterval = setInterval(() => {
      if (!splash || splash.isDestroyed()) { clearInterval(tickInterval); return; }
      const totalS = Math.round((Date.now() - bootStart) / 1000);
      let ratio = bootProgress.done;
      if (activeService) {
        const share = BOOT_WEIGHTS[activeService] ?? 0;
        const expected = BOOT_EXPECTED_S[activeService] ?? 30;
        const elapsedInService = (Date.now() - activeStartMs) / 1000;
        // Linear fraction of share, capped at 95% (so the final 5% snaps
        // when 'ready' lands — feels like a real handoff, not stuck).
        const frac = Math.min(0.95, elapsedInService / expected);
        ratio = Math.min(1, bootProgress.done + share * frac);
      }
      if (lastServiceLabel) splashProgress(`${lastServiceLabel}  ${totalS}s`, ratio);
    }, 200);
    launcher.on('progress', ({ service, status }) => {
      const label = SVC_LABEL[service] || service;
      const weight = BOOT_WEIGHTS[service] ?? 0;
      const elapsedS = Math.round((Date.now() - bootStart) / 1000);
      if (status === 'starting' || status === 'restarting') {
        activeService = service;
        activeStartMs = Date.now();
        lastServiceLabel = `${label}…`;
        splashProgress(`${lastServiceLabel}  ${elapsedS}s`, bootProgress.done);
      } else if (status === 'ready' || status === 'already-running') {
        bootProgress.done = Math.min(1, bootProgress.done + weight);
        activeService = null;
        lastServiceLabel = `${label} ✓`;
        splashProgress(`${lastServiceLabel}  ${elapsedS}s`, bootProgress.done);
      } else if (status === 'failed') {
        activeService = null;
        lastServiceLabel = `${label} ✗`;
        splashProgress(`${lastServiceLabel}  ${elapsedS}s`, bootProgress.done);
      }
      if (bootProgress.done >= 0.99) {
        clearInterval(tickInterval);
        splashProgress(`hotovo  ${elapsedS}s`, 1);
      }
    });
    // When a critical service crashes 5× and the orchestrator gives up, show a
    // fatal dialog pointing at the log file instead of silently opening a
    // window the user will perceive as "broken." This was the missing UX
    // signal that made the v0.4.1-3 idna-missing crash so hard to diagnose:
    // the app launched, the frontend rendered, but every API request 500'd.
    // Path matches orchestrator.mjs initLogDir resolution.
    launcher.on('service-failed', ({ service }) => {
      if (service !== 'backend') return; // frontend/wilbur are recoverable for UE5-less use
      const logsDir = join(app.getPath('userData'), 'logs');
      const backendLog = join(logsDir, 'backend.log');
      // Replace splash with an actual error window; don't open the main app.
      try { if (splash && !splash.isDestroyed()) splash.close(); } catch { /* ignore */ }
      dialog.showMessageBox(null, {
        type: 'error',
        title: 'EduTutor.AI — backend failed to start',
        message: 'The local backend crashed 5× in a row and was given up on.',
        detail: `The frontend will not work without it. The Python process probably crashed during import — usually a missing dependency or a port collision.\n\nDiagnostic logs:\n  ${backendLog}\n  ${join(logsDir, 'launcher.log')}\n\nClick "Open log folder" below, then send backend.log to support.`,
        buttons: ['Open log folder', 'Quit'],
        defaultId: 0, cancelId: 1, noLink: true,
      }).then(({ response }) => {
        if (response === 0) shell.openPath(logsDir).catch(() => {});
        app.quit();
      }).catch(() => app.quit());
    });
    try {
      await launcher.start();
    } catch (e) {
      console.error('[launcher] stack failed to start:', e);
      // still open the window so the user sees an error state from the frontend
    }
  }
  createMainWindow();
});

// Quit fully (and tear the stack down) when the window closes.
app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => {
  if (quitting) return;
  quitting = true;
  if (!SKIP_STACK) shutdownAll();
});
