#!/usr/bin/env node
/**
 * Stage the bundled-app payload into desktop/resources/ for electron-builder.
 *
 * resources/ is gitignored (multi-GB), so this script regenerates it from the
 * sources in the working tree. Run it before `pnpm dist`:
 *
 *   node stage-resources.mjs            # frontend + backend app + wilbur
 *   node stage-resources.mjs --heavy    # also (re)stage python runtime + UE5
 *
 * Layout produced (mirrors orchestrator.mjs packaged paths, EDU_RESOURCES):
 *   resources/backend/{python/, app/, run_dev.py}   FastAPI + self-contained CPython
 *   resources/frontend/{server.js, .next/, node_modules/, public/}  Next standalone
 *   resources/wilbur/{wilbur.bundle.cjs, www/, config.json}         Pixel Streaming signalling
 *   resources/ue5/{SlovakEdu.exe, SlovakEdu/, Engine/}              cooked avatar build
 *
 * The python runtime and the 2.3 GB UE5 build are slow to copy and rarely
 * change, so they're only (re)staged with --heavy; otherwise their presence is
 * just verified.
 */
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');                 // edotutor-test
const UE5_CLONE = join(REPO, '..', 'edotutor-ue5-latest');
const UE5_BUILD = process.env.EDU_UE5_BUILD || join(process.env.USERPROFILE || '', 'Downloads', 'Edutor0530', 'Windows');
const RES = join(HERE, 'resources');
const HEAVY = process.argv.includes('--heavy');

const log = (m) => console.log(`[stage] ${m}`);
const copy = (src, dest, opts = {}) => cpSync(src, dest, { recursive: true, dereference: true, ...opts });
const sizeOf = (p) => { try { return execSync(`du -sh "${p}"`, { shell: 'bash' }).toString().split('\t')[0]; } catch { return '?'; } };

// ── Frontend: Next standalone + the pnpm sibling-deps fix ──────────────────
// Next's file tracer under pnpm leaves styled-jsx/@swc/helpers/scheduler/etc.
// out of the standalone node_modules (they live only under .pnpm/). Copy the
// whole set of next's siblings so `node server.js` resolves them.
function stageFrontend() {
  const core = join(REPO, 'core');
  const standalone = join(core, '.next', 'standalone');
  // Always rebuild for the bundle with auth disabled (single-user desktop —
  // no next-auth sign-in gate / session fetch). Cloud builds omit this flag.
  log('frontend: building (pnpm build, NEXT_PUBLIC_SKIP_AUTH=true)…');
  execSync('pnpm build', { cwd: core, stdio: 'inherit', env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    SHELL: process.env.SHELL,
    LANG: process.env.LANG,
    NODE_ENV: 'production',
    NEXT_PUBLIC_SKIP_AUTH: 'true',
    // NextAuth build-time validation requires NEXTAUTH_SECRET to be set even
    // when the desktop bundle skips auth at runtime via NEXT_PUBLIC_SKIP_AUTH.
    // The packaged app never honors this build-time value (the auth route is
    // bypassed entirely); it just unblocks the `next build` page-collection.
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'desktop-build-placeholder-not-used-at-runtime',
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  } });
  const dest = join(RES, 'frontend');
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  copy(standalone, dest);                                   // server.js + partial node_modules
  copy(join(core, '.next', 'static'), join(dest, '.next', 'static'));
  if (existsSync(join(core, 'public'))) copy(join(core, 'public'), join(dest, 'public'));

  // Patch in next's runtime siblings from .pnpm (styled-jsx, @swc/helpers, …).
  const pnpmDir = join(core, 'node_modules', '.pnpm');
  const nextPkg = readdirSync(pnpmDir).find((d) => d.startsWith('next@'));
  if (nextPkg) {
    const siblings = join(pnpmDir, nextPkg, 'node_modules');
    for (const name of readdirSync(siblings)) {
      if (name === 'next') continue;
      const target = join(dest, 'node_modules', name);
      if (name.startsWith('@')) {
        for (const sub of readdirSync(join(siblings, name))) copy(join(siblings, name, sub), join(target, sub));
      } else if (!existsSync(target)) {
        copy(join(siblings, name), target);
      }
    }
  }
  // react-dom@19 can require('scheduler') at runtime — a transitive dep that
  // lives under its own .pnpm entry, not among next's siblings. Ensure it.
  for (const dep of ['scheduler']) {
    if (existsSync(join(dest, 'node_modules', dep))) continue;
    const entry = readdirSync(pnpmDir).find((d) => d.startsWith(`${dep}@`));
    if (entry) copy(join(pnpmDir, entry, 'node_modules', dep), join(dest, 'node_modules', dep));
  }
  log(`frontend staged → ${sizeOf(dest)}  (server.js=${existsSync(join(dest, 'server.js'))})`);

  // electron-builder drops `node_modules` (special-cased) and `.next` (dot-dir)
  // from a loose extraResources dir, which would crash the bundled frontend.
  // Ship it as an opaque tarball instead; main.mjs extracts it on first launch.
  const tgz = join(RES, 'frontend.tgz');
  rmSync(tgz, { force: true });
  // Use Windows' own bsdtar (System32\tar.exe), not git/MSYS tar which mangles
  // C:\ paths. Forward-slash the args so bsdtar parses them cleanly.
  const tarExe = join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
  const fwd = (p) => p.replace(/\\/g, '/');
  execSync(`"${tarExe}" -czf "${fwd(tgz)}" -C "${fwd(dest)}" .`, { stdio: 'inherit' });
  log(`frontend archived → frontend.tgz (${sizeOf(tgz)})`);
}

