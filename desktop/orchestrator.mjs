#!/usr/bin/env node
/**
 * EduTutor.AI — supervised stack orchestrator (the desktop launcher "brain").
 *
 * Shell-agnostic: run standalone (`node orchestrator.mjs`), import it from an
 * Electron main process, or spawn it as a sidecar. Brings up the five processes
 * in order with health checks, **auto-restarts** any that crash (backoff + cap),
 * logs everything to files, emits boot-progress events, and tears the whole
 * stack down on exit.
 *
 *   node orchestrator.mjs           # start the whole stack
 *   node orchestrator.mjs --check   # report status only; spawn nothing
 *
 * Paths differ between dev and a packaged install — edit CONFIG below or drop a
 * launcher.config.json next to this file to override any field.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { EventEmitter } from 'node:events';
import http from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));

// v0.8.0 W7 S6: env-var allowlist for spawned children. Previously every
// child (Ollama, backend, frontend, Wilbur) inherited the full parent env
// via `...process.env`, which silently leaked the developer's AWS keys,
// npm tokens, GH_TOKEN, etc into long-lived subprocesses. Now we pass only
// the minimal set each child legitimately needs. LLM API keys are loaded
// by the backend from tutor-service/.env (or EDU_ENV_FILE) via python-dotenv,
// NOT from the parent process env — so they intentionally do NOT propagate.
function _filteredEnv() {
  const ALLOW = [
    // OS / system basics — Windows + Unix
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP',
    'USERPROFILE', 'USERNAME', 'COMPUTERNAME', 'HOMEDRIVE', 'HOMEPATH',
    'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
    'HOME', 'USER', 'LANG', 'LC_ALL', 'TZ',
    'COMSPEC', 'OS', 'PROCESSOR_ARCHITECTURE',
    // Tooling
    'PYTHONIOENCODING', 'PYTHONUNBUFFERED', 'PYTHONPATH',
    'NODE_ENV', 'NODE_OPTIONS',
    // EduTutor-specific
    'EDU_DEV_MODE', 'EDU_DEV_AVATAR_DEBUG',
    'OLLAMA_MODELS', 'OLLAMA_HOST',
    'EDU_UE5_AUDIO',
    'EDU_AVATAR_BROADCAST_DEADLINE_MS', 'UE5_BROADCAST_DELAY_MS',
    'EDU_VISEME_COARTICULATION_MS', 'EDU_VISEME_FRAME_STEP_MS',
    'HF_HOME', 'TRANSFORMERS_CACHE', 'HF_HUB_DOWNLOAD_TIMEOUT',
    'EDUTUTOR_BACKEND_PORT', 'EDUTUTOR_FRONTEND_PORT', 'EDUTUTOR_OLLAMA_PORT',
  ];
  const out = {};
  for (const k of ALLOW) {
    if (process.env[k] !== undefined) out[k] = process.env[k];
  }
  return out;
}

// ── Config (dev defaults for this machine; override via launcher.config.json) ──
const DEFAULTS = {
  repo:        'C:/Users/kindl/edotutor-test',                 // backend + frontend
  ue5Clone:    'C:/Users/kindl/edotutor-ue5-latest',           // holds the vendored Wilbur
  ollamaExe:   join(process.env.LOCALAPPDATA || '', 'Programs/Ollama/ollama.exe'),
  ollamaModel: 'gemma3:12b',
  frontendMode: 'dev',          // 'dev' = pnpm dev | 'standalone' = node .next/standalone/server.js
  ue5Audio:    false,           // EDU_UE5_AUDIO — KEEP OFF until Martin's RAI Blueprint ships
                                // (ON without the UE5 side = silent avatar + no visemes).
  // UE5 avatar — run the LATEST source project via the engine. The avatar work
  // lives in edotutor-ue5-latest\EdutorUE; the old Downloads packaged build is
  // STALE. A cooked SlovakEdu.exe (ue5Exe / Downloads scan) is only a fallback.
  engineExe:   'D:/Program Files/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor.exe',
  ue5Project:  'C:/Users/kindl/edotutor-ue5-latest/EdutorUE/SlovakEdu.uproject',
  ue5Headless: true,            // -RenderOffscreen (one-app, no UE window). false = -windowed.
  // Cooked build — launch the ROOT stub (Windows/SlovakEdu.exe), NOT the inner
  // Binaries/Win64 exe. The stub sets up the staging environment and stays alive
  // as the parent; launching the inner exe directly makes it exit ~20s in (→ churn).
  ue5Exe:      'C:/Users/kindl/Downloads/Edutor0530/Windows/SlovakEdu.exe',
  ue5SearchDir: join(process.env.USERPROFILE || 'C:/Users/kindl', 'Downloads'), // fallback scan
  logDir:      null,            // defaults to <here>/logs
  ports: { backend: 8000, frontend: 3000, wilburPlayer: 80, wilburStreamer: 8888, ollama: 11434 },
};
const cfgPath = join(HERE, 'launcher.config.json');
const CONFIG = { ...DEFAULTS, ...(existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {}) };

const CHECK_ONLY = process.argv.includes('--check');
// LOG_DIR is resolved lazily by the Launcher constructor. In a packaged install
// <here> is inside a read-only asar, so logs must go to the per-user data dir
// (EDU_DATA_DIR) — which main.mjs only sets after this module is imported.
let LOG_DIR = null;
function initLogDir(dir) {
  LOG_DIR = dir;
  if (!CHECK_ONLY) { try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* read-only / ignore */ } }
}

