# EduTutor.AI — one-bundle desktop installer

A single Windows installer (`EduTutor-Setup-<version>.exe`) that carries the
**whole stack** — backend, frontend, Pixel Streaming signalling, and the cooked
UE5 avatar — so a user double-clicks once, then opens the app and everything
(including the 3D avatar) comes up locally. No Python, Node, Docker, or repo
checkout required on the target machine.

```
double-click installer → installs to a folder → launch → splash boots the
stack (backend + frontend + wilbur + UE5) → window opens on the app → onboarding
```

## What's inside

electron-builder wraps an Electron shell (`main.mjs` + `orchestrator.mjs`) and
bundles four payload dirs as `extraResources` (→ `<install>/resources/`):

| resource           | what it is                                  | source |
|--------------------|---------------------------------------------|--------|
| `backend/python/`  | self-contained CPython 3.11 + lean deps     | uv standalone + `requirements-lean.txt` (no torch) |
| `backend/app/`     | FastAPI app + `run_dev.py`                   | `tutor-service/` |
| `frontend.tgz`     | Next.js standalone, tarred (see below)      | `core/` `pnpm build` (`output: 'standalone'`) |
| `wilbur/`          | Pixel Streaming signalling bundle            | vendored `wilbur.bundle.cjs` |
| `ue5/`             | cooked avatar build (root stub + `SlovakEdu/`) | `RunUAT BuildCookRun` |

At runtime `main.mjs` sets `EDU_RESOURCES=<resourcesPath>` and
`EDU_DATA_DIR=<userData>`; `orchestrator.mjs` resolves all paths from those and
launches each process (Electron-as-node for the JS services, the bundled
`python.exe` for the backend, the cooked stub for UE5).

## Build it

```bash
cd desktop
npm install                         # once: electron + electron-builder
node stage-resources.mjs --heavy    # stage all 4 payloads into resources/  (--heavy copies python + the 2.3 GB UE5)
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist
# → dist/EduTutor-Setup-<version>.exe   (~1.9 GB)
```

`resources/` is gitignored (multi-GB); `stage-resources.mjs` regenerates it.
Plain `node stage-resources.mjs` (no `--heavy`) re-stages only the cheap,
frequently-changing payloads (frontend + backend app + wilbur) and leaves the
python runtime / UE5 build in place.

## Gotchas (learned the hard way)

- **pnpm + Next standalone.** Next's file tracer under pnpm leaves runtime deps
  (`styled-jsx`, `@swc/helpers`, `scheduler`, …) out of the standalone
  `node_modules` because they live only under `.pnpm/`. `next.config.js` sets
  `outputFileTracingRoot: __dirname` (un-nests the output) and the stage script
  copies next's `.pnpm` siblings + `scheduler` in. Without this the bundled
  frontend crashes on boot with `Cannot find module 'styled-jsx/package.json'`.
- **Frontend ships as a tarball.** electron-builder silently drops `node_modules`
  (it special-cases that name) and `.next` (a dot-dir its glob skips) from a loose
  `extraResources` directory — leaving a 5 MB husk that crashes on boot. So the
  staged frontend is tarred to `frontend.tgz` (an opaque blob it copies verbatim)
  and `main.mjs` extracts it once into `<userData>/frontend` on first launch,
  re-extracting only when the app version changes. The backend's `python/`
  (`Lib/site-packages`, not `node_modules`) is unaffected and ships loose.
- **Read-only install dir.** A Program Files install can't write next to the
  binaries. The backend's SQLite DB, Chroma store, logs, and user-entered API
  keys are redirected to `EDU_DATA_DIR` (the per-user `userData` dir) via
  `SQLITE_PATH`, `CHROMA_PERSIST_PATH`, `EDU_ENV_FILE`, and the launcher's log dir.
- **UE5 root stub, not the inner exe.** Launch `ue5/SlovakEdu.exe` (the small
  staging stub that stays alive as parent), never `ue5/SlovakEdu/Binaries/Win64/
  SlovakEdu.exe` (exits ~20 s in → connect/disconnect churn). Packaged mode uses
  only the bundled exe — it never scans the user's Downloads.
- **Code signing.** No cert yet → build with `CSC_IDENTITY_AUTO_DISCOVERY=false`
  so electron-builder doesn't run `signtool` on every bundled `.exe` (50+ python
  stubs + the UE binary — slow, and it mangled the UE root stub once).
- **UE5 audio (`EDU_UE5_AUDIO`).** Kept OFF until Martin's RAI Blueprint ships;
  ON without the UE side = silent avatar + no visemes. See
  `docs/plans/ue5-audio-protocol.md`.

## First run

`FirstRunSetup.tsx` readies the LLM: if a local Ollama model is present it's used;
otherwise it pulls one (real `ollama-pull` with live progress), and if Ollama is
unavailable it offers a **cloud API-key** panel (OpenAI / Anthropic / Groq, saved
live via `/system/config`) plus a skip — so the flow is never a dead end. Voice
is Edge TTS (cloud, instant); the avatar ships in the bundle.