// ── Backend: FastAPI app code (python runtime staged separately, --heavy) ──
function stageBackendApp() {
  const svc = join(REPO, 'tutor-service');
  const dest = join(RES, 'backend');
  mkdirSync(dest, { recursive: true });
  rmSync(join(dest, 'app'), { recursive: true, force: true });
  copy(join(svc, 'app'), join(dest, 'app'), {
    filter: (s) => !s.includes('__pycache__') && !s.endsWith('.pyc'),
  });
  copy(join(svc, 'run_dev.py'), join(dest, 'run_dev.py'));

  // Pre-bake HuggingFace models into the bundle. v0.6.0 baked the RAG
  // embedding model; v0.6.3 adds faster-whisper-small for STT.
  //
  // Why pre-bake instead of letting backend download at first use:
  //  - paraphrase-multilingual-MiniLM-L12-v2 (RAG embedding): SentenceTransformer
  //    makes 30+ HTTP HEAD requests to huggingface.co at every backend boot
  //    (HF Hub's manifest validation). On clean Windows that's 60-240 seconds
  //    blocking startup. With the cache pre-baked the snapshot reads directly
  //    from disk → instant.
  //  - Systran/faster-whisper-small (voice STT): huggingface_hub 1.17+ defaults
  //    to Xet storage downloads which require the `hf_xet` Python package. That
  //    wheel is NOT in our bundle (and shipping it pulls platform-specific
  //    binaries we'd have to validate). Without `hf_xet` and without a pre-baked
  //    cache, faster-whisper init raises RuntimeError on first STT call and the
  //    mic button silently breaks. Pre-baking the snapshot bypasses Xet entirely.
  //
  // Orchestrator (v0.6.2+) points HF_HOME at a writable per-user copy of this
  // bundled cache; ensureHfCacheExtracted in main.mjs handles the copy on first
  // launch / version mismatch.
  //
  // Bundle cost: ~458 MB (MiniLM) + ~244 MB (whisper) = ~702 MB. Installer
  // grows ~250 MB (886 → ~1.14 GB). Worth it for offline-on-first-launch.
  const HF_MODELS = [
    { id: 'sentence-transformers--paraphrase-multilingual-MiniLM-L12-v2', label: 'RAG embedding (MiniLM)',  approxMb: 458 },
    { id: 'Systran--faster-whisper-small',                                label: 'STT (faster-whisper-small)', approxMb: 244 },
  ];
  const hfHubRoot = join(process.env.USERPROFILE || 'C:/Users/kindl', '.cache', 'huggingface', 'hub');
  mkdirSync(join(dest, 'hf-cache', 'hub'), { recursive: true });
  for (const m of HF_MODELS) {
    const dirName = `models--${m.id}`;
    const src = join(hfHubRoot, dirName);
    const dst = join(dest, 'hf-cache', 'hub', dirName);
    if (!existsSync(src)) {
      log(`⚠ hf-cache: ${m.label} not found at ${src} — backend will fall back to runtime download (slow / may fail without hf_xet)`);
      continue;
    }
    if (existsSync(dst) && !HEAVY) {
      log(`hf-cache: ${m.label} already staged → ${sizeOf(dst)}`);
      continue;
    }
    log(`hf-cache: copying ${m.label} (~${m.approxMb} MB)…`);
    rmSync(dst, { recursive: true, force: true });
    // v0.6.4: preserve symlinks/reparse points in the HF hub layout. The
    // snapshots/<sha>/<file> entries are links pointing into blobs/<sha>;
    // default `copy()` dereferences them, which doubles disk size AND breaks
    // huggingface_hub's integrity check (it expects a link and tries to HEAD-
    // revalidate the snapshot when it finds a regular file → fails offline
    // on first STT call on a clean install).
    cpSync(src, dst, { recursive: true, dereference: false, verbatimSymlinks: true });
    log(`hf-cache: ${m.label} staged → ${sizeOf(dst)}`);
  }

  // v0.8.9: pack hf-cache into a tgz so NSIS doesn't choke on the 280-char
  // paths inside models--Systran--faster-whisper-small/snapshots/<sha>/*.
  // main.mjs ensureHfCacheExtracted tar-extracts at first launch.
  const hfDir = join(dest, 'hf-cache');
  const hfTgz = join(dest, 'hf-cache.tgz');
  if (existsSync(hfDir)) {
    log('hf-cache: compressing to tgz for NSIS-safe packaging…');
    execSync(`tar -czf "${hfTgz}" -C "${dest}" hf-cache`, { stdio: 'inherit' });
    rmSync(hfDir, { recursive: true, force: true });
    log(`hf-cache: tgz produced → ${sizeOf(hfTgz)} (raw dir removed)`);
  }

  if (!existsSync(join(dest, 'python', 'python.exe'))) {
    log('⚠ backend/python runtime missing — stage it once (see requirements-lean.txt) or run with --heavy');
  } else {
    // Prune __pycache__ + unused packages from the bundled python. The
    // installer's NSIS script generator can't handle ~26K file entries
    // (silently fails the installApplicationFiles macro); dropping these
    // (~12K .pyc files, regenerated by Python on first import + ~86 MB
    // kubernetes that the backend doesn't import) brings file count under
    // the threshold and the bundle works.
    const pyDir = join(dest, 'python');
    const sp = join(pyDir, 'Lib', 'site-packages');
    let prunedDirs = 0;

    // Walk site-packages once collecting prunable dirs by name.
    // - __pycache__: regenerated automatically on first import
    // - tests / test: shipped test suites (numpy/scipy/jsonschema...
    //   ~hundreds of files each, never imported at runtime)
    // - *.egg-info: ancient pip metadata format, ignored by importlib.metadata
    //
    // INTENTIONALLY KEPT: *.dist-info — pydantic / many other libs query them
    // via importlib.metadata.version() for runtime feature detection. Pruning
    // them broke pydantic's email_validator import path in an earlier attempt.
    function walkSitePackages(dir) {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (!e.isDirectory()) continue;
        if (e.name === '__pycache__' || e.name.endsWith('.egg-info') || e.name === 'tests' || e.name === 'test') {
          try { rmSync(full, { recursive: true, force: true }); prunedDirs++; } catch { /* ignore */ }
        } else {
          walkSitePackages(full);
        }
      }
    }
    walkSitePackages(pyDir);

    // Whole-package removals — these are safe to drop:
    // - kubernetes: bundled by some dep but never imported by us
    // - pip: only needed at staging time (deps already installed)
    // - docx (python-docx): app uses docx2txt instead (verified by grep — no
    //   `import docx`/`from docx` in app/, only `import docx2txt`)
    // - hf_xet: optional Hugging Face Xet progress reporting; huggingface_hub
    //   gracefully degrades to plain HTTP without it
    // - onnxruntime/{transformers,tools,quantization,datasets,backend}:
    //   model-conversion/quantization helpers; chromadb's runtime embedding
    //   path uses only onnxruntime/capi/* (verified — no `from
    //   onnxruntime.transformers` in chromadb's site-packages)
    //
    // NOT REMOVING: tzdata (Windows zoneinfo backend — without it Slovak
    //   locale datetime construction raises ZoneInfoNotFoundError).
    //
    // v0.6.4: setuptools is DROPPED (kept the v0.5.x behavior). The audit
    // suggested keeping it for pkg_resources, but: (a) v0.6.3 shipped without
    // it and no runtime code path imported pkg_resources, (b) the bundled
    // setuptools requires the jaraco.* namespace packages which we don't
    // ship, so importing pkg_resources from a setuptools-without-jaraco
    // bundle raises ModuleNotFoundError on jaraco.text — strictly WORSE
    // than just not shipping setuptools at all. If a runtime regression ever
    // requires pkg_resources, we need to either ship jaraco.* alongside or
    // forcibly bundle setuptools-bootstrap.
    for (const dropPath of [
      ['Lib', 'site-packages', 'kubernetes'],
      ['Lib', 'site-packages', 'pip'],
      ['Lib', 'site-packages', 'docx'],
      ['Lib', 'site-packages', 'hf_xet'],
      ['Lib', 'site-packages', 'onnxruntime', 'transformers'],
      ['Lib', 'site-packages', 'onnxruntime', 'tools'],
      ['Lib', 'site-packages', 'onnxruntime', 'quantization'],
      ['Lib', 'site-packages', 'onnxruntime', 'datasets'],
      ['Lib', 'site-packages', 'onnxruntime', 'backend'],
      // torch/include is 9k+ C++ headers used only when compiling torch
      // extensions from source. We never compile — we run pre-built wheels.
      // Removing this drops file count from 44K → 19K (well under NSIS 26K
      // cliff) and ~250 MB of disk. Smoke test verifies torch still imports.
      // Added v0.4.5 when the RAG ML stack landed in the bundle.
      ['Lib', 'site-packages', 'torch', 'include'],
      // NOT DROPPING torch/testing — v0.4.5 dropped it and broke ChromaDB
      // ingest on every clean Windows install with "cannot import name 'nn'
      // from partially initialized module 'torch'". Why: torch.autograd
      // imports torch.testing at module load (see
      // torch/autograd/gradcheck.py line 10). Without it, every
      // `from torch import nn` triggers a half-init that races. v0.4.5
      // smoke test didn't catch it because `import app.main` doesn't
      // touch torch.autograd; only chromadb's embedding worker does.
      // torch/testing is ~25 MB of disk; we accept that cost.
      // NOT DROPPING torch.distributed either: torch.utils.data.dataloader
      // imports it at module load time, even on single-process inference.
      ['Lib', 'site-packages', 'pygments'],
      ['Lib', 'site-packages', 'setuptools'],
      ['Lib', 'site-packages', 'wheel'],
    ]) {
      const p = join(pyDir, ...dropPath);
      if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); prunedDirs++; }
    }

    // Babel locale data: 31 MB of per-locale .dat files. Pulled in via
    // courlan -> trafilatura (lazy-imported in our web-ingest path). Our
    // languages are English, Slovak, Czech — drop all others. Plus the
    // 'root' locale which is babel's fallback.
    const localeDir = join(pyDir, 'Lib', 'site-packages', 'babel', 'locale-data');
    if (existsSync(localeDir)) {
      const keep = new Set(['root.dat']);
      // Keep base languages + any region variants (en, en_US, en_GB, sk, sk_SK, cs, cs_CZ, ...)
      for (const file of readdirSync(localeDir)) {
        if (file.startsWith('en') || file.startsWith('sk') || file.startsWith('cs')) keep.add(file);
      }
      let localesPruned = 0;
      for (const file of readdirSync(localeDir)) {
        if (keep.has(file)) continue;
        try { rmSync(join(localeDir, file), { force: true }); localesPruned++; } catch { /* ignore */ }
      }
      if (localesPruned) log(`babel locale-data: kept ${keep.size} (en/sk/cs/root), dropped ${localesPruned} → ${sizeOf(localeDir)}`);
    }

    if (prunedDirs) log(`backend python pruned (${prunedDirs} __pycache__/dist-info/tests/unused-pkg dirs) → ${sizeOf(pyDir)}`);

    // VC++ Runtime DLLs that ctranslate2 (faster-whisper engine) imports but a
    // clean Windows install does NOT ship by default. vcruntime140 is the C
    // runtime; msvcp140 is the C++ runtime — different file, missing on
    // machines without the "VC++ 2015-2022 Redistributable" installed. We
    // already ship vcruntime140*.dll from the bundled CPython; copy the C++
    // pair next to it so the python.exe's local DLL search picks them up.
    // (Microsoft explicitly licenses these as redistributable runtime files;
    // they are the exact same binaries vcredist_x64.exe would drop.)
    const sys32 = join(process.env.SystemRoot || 'C:/Windows', 'System32');
    for (const dll of ['msvcp140.dll', 'msvcp140_1.dll']) {
      const src = join(sys32, dll);
      const dst = join(pyDir, dll);
      if (existsSync(dst)) continue;
      if (!existsSync(src)) { log(`⚠ ${dll} not found at ${src} — clean-Windows installs will crash importing ctranslate2`); continue; }
      try { copy(src, dst); log(`bundled ${dll} → backend/python/`); } catch (e) { log(`⚠ failed to bundle ${dll}: ${e.message}`); }
    }
    for (const dll of ['msvcp140.dll', 'msvcp140_1.dll']) {
      if (!existsSync(join(pyDir, dll))) {
        log(`FATAL: ${dll} missing from bundled python — installer will crash on STT`);
        process.exit(1);
      }
    }

    // Embeddable-Python isolation marker. Without this file the bundled
    // python.exe inherits the host's user site-packages, %APPDATA%\...\Python,
    // PYTHONPATH, registry-installed Pythons — every release before v0.4.4
    // was "fine on dev, broken on clean Windows" exactly because of this.
    // Create it idempotently in case a manual edit removed it.
    const pthFile = join(pyDir, 'python311._pth');
    if (!existsSync(pthFile)) {
      try {
        writeFileSync(pthFile, 'python311.zip\n.\nLib\nLib\\site-packages\nDLLs\n\n# Isolation: do NOT delete. See desktop/stage-resources.mjs.\n');
        log(`wrote python311._pth → isolation enforced`);
      } catch (e) { log(`⚠ failed to write _pth: ${e.message}`); }
    }

    // Hard CI gate: confirm the bundled python can actually import app.main
    // BEFORE we ship a broken installer. This catches the v0.4.1/2/3-class
    // regression where a transitive dep was missing (idna, packaging, tqdm,
    // grpcio, ...) and the backend died at startup on clean Windows — the
    // bug that wasted a full release-cycle to chase remotely.
    log(`smoke-test: importing app.main + heavy ML stack with bundled python (isolated)…`);
    const py = join(pyDir, 'python.exe');
    // -B: don't write .pyc files. Without this the smoke test regenerates
    // every __pycache__ we just pruned, pushing the bundle back over NSIS's
    // file-count cliff (~26K) and the installer build fails silently with
    // "Error in macro installApplicationFiles on macroline 79".
    //
    // v0.6.4: expanded to cover the heavy ML stack and lazy-loaded service
    // modules. Previously the smoke test only imported app.main, which only
    // triggers top-level imports — the ML deps (faster_whisper,
    // sentence_transformers, chromadb, edge_tts, openai, anthropic) are
    // imported lazily inside service modules and would pass the smoke test
    // even when transitively broken (e.g. pkg_resources missing, tokenizers
    // missing, tzdata missing). Each of those bugs has been individually
    // hit on a clean Windows install and shipped a broken installer. This
    // expanded test catches all those regression classes.
    const smokeSrc = [
      'import sys',
      'sys.path.insert(0, ".")',
      'import app.main',
      // Heavy ML stack — module imports trigger the platform-specific deps
      // these libs need (ctranslate2, tokenizers, protobuf, regex, etc.).
      'from faster_whisper import WhisperModel',
      'from sentence_transformers import SentenceTransformer',
      'import chromadb',
      'import edge_tts',
      'import openai',
      'import anthropic',
      // Torch lazy-init paths (the bug that bit v0.4.5 when torch.testing was pruned).
      'import torch',
      'import torch.nn',
      'import torch.nn.functional',
      'from torch.utils.data import DataLoader',  // pulls torch.distributed
      // tzdata — Windows zoneinfo backend. Smoke test removed in v0.6.5:
      // v0.6.4 shipped fine without tzdata, no runtime code path actually
      // imports zoneinfo today. The audit theorized livekit JWT claims would
      // use it, but livekit isn't currently a hot dep in the chat flow. Re-add
      // this test only when we actually depend on zoneinfo somewhere.
      // 'from zoneinfo import ZoneInfo',
      // 'ZoneInfo("UTC")',
      // Service modules that lazy-import the rest of the heavy stack.
      'from app.services import stt_service, tts_service',
    ].join('; ');
    const smoke = spawnSync(py, ['-B', '-c', smokeSrc], {
      cwd: dest, stdio: 'pipe', encoding: 'utf8', timeout: 90000,
    });
    if (smoke.status !== 0) {
      const out = (smoke.stdout || '') + (smoke.stderr || '');
      log(`✗ smoke-test FAILED — bundle would ship broken:\n${out.trim().split('\n').slice(-15).join('\n')}`);
      throw new Error('Backend smoke-test failed. Refusing to ship a broken bundle. Install missing deps with: python.exe -m pip install --target python\\Lib\\site-packages <package>');
    }
    log(`✓ smoke-test passed — bundle boots on clean Windows`);
    // Belt-and-suspenders: even with -B, some import-time machinery (zipimport
    // metadata, etc.) can leave stray cache files. Sweep once more.
    let lateClean = 0;
    walkSitePackages(pyDir); // re-uses prunedDirs counter scope? no — define lateClean if needed
    function lateSweep(dir) {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const full = join(dir, e.name);
        if (e.name === '__pycache__') { try { rmSync(full, { recursive: true, force: true }); lateClean++; } catch {} }
        else lateSweep(full);
      }
    }
    lateSweep(pyDir);
    if (lateClean) log(`post-smoke-test cleanup: ${lateClean} __pycache__ removed`);

    // Report final file count for NSIS sanity. ~10-15K should be safe.
    let fileCount = 0;
    (function count(dir) {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) count(join(dir, e.name));
        else fileCount++;
      }
    })(pyDir);
    log(`backend python final file count: ${fileCount} (NSIS dies above ~26K)`);
  }
  log(`backend app staged → app + run_dev.py (python runtime ${existsSync(join(dest, 'python', 'python.exe')) ? 'present' : 'MISSING'})`);
}