// ── logging (console + launcher.log) ──
const ts = () => new Date().toISOString().slice(11, 19);
let launcherFd = null;
function fileLog(line) {
  if (CHECK_ONLY || !LOG_DIR) return;
  try {
    if (launcherFd === null) launcherFd = openSync(join(LOG_DIR, 'launcher.log'), 'a');
    writeSync(launcherFd, line + '\n');
  } catch { /* ignore */ }
}
const log  = (svc, msg) => { const l = `[${ts()}] ${String(svc).padEnd(9)} ${msg}`; console.log(l); fileLog(`${new Date().toISOString()} INFO  ${svc} ${msg}`); };
const warn = (svc, msg) => { const l = `[${ts()}] ${String(svc).padEnd(9)} ! ${msg}`; console.warn(l); fileLog(`${new Date().toISOString()} WARN  ${svc} ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── net / health helpers ──
// Dual-stack port probe — uvicorn binds `::` which is IPv6-only on Windows, so
// a pure IPv4 check would miss it and trigger the "spawn a duplicate backend"
// cascade (port conflict → crash loop). Returns true if EITHER stack answers.
function portListening(port) {
  const probe = (host) => new Promise((r) => {
    const s = createConnection({ port, host });
    s.once('connect', () => { s.destroy(); r(true); });
    s.once('error', () => r(false));
    s.setTimeout(700, () => { s.destroy(); r(false); });
  });
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([v4, v6]) => v4 || v6);
}
async function waitForPort(port, label, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await portListening(port)) { log(label, `listening on :${port}`); return true; }
    await sleep(1000);
  }
  warn(label, `did not bind :${port} within ${timeoutMs / 1000}s`);
  return false;
}
// Same dual-stack story for HTTP health checks — try IPv4 first, then IPv6.
// Default timeout 5s — /api/v1/health does a provider probe internally that
// can take 2-3s on first call (Ollama detection + auto-pick model), and v0.6.0
// the 2s default caused every poll to fail → orchestrator waited the full
// 240s timeout even though backend was actually up at ~60s.
function httpOk(url, timeoutMs = 5000) {
  const tryUrl = (u) => new Promise((res) => {
    const req = http.get(u, (r) => { r.resume(); res(r.statusCode >= 200 && r.statusCode < 500); });
    req.on('error', () => res(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); res(false); });
  });
  return tryUrl(url).then((ok) => {
    if (ok) return true;
    const v6 = url.replace('://127.0.0.1', '://[::1]').replace('://localhost', '://[::1]');
    return v6 === url ? false : tryUrl(v6);
  });
}
async function httpReady(url, label, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await httpOk(url)) { log(label, 'health OK'); return true; }
    await sleep(1500);
  }
  warn(label, 'health check timed out');
  return false;
}

// GET a JSON endpoint and return the parsed body (or null on any failure).
// Used by the UE5 connection self-heal to poll /api/v1/avatar/status.
function httpJson(url, timeoutMs = 2000) {
  return new Promise((res) => {
    const req = http.get(url, (r) => {
      let body = '';
      r.on('data', (c) => { body += c; });
      r.on('end', () => { try { res(JSON.parse(body)); } catch { res(null); } });
    });
    req.on('error', () => res(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); res(null); });
  });
}

// Poll /api/v1/avatar/status for up to timeoutMs waiting for UE5 to subscribe
// to /ws/avatar. The BP's Create Websocket node fires exactly once at
// BeginPlay and never retries — if that single attempt loses a TCP race
// against backend startup, UE5 runs but lipsync never works (visemes are
// broadcast to zero clients). Returns true once at least one client
// connects, false if the timeout expires.
async function waitForAvatarConnection(port, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const status = await httpJson(`http://127.0.0.1:${port}/api/v1/avatar/status`);
    if (status && status.clients > 0) {
      log('ue5', `avatar WS connected (clients=${status.clients})`);
      return true;
    }
    await sleep(2000);
  }
  return false;
}

// ── locate newest UE5 build (mirrors Start-EduTutor-Dev.ps1's Downloads scan) ──
function findExe(dir, name, depth) {
  if (depth < 0 || !existsSync(dir)) return null;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) { const f = findExe(join(dir, e.name), name, depth - 1); if (f) return f; }
  }
  return null;
}
function findUE5() {
  if (CONFIG.ue5Exe && existsSync(CONFIG.ue5Exe)) return CONFIG.ue5Exe;
  const root = CONFIG.ue5SearchDir;
  if (!existsSync(root)) return null;
  let best = null;
  for (const d of readdirSync(root)) {
    if (!/^(Edutor|SlovakEdu|EduTutor)/i.test(d)) continue;
    const hit = findExe(join(root, d), 'SlovakEdu.exe', 3);
    if (hit) { const m = statSync(hit).mtimeMs; if (!best || m > best.m) best = { exe: hit, m }; }
  }
  return best ? best.exe : null;
}

