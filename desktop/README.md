# EduTutor.AI — desktop launcher

The "one app" that brings up the whole local stack and shows the UI with the live
avatar. Plan: `docs/plans/one-app-launcher-execution.md`.

## `orchestrator.mjs` — the launcher brain (done + verified)
Shell-agnostic Node module that starts the five processes in order, health-checks
each, and tears them all down on exit. Supersedes `Start-EduTutor-Dev.ps1`
(current paths, the vendored `wilbur.bundle.cjs`, Ollama-ensure, `EDU_UE5_AUDIO`,
graceful shutdown).

```bash
node orchestrator.mjs           # start the whole stack
node orchestrator.mjs --check   # report status only; spawns nothing
```

Start order: Ollama → backend (:8000) → frontend (:3000) → Wilbur (:80/:8888) →
UE5 (headless, registers on Wilbur). Idempotent — skips anything already running.

Override paths/ports/flags via a `launcher.config.json` next to this file (dev
defaults target this machine; a packaged install points at bundled paths). Key
fields: `repo`, `ue5Clone`, `ollamaModel`, `frontendMode` (`dev`|`standalone`),
`ue5Audio`, `ue5Exe`/`ue5SearchDir`.

This module is reused by the GUI shell: an Electron main process `import`s it
directly, or a Tauri sidecar spawns it.

## Shell — DECISION PENDING
- **Tauri** (MASTER_PLAN W1's pick) needs **Rust** — not installed on this machine.
- **Electron** needs only **Node** — already present (v22). Bundles a known
  Chromium (predictable WebRTC/GPU for the avatar stream); ~150 MB runtime, which
  is moot next to the multi-GB UE5/model downloads.

The orchestrator is the same either way; only the window wrapper differs.