// ── Wilbur: the vendored Pixel Streaming signalling bundle ─────────────────
// Source preference: sibling UE5 clone (team workflow) → main.mjs runtime
// download fallback (ensureWilburDownloaded fetches wilbur-bundle-<ver>.zip
// from edututor-releases on first packaged-app launch). If neither is
// available at stage time, skip with a clear notice so fresh-clone
// contributors can still produce a working .exe (their users will pull
// Wilbur at first run instead).
function stageWilbur() {
  const src = join(UE5_CLONE, 'EdutorUE', 'PixelStreaming', 'SignallingWebServer');
  const bundle = join(src, 'wilbur.bundle.cjs');
  if (!existsSync(bundle)) {
    log(`⚠ wilbur source not found at ${bundle}`);
    log(`  skip stageWilbur — packaged app will download wilbur-bundle-<ver>.zip on first launch via main.mjs ensureWilburDownloaded()`);
    log(`  to bundle wilbur into the .exe, clone the UE5 repo as a sibling: git clone <ue5-repo> ../edotutor-ue5-latest`);
    return;
  }
  const dest = join(RES, 'wilbur');
  mkdirSync(dest, { recursive: true });
  copy(bundle, join(dest, 'wilbur.bundle.cjs'));
  copy(join(src, 'www'), join(dest, 'www'));
  if (existsSync(join(src, 'config.json'))) copy(join(src, 'config.json'), join(dest, 'config.json'));
  log(`wilbur staged → ${sizeOf(dest)}`);
}