/**
 * Supervised launcher. Emits:
 *   'progress' {service, status}  status: starting|ready|already-running|skipped|restarting|failed
 *   'ready'                       all services up
 *   'service-failed' {service}    gave up restarting a service
 */
class Launcher extends EventEmitter {
  constructor() {
    super();
    this.shuttingDown = false;
    this.procs = new Map(); // name -> { proc, attempts, windowStart, intentional }
    this.packaged = false;
    this.dataDir = null;
    // v0.6.4: track every restart / dependent-bounce setTimeout so stop()
    // can clear them. A late-firing timer after Electron started quitting
    // would spawn an orphaned child process that no kill handler will reap.
    this._pendingTimers = new Set();
    this._resolvePaths();
    initLogDir(CONFIG.logDir || (this.dataDir ? join(this.dataDir, 'logs') : join(HERE, 'logs')));
    // First line written — makes "where are my logs?" trivial to answer for
    // any future user diag run. Console + file so it surfaces in both.
    log('launcher', `boot @ ${new Date().toISOString()}  logs=${LOG_DIR}  dataDir=${this.dataDir || '(none)'}  packaged=${this.packaged}`);
    this.specs = this._buildSpecs();
  }

  // Resolve component paths for dev vs packaged. In a packaged Electron app
  // main.mjs sets EDU_RESOURCES = process.resourcesPath; the bundle mirrors:
  //   <res>/backend/python/python.exe + <res>/backend (FastAPI app)
  //   <res>/frontend (Next standalone, server.js)
  //   <res>/wilbur (wilbur.bundle.cjs + www)
  //   <res>/ue5/SlovakEdu.exe (cooked avatar root stub)
  _resolvePaths() {
    const RES = process.env.EDU_RESOURCES;
    this.packaged = !!RES;
    // Writable data root (SQLite DB, Chroma vectors, logs). A packaged install
    // lives under read-only Program Files, so writes go to the per-user dir that
    // main.mjs passes as EDU_DATA_DIR (Electron app.getPath('userData')).
    this.dataDir = process.env.EDU_DATA_DIR || (RES ? join(homedir(), '.edututor') : null);
    if (RES) {
      CONFIG.backendDir = join(RES, 'backend');
      CONFIG.pythonExe = join(RES, 'backend', 'python', 'python.exe');
      // Frontend ships as frontend.tgz (electron-builder mangles a loose
      // node_modules/.next dir); main.mjs extracts it here on first launch.
      CONFIG.frontendDir = join(this.dataDir, 'frontend');
      // Ollama is bundled (CPU-only runtimes) so the app truly works on a
      // clean machine without any external install. Models persist in the
      // per-user data dir (writable, survives app upgrades).
      CONFIG.ollamaExe = join(RES, 'ollama', 'ollama.exe');
      CONFIG.ollamaModelsDir = join(this.dataDir, 'ollama-models');
      // Prefer the per-user downloaded copy (ensureWilburDownloaded in main.mjs)
      // and fall back to the resources copy from electron-builder for backward
      // compat with builds that pre-stage Wilbur via stage-resources.mjs.
      CONFIG.wilburDir = existsSync(join(this.dataDir, 'wilbur', 'wilbur.bundle.cjs'))
        ? join(this.dataDir, 'wilbur')
        : join(RES, 'wilbur');
      // UE5 ships separately as ue5-engine-<version>.zip (too large for the
      // single-installer pipeline) and is downloaded/extracted by
      // ensureUE5Downloaded() in main.mjs on first launch. It lands in the
      // writable per-user data dir, same pattern as the frontend.
      CONFIG.ue5Exe = join(this.dataDir, 'ue5', 'SlovakEdu.exe');
      CONFIG.frontendMode = 'standalone';
      log('launcher', `packaged mode — resources at ${RES}`);
    } else {
      CONFIG.backendDir = join(CONFIG.repo, 'tutor-service');
      CONFIG.pythonExe = join(CONFIG.backendDir, '.venv', 'Scripts', 'python.exe');
      CONFIG.frontendDir = join(CONFIG.repo, 'core');
      // Dev mode: prefer sibling UE5 clone (team workflow); otherwise fall back
      // to the per-user downloaded copy from ensureWilburDownloaded() so a
      // fresh sandbox contributor with no UE5 clone can still run avatar mode.
      CONFIG.wilburDir = existsSync(join(CONFIG.ue5Clone, 'EdutorUE', 'PixelStreaming', 'SignallingWebServer', 'wilbur.bundle.cjs'))
        ? join(CONFIG.ue5Clone, 'EdutorUE', 'PixelStreaming', 'SignallingWebServer')
        : join(homedir(), '.edututor', 'wilbur');
    }
  }

  // Run a Node script. Packaged apps have no system Node, so use Electron's own
  // binary as Node (ELECTRON_RUN_AS_NODE); in dev use plain `node`.
  _spawnNode(name, scriptArgs, opts = {}) {
    if (this.packaged) {
      // v0.8.0 W7 S6: if caller already passed a curated env (e.g. frontend
      // spec built from _filteredEnv() above), preserve it; otherwise build
      // a fresh filtered env. Never spread raw process.env.
      return this._spawn(name, process.execPath, scriptArgs, { ...opts, env: { ...(opts.env || _filteredEnv()), ELECTRON_RUN_AS_NODE: '1' } });
    }
    return this._spawn(name, 'node', scriptArgs, opts);
  }