// ── Ollama — the LLM runtime ────────────────────────────────────────────────
// Ships the binary + CPU-only ggml runtimes. GPU runtimes (cuda_v12, cuda_v13,
// rocm) are large (~5 GB total) and pushed out of scope for the bundle — the
// CPU runtimes still work on every Windows machine. Users with strong GPUs
// can install Ollama externally and the bundle's auto-detect respects it.
function stageOllama() {
  const src = process.env.OLLAMA_SRC || join(process.env.LOCALAPPDATA || `${process.env.USERPROFILE || ''}\\AppData\\Local`, 'Programs', 'Ollama');
  const dest = join(RES, 'ollama');
  if (!existsSync(join(src, 'ollama.exe'))) {
    log(`⚠ ollama not found at ${src} — install Ollama once, then re-stage`);
    return;
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  copy(src, dest);
  // Strip what we don't ship: GPU runtimes (huge), uninstaller, updaters.
  for (const dir of ['lib/ollama/cuda_v12', 'lib/ollama/cuda_v13', 'lib/ollama/rocm']) {
    rmSync(join(dest, dir), { recursive: true, force: true });
  }
  // Strip files NSIS chokes on or that we don't need:
  //   * Ollama.lnk      — Windows shortcut, NSIS File command errors on these
  //   * unins000.*      — Ollama's OWN Inno Setup uninstaller (nesting bug)
  //   * ollama app.exe  — the tray GUI; we spawn `ollama.exe serve` directly
  //   * Uninstall.exe / OllamaUpdate.exe / app.ico — not needed, ~MB savings
  for (const f of [
    'Uninstall.exe', 'OllamaUpdate.exe', 'app.ico',
    'lib/Ollama.lnk',
    'unins000.exe', 'unins000.dat', 'unins000.msg',
    'ollama app.exe',
  ]) {
    rmSync(join(dest, f), { force: true });
  }
  log(`ollama staged → ${sizeOf(dest)} (CPU-only; GPU runtimes stripped)`);
}

// ── UE5 cooked build (heavy: 2.3 GB) ───────────────────────────────────────
function stageUE5() {
  const dest = join(RES, 'ue5');
  if (!HEAVY && existsSync(join(dest, 'SlovakEdu.exe')) && existsSync(join(dest, 'SlovakEdu'))) {
    log(`ue5 present → ${sizeOf(dest)} (skip; --heavy to recopy)`); return;
  }
  if (!existsSync(UE5_BUILD)) { log(`⚠ UE5 build not found at ${UE5_BUILD} — cook it first`); return; }
  log('ue5: copying cooked build (2.3 GB, slow)…');
  rmSync(dest, { recursive: true, force: true });
  copy(UE5_BUILD, dest);
  log(`ue5 staged → ${sizeOf(dest)} (paks present=${existsSync(join(dest, 'SlovakEdu', 'Content', 'Paks'))})`);
}

mkdirSync(RES, { recursive: true });
stageFrontend();
stageBackendApp();
stageWilbur();
stageOllama();
stageUE5();
log(`done. resources total → ${sizeOf(RES)}`);

// Size-budget warning. NSIS's makensis.exe is 32-bit and mmap fails on the
// .nsis.7z payload when it approaches ~2 GiB on Windows. v0.4.4 hit this
// (2,185,114,419 bytes = 2.035 GiB → installApplicationFiles macroline 79
// → "File: failed creating mmap"). The compressed 7z is ~57% of unpacked
// resources, so an unpacked budget of ~3.5 GiB keeps us safely under.
// We don't FAIL the stage on size (the user might be testing locally),
// but we do shout when the bundle crosses the danger zone.
try {
  const totalBytes = parseInt(execSync(`du -sb "${RES}" | awk '{print $1}'`, { shell: 'bash' }).toString().trim(), 10);
  const totalGiB = totalBytes / (1024 ** 3);
  if (totalGiB > 3.5) {
    log(`⚠ unpacked bundle is ${totalGiB.toFixed(2)} GiB → 7z likely > 2 GiB → NSIS will fail with "mmap" error.`);
    log(`⚠ recover bytes before re-running pnpm dist. See stage-resources.mjs whole-package drop list.`);
  } else {
    log(`bundle size OK (${totalGiB.toFixed(2)} GiB unpacked, NSIS limit ~3.5 GiB)`);
  }
} catch { /* du failed, skip the check */ }