  _buildSpecs() {
    const P = CONFIG.ports;
    return [
      { name: 'ollama', critical: false, skipPort: P.ollama,
        spawn: () => {
          if (!existsSync(CONFIG.ollamaExe)) { warn('ollama', `exe not found at ${CONFIG.ollamaExe}`); return null; }
          const env = _filteredEnv();
          if (this.packaged && CONFIG.ollamaModelsDir) {
            // Bundled Ollama stores its models under the per-user data dir so
            // the install dir stays read-only and pulled models survive app
            // upgrades. Pulled models from FirstRunSetup land here.
            try { mkdirSync(CONFIG.ollamaModelsDir, { recursive: true }); } catch { /* ignore */ }
            env.OLLAMA_MODELS = CONFIG.ollamaModelsDir;
          }
          return this._spawn('ollama', CONFIG.ollamaExe, ['serve'], { env });
        },
        ready: () => waitForPort(P.ollama, 'ollama', 30000) },
      { name: 'backend', critical: true, skipPort: P.backend, dependents: ['ue5'],
        spawn: () => {
          const env = _filteredEnv();
          if (CONFIG.ue5Audio) env.EDU_UE5_AUDIO = '1';
          if (this.packaged) {
            env.LIPSYNC_PROVIDER = env.LIPSYNC_PROVIDER || 'text'; // lean backend = no torch
            // Redirect writable stores out of read-only Program Files. The
            // backend defaults these to ./data/* relative to its (read-only) cwd.
            const dataRoot = join(this.dataDir, 'data');
            try { mkdirSync(dataRoot, { recursive: true }); } catch { /* ignore */ }
            env.SQLITE_PATH = env.SQLITE_PATH || join(dataRoot, 'edututor.db');
            env.CHROMA_PERSIST_PATH = env.CHROMA_PERSIST_PATH || join(dataRoot, 'chroma');
            // User-entered API keys persist here (read-only Program Files .env can't).
            env.EDU_ENV_FILE = env.EDU_ENV_FILE || join(this.dataDir, '.env');
            // HuggingFace cache strategy (v0.6.0):
            //
            // The chromadb embedding model (paraphrase-multilingual-MiniLM-
            // L12-v2, ~458 MB) is PRE-BAKED into the installer at
            // <RES>/backend/hf-cache. Without this, SentenceTransformer
            // makes 30+ HEAD requests to huggingface.co at every backend
            // start — diagnosed as the 4-min boot bug that broke v0.5.x
            // installs. Setting HF_HOME at the bundled cache + the
            // HF_HUB_OFFLINE flag forces it to read the snapshot locally
            // with zero network round-trips.
            //
            // faster-whisper STT also lives in HF_HOME but auto-downloads
            // its smaller (~145 MB) model on first mic click — that one
            // we don't pre-bake (less critical, slower install). The
            // whisper download goes to the same HF_HOME, into a
            // different snapshot dir, so they coexist.
            // v0.6.2: HF_HOME points at the WRITABLE per-user dir, same path
            // v0.5.6 used. ensureHfCacheExtracted() in main.mjs copies the
            // bundled embedding cache here on first launch — fast SentenceTransformer
            // load with no network. faster-whisper can also download its STT
            // model alongside. No OFFLINE flags — those broke v0.6.0.
            // Returning to v0.5.6 behavior PLUS the pre-baked embedding cache.
            env.HF_HOME = join(this.dataDir, 'hf-cache');
            try { mkdirSync(env.HF_HOME, { recursive: true }); } catch { /* ignore */ }
          }
          return this._spawn('backend', CONFIG.pythonExe, ['run_dev.py'], { cwd: CONFIG.backendDir, env });
        },
        // 90s wasn't enough on clean Windows: backend's torch + chromadb +
        // transformers imports + Windows Defender first-load .pyd scan can
        // hit 2+ minutes. v0.5.1 user reported the orchestrator was timing
        // out at 91s and continuing to spawn UE5 before the backend was
        // up — UE5's single-shot Create Websocket then lost the race
        // against a still-booting backend, exactly the lipsync failure
        // pattern. Bumped to 240s (4 min) which covers worst-case
        // antivirus + cold disk scenarios.
        ready: () => httpReady(`http://127.0.0.1:${P.backend}/api/v1/health`, 'backend', 240000) },
      { name: 'frontend', critical: true, skipPort: P.frontend,
        spawn: () => {
          if (CONFIG.frontendMode === 'standalone') {
            // Next standalone: server.js at <frontendDir>/server.js, run via Electron-as-node.
            return this._spawnNode('frontend', [join(CONFIG.frontendDir, 'server.js')],
              { cwd: CONFIG.frontendDir, env: { ..._filteredEnv(), PORT: String(P.frontend), HOSTNAME: '127.0.0.1' } });
          }
          return this._spawn('frontend', 'pnpm', ['dev'], { cwd: CONFIG.frontendDir, shell: true });
        },
        ready: () => waitForPort(P.frontend, 'frontend', 90000) },
      { name: 'wilbur', critical: true, skipPort: P.wilburStreamer,
        spawn: () => {
          const dir = CONFIG.wilburDir;
          const bundle = join(dir, 'wilbur.bundle.cjs');
          if (!existsSync(bundle)) { warn('wilbur', `vendored bundle not found at ${bundle}`); return null; }
          return this._spawnNode('wilbur', [bundle, '--serve', '--console_messages', 'verbose', `--http_root=${join(dir, 'www')}`], { cwd: dir });
        },
        ready: async () => { await waitForPort(P.wilburStreamer, 'wilbur', 30000); await waitForPort(P.wilburPlayer, 'wilbur-web', 15000); } },
      { name: 'ue5', critical: false, noSkip: true, noRestart: true, // packaged build (root stub + inner game = 2 processes) is self-stable; supervising it churns the process model + backend-dependency bounce
        selfHealConnection: true, // poll /api/v1/avatar/status; if no clients, kill+respawn once
        spawn: () => {
          // v0.7.2: pre-spawn cleanup. UE5 cooked builds run as a stub
          // (SlovakEdu.exe) + an inner Game (SlovakEdu-Win64-Shipping.exe).
          // If the user installed/relaunched without going through stop(),
          // leftover inner games persist as detached processes that each
          // still connect to Wilbur as a streamer (default name).
          // Wilbur auto-suffixes duplicate IDs → DefaultStreamer, _1, _2, _3.
          // The frontend iframe is hard-coded to subscribe to "DefaultStreamer"
          // which then ends up bound to a zombie that has no render target,
          // so SDP/ICE completes but no H264 frames flow → user sees no avatar.
          // Pre-spawn taskkill of BOTH the stub and the inner game binary
          // (taskkill /T does not reach the inner game once its parent stub
          // dies, hence the inner name needs an explicit /IM).
          if (process.platform === 'win32') {
            for (const img of ['SlovakEdu.exe', 'SlovakEdu-Win64-Shipping.exe']) {
              try { spawnSync('taskkill', ['/IM', img, '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* not running */ }
            }
          }
          const exec = '-ExecCmds=r.BloomQuality 0, r.DepthOfFieldQuality 0, r.MotionBlurQuality 0, DisableAllScreenMessages, PixelStreaming.Encoder.MaxQP 18, PixelStreaming.WebRTC.MaxBitrate 100000000, PixelStreaming.WebRTC.Fps 60';
          // v0.7.5: -NoSound replaces -AudioMixer. UE5 has no audio sink
          // anymore, so PixelStreaming's WebRTC media stream carries video
          // only — no audio track. Eliminates a real source of the user-
          // reported "2 audios start at TTS" symptom: UE5's AudioMixer (even
          // when not playing TTS) emits ambient sound bus output via the
          // PixelStreaming audio track, browser plays it in parallel with
          // its own SSE MSE TTS = dual. Coupled with the backend hard-disable
          // of EDU_UE5_AUDIO this guarantees the browser is the sole audio
          // sink. Reactivate -AudioMixer when Martin's UE5 audio Blueprint
          // ships and we explicitly route TTS through UE5.
          const flags = [
            `-PixelStreamingURL=ws://127.0.0.1:${P.wilburStreamer}`,
            CONFIG.ue5Headless ? '-RenderOffscreen' : '-windowed',
            '-NoSound', '-ResX=1920', '-ResY=1080', exec,
          ];
          // Preferred: a cooked packaged build — clean single process, cooked
          // shaders (no on-the-fly recompile), so it's fast AND supervisable.
          // Packaged installs use ONLY the bundled exe (never scan the user's
          // Downloads — that dev convenience would be wrong on a clean machine).
          const cooked = (CONFIG.ue5Exe && existsSync(CONFIG.ue5Exe)) ? CONFIG.ue5Exe : (this.packaged ? null : findUE5());
          if (cooked && existsSync(cooked)) { log('ue5', `cooked build ${cooked}`); return this._spawn('ue5', cooked, flags); }
          // Fallback (dev only): the source project via the editor — recompiles shaders.
          if (CONFIG.ue5Project && existsSync(CONFIG.ue5Project) && existsSync(CONFIG.engineExe)) {
            log('ue5', `editor + project ${CONFIG.ue5Project} (no cooked build)`);
            return this._spawn('ue5', CONFIG.engineExe, [CONFIG.ue5Project, '-game', ...flags]);
          }
          warn('ue5', 'no cooked build and no editor project found'); return null;
        },
        ready: () => sleep(3000) },
    ];
  }

  _spawn(name, cmd, args, opts = {}) {
    log(name, `spawn: ${cmd} ${args.join(' ').slice(0, 120)}`);
    let stdio = 'ignore';
    try { const fd = openSync(join(LOG_DIR, `${name}.log`), 'a'); stdio = ['ignore', fd, fd]; } catch { /* fall back to ignore */ }
    return spawn(cmd, args, { windowsHide: true, ...opts, stdio });
  }

  async _startService(spec, isRestart = false) {
    if (CHECK_ONLY) {
      if (spec.name === 'ue5') {
        const cooked = (CONFIG.ue5Exe && existsSync(CONFIG.ue5Exe)) ? CONFIG.ue5Exe : findUE5();
        if (cooked && existsSync(cooked)) log('ue5', `would launch cooked ${cooked}`);
        else if (CONFIG.ue5Project && existsSync(CONFIG.ue5Project)) log('ue5', `would launch editor + ${CONFIG.ue5Project}`);
        else warn('ue5', 'no cooked build or project found');
        return;
      }
      const up = spec.skipPort ? await portListening(spec.skipPort) : false;
      up ? log(spec.name, 'already running') : warn(spec.name, 'not running (would start)');
      return;
    }
    if (!isRestart && spec.skipPort && await portListening(spec.skipPort)) {
      log(spec.name, 'already running'); this.emit('progress', { service: spec.name, status: 'already-running' }); return;
    }
    this.emit('progress', { service: spec.name, status: isRestart ? 'restarting' : 'starting' });
    const proc = spec.spawn();
    if (!proc) { this.emit('progress', { service: spec.name, status: 'skipped' }); return; }
    const rec = this.procs.get(spec.name) || { attempts: 0, windowStart: Date.now() };
    rec.proc = proc; rec.intentional = false;
    this.procs.set(spec.name, rec);
    proc.on('exit', (code) => this._onExit(spec, rec, code));
    if (spec.ready) await spec.ready();

    // UE5 connection self-heal. The cooked Blueprint's Edutor_AgentConnection
    // calls Create Websocket exactly once at BeginPlay; on a TCP race
    // against backend startup (or any transient hiccup) the single attempt
    // fails and the BP never retries. Audit by user 2026-05-29: relaunching
    // UE5 made it work. Mitigation: after the initial ready delay, poll
    // /api/v1/avatar/status; if no clients connected within 20s, kill UE5
    // and respawn it. Most races self-heal on the second attempt.
    // (Proper fix is BP-side Delay 2s -> Retry, tracked separately.)
    if (spec.selfHealConnection && !isRestart) {
      const ok = await waitForAvatarConnection(CONFIG.ports.backend, 20000);
      if (!ok) {
        warn(spec.name, 'avatar WS never subscribed in 20s — single-shot BP connect lost the race; respawning once');
        rec.intentional = true;
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
        await sleep(2000);
        // Also kill the inner SlovakEdu game process (cooked builds spawn a
        // stub + an inner Game — the stub is what `proc` tracks).
        // v0.7.2: include SlovakEdu-Win64-Shipping.exe explicitly. After the
        // stub dies the inner game becomes orphaned and `taskkill /T` no
        // longer reaches it through the (now broken) parent tree.
        if (process.platform === 'win32') {
          for (const img of ['SlovakEdu.exe', 'SlovakEdu-Win64-Shipping.exe']) {
            try { spawnSync('taskkill', ['/IM', img, '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* not running */ }
          }
        }
        await sleep(1000);
        log(spec.name, 'self-heal: respawning UE5');
        const proc2 = spec.spawn();
        if (proc2) {
          rec.proc = proc2; rec.intentional = false;
          proc2.on('exit', (code) => this._onExit(spec, rec, code));
          if (spec.ready) await spec.ready();
          const ok2 = await waitForAvatarConnection(CONFIG.ports.backend, 20000);
          if (ok2) log(spec.name, 'self-heal: avatar WS connected on second attempt');
          else warn(spec.name, 'self-heal: still no avatar WS after second spawn — app continues without lipsync');
        } else {
          // v0.6.4: when respawn returns null (UE5 binary missing / user deleted
          // <userData>/ue5/), drop the tracker entry so the mid-session monitor's
          // "no UE5 rec/proc tracked" branch takes over and keeps trying fresh
          // spawns once the file is restored.
          warn(spec.name, 'self-heal: respawn returned no proc — clearing tracker so monitor can retry');
          this.procs.delete('ue5');
        }
      }
    }

    this.emit('progress', { service: spec.name, status: 'ready' });
    if (isRestart && spec.dependents) for (const d of spec.dependents) this._restartDependent(d);
  }

  _onExit(spec, rec, code) {
    log(spec.name, `exited (code ${code})`);
    if (this.shuttingDown || rec.intentional || spec.noRestart) return;
    const now = Date.now();
    if (now - rec.windowStart > 60000) { rec.attempts = 0; rec.windowStart = now; }
    rec.attempts++;
    const MAX = 5;
    if (rec.attempts > MAX) {
      warn(spec.name, `crashed ${rec.attempts}× in <60s — giving up`);
      this.emit('progress', { service: spec.name, status: 'failed' });
      this.emit('service-failed', { service: spec.name });
      return;
    }
    const backoff = Math.min(1000 * 2 ** (rec.attempts - 1), 15000);
    warn(spec.name, `crashed — restart ${rec.attempts}/${MAX} in ${backoff}ms`);
    // v0.6.4: track pending restart timers so stop() can clear them. Without
    // this, if app shuts down during the backoff window the timer fires
    // post-quit, spawns an orphaned child process that no kill handler will
    // ever clean up (Electron has already exited by the time the spawn
    // completes registering).
    const tid = setTimeout(() => {
      this._pendingTimers.delete(tid);
      if (!this.shuttingDown) this._startService(spec, true).catch((e) => warn(spec.name, e.message));
    }, backoff);
    this._pendingTimers.add(tid);
  }

  // When a dependency (e.g. backend) restarts, bounce its dependents so they
  // reconnect — UE5 does not auto-reconnect to /ws/avatar after a backend restart.
  // v0.6.3: spec.noRestart used to short-circuit this — but noRestart means
  // "don't auto-restart on the dependent's OWN crash" (because the inner UE5
  // process is self-stable), NOT "never restart for any reason." A backend
  // bounce always invalidates UE5's single-shot WebSocket; we must bounce UE5
  // here regardless of noRestart. Without this, every backend crash leaves
  // clients=0 forever and the user sees a frozen avatar (no visemes).
  _restartDependent(name) {
    const spec = this.specs.find((s) => s.name === name);
    const rec = this.procs.get(name);
    if (!spec || !rec || !rec.proc) return;
    log(name, 'bouncing (dependency restarted)');
    rec.intentional = true;
    this._kill(rec.proc);
    // Belt-and-suspenders for UE5 cooked builds: also kill the inner game proc.
    if (process.platform === 'win32' && name === 'ue5') {
      // v0.7.2: kill both stub and inner game so the bounce produces a clean
      // streamer registration (no zombie inner game holding DefaultStreamer).
      for (const img of ['SlovakEdu.exe', 'SlovakEdu-Win64-Shipping.exe']) {
        try { spawnSync('taskkill', ['/IM', img, '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* ignore */ }
      }
    }
    // v0.6.4: track pending bounce timer so stop() can clear it (same reason
    // as the auto-restart timer in _onExit); also re-check shuttingDown in
    // the callback so a late-firing timer doesn't spawn a doomed child.
    const tid = setTimeout(() => {
      this._pendingTimers.delete(tid);
      if (this.shuttingDown) return;
      rec.intentional = false;
      this._startService(spec, true).catch((e) => warn(name, e.message));
    }, 2000);
    this._pendingTimers.add(tid);
  }

  _kill(proc) {
    if (!proc || !proc.pid) return;
    try {
      // Synchronous so the kill completes before the app process exits.
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else proc.kill('SIGTERM');
    } catch { /* ignore */ }
  }

  async start() {
    log('launcher', CHECK_ONLY ? '── status check (spawns nothing) ──' : '── starting EduTutor stack ──');
    log('launcher', `repo=${CONFIG.repo} ue5Audio=${CONFIG.ue5Audio} frontend=${CONFIG.frontendMode} logs=${LOG_DIR}`);
    // backend → frontend → wilbur → ue5 (ollama first); ollama+backend can warm in parallel-ish but order is fine.
    // v0.6.3: per-spec try/catch so a hang or throw in one service (typically the
    // UE5 self-heal block on a connection race) cannot prevent emit('ready') or
    // the mid-session monitor from starting. v0.6.2 logs from a real run showed
    // the loop completing through `ue5 spawn` but never logging `launcher ready`
    // — symptom of `_startService(ue5)` getting wedged. The monitor then never
    // started, and clients=0 persisted forever after any backend bounce.
    for (const spec of this.specs) {
      try {
        await this._startService(spec);
        log('launcher', `${spec.name} startService completed`);
      } catch (e) {
        warn(spec.name, `startService threw: ${e && e.stack ? e.stack.split('\n')[0] : String(e)} — continuing`);
      }
    }
    this.emit('ready');
    log('launcher', `ready → http://127.0.0.1:${CONFIG.ports.frontend}`);
    if (CHECK_ONLY) process.exit(0);
    // v0.6.1: continuous UE5 mid-session monitor. The cooked SlovakEdu BP's
    // Create Websocket is one-shot at BeginPlay — if backend restarts or any
    // transient hiccup drops the connection, UE5 NEVER reconnects on its own
    // and clients=0 persists for the rest of the session. v0.5.1 added a
    // boot-time self-heal but only ran once. Now we poll forever and
    // respawn UE5 whenever clients=0 while backend is up and UE5 process is
    // supposed to be alive. Re-uses the same kill+respawn machinery as the
    // boot self-heal. Polling at 5s — fast enough to feel like an
    // instant reconnect but cheap.
    log('ue5-monitor', 'starting mid-session UE5 reconnect monitor (poll /avatar/status every 5s)');
    this._startUE5MidSessionMonitor();
  }

  _startUE5MidSessionMonitor() {
    if (this.ue5Monitor) { log('ue5-monitor', 'already started — skip'); return; }
    const ue5Spec = this.specs.find((s) => s.name === 'ue5');
    if (!ue5Spec) { warn('ue5-monitor', 'no ue5 spec found in this.specs — monitor will not run'); return; }
    let lastRespawnMs = 0;
    let consecutiveZero = 0;
    let pollCount = 0;
    this.ue5Monitor = setInterval(async () => {
      pollCount++;
      if (this.shuttingDown) return;
      const ue5Rec = this.procs.get('ue5');
      // v0.6.3: if UE5 was never registered (boot may have hit a race), still
      // attempt to spawn it so the monitor recovers a fully missing avatar.
      if (!ue5Rec || !ue5Rec.proc) {
        if (pollCount % 12 === 1) log('ue5-monitor', `no UE5 rec/proc tracked — attempting fresh spawn (poll #${pollCount})`);
        const fresh = ue5Spec.spawn();
        if (fresh) {
          const newRec = { proc: fresh, attempts: 0, windowStart: Date.now(), intentional: false };
          this.procs.set('ue5', newRec);
          fresh.on('exit', (code) => this._onExit(ue5Spec, newRec, code));
          log('ue5-monitor', 'fresh UE5 spawn from monitor — BP BeginPlay should re-fire Create Websocket');
          lastRespawnMs = Date.now();
        }
        return;
      }
      // Throttle: never respawn more than once per 25s (5× watchdog tick).
      if (Date.now() - lastRespawnMs < 25000) return;
      // Cheap precondition: backend must be healthy (we depend on it for /api/v1/avatar/status)
      const status = await httpJson(`http://127.0.0.1:${CONFIG.ports.backend}/api/v1/avatar/status`);
      if (!status) {
        consecutiveZero = 0;
        if (pollCount % 12 === 1) log('ue5-monitor', `/avatar/status null (backend transient or unreachable) — skip`);
        return;             // backend transient — skip; will retry next tick
      }
      if (status.clients > 0) {
        consecutiveZero = 0;
        return;             // healthy — UE5 still subscribed
      }
      // Require TWO consecutive zero readings before respawning — avoids
      // false triggers during the brief window when backend has just respawned
      // and UE5 is mid-handshake (was reconnecting via fresh WebSocket).
      consecutiveZero++;
      if (consecutiveZero < 2) {
        log('ue5-monitor', `clients=0 (first reading; will respawn after 2 in a row)`);
        return;
      }
      // clients=0 confirmed → UE5 dropped or never re-connected after backend bounce
      log('ue5-monitor', `avatar WS clients=0 confirmed (${consecutiveZero}×) with backend up — UE5 lost connection; respawning`);
      lastRespawnMs = Date.now();
      consecutiveZero = 0;
      ue5Rec.intentional = true;
      this._kill(ue5Rec.proc);
      // Also taskkill the inner Game process the stub spawns. v0.7.2: the
      // inner game's image name is SlovakEdu-Win64-Shipping.exe, not the same
      // as the stub — /T on the stub doesn't reach an inner game whose
      // parent process already died, so taskkill the inner name explicitly.
      if (process.platform === 'win32') {
        for (const img of ['SlovakEdu.exe', 'SlovakEdu-Win64-Shipping.exe']) {
          try { spawnSync('taskkill', ['/IM', img, '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* ignore */ }
        }
      }
      await sleep(2000);
      const newProc = ue5Spec.spawn();
      if (newProc) {
        ue5Rec.proc = newProc;
        ue5Rec.intentional = false;
        newProc.on('exit', (code) => this._onExit(ue5Spec, ue5Rec, code));
        log('ue5-monitor', 'UE5 respawned; BP BeginPlay should re-fire Create Websocket within ~3s');
      } else {
        warn('ue5-monitor', 'respawn returned no proc — UE5 binary missing?');
      }
    }, 5000);
  }

  stop() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    // v0.6.4: clear the mid-session monitor + any pending restart/bounce timers
    // BEFORE killing services. Without this, a timer scheduled by _onExit or
    // _restartDependent could fire mid-stop and respawn a service we're trying
    // to terminate, producing orphaned processes after quit.
    if (this.ue5Monitor) { clearInterval(this.ue5Monitor); this.ue5Monitor = null; }
    for (const tid of this._pendingTimers) { clearTimeout(tid); }
    this._pendingTimers.clear();
    log('shutdown', `terminating ${this.procs.size} service(s)`);
    for (const [name, rec] of this.procs) { rec.intentional = true; this._kill(rec.proc); log('shutdown', `killed ${name} (pid ${rec.proc && rec.proc.pid})`); }
    // Safety sweep (Windows): the avatar (UE stub + game) and the UE crash
    // reporter can outlive their parent's process tree — kill them by name so
    // "Ukončiť" truly stops everything (no orphaned avatar, no lingering dialog).
    if (process.platform === 'win32') {
      // v0.6.4: also taskkill UnrealEditor.exe in case dev-mode editor fallback
      // was spawned (line 357-359 ue5 spec) — name-based kill misses it otherwise.
      // v0.7.2: SlovakEdu-Win64-Shipping.exe (inner cooked game binary) added
      // — without it, orphaned inner games survive shutdown and stick around
      // until next launch as zombie streamers that grab DefaultStreamer slot.
      for (const img of ['SlovakEdu.exe', 'SlovakEdu-Win64-Shipping.exe', 'UnrealEditor.exe', 'CrashReportClient.exe', 'CrashReportClientEditor.exe']) {
        try { spawnSync('taskkill', ['/IM', img, '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* not running */ }
      }
    }
    log('shutdown', 'all stopped');
  }
}

// ── singleton + back-compat API ──
let _launcher = null;
export function getLauncher() { if (!_launcher) _launcher = new Launcher(); return _launcher; }
export async function main() { await getLauncher().start(); }
export function shutdownAll() { getLauncher().stop(); }
export { CONFIG };

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { shutdownAll(); process.exit(0); });

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  main().catch((e) => { warn('launcher', e.stack || String(e)); shutdownAll(); process.exit(1); });
}
