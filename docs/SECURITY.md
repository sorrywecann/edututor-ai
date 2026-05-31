# EduTutor.AI — Security Posture

## v0.8.0 (W7 — Security Hardening)

### Hardened this batch

- **Electron `webPreferences`** (`desktop/main.mjs`): both the splash window
  and the main window now pin `sandbox: true` and `webSecurity: true`
  explicitly. `contextIsolation: true` was already on. The preload
  (`desktop/preload.cjs`) uses only `electron.contextBridge` — no Node
  modules — so sandboxing is safe.
- **External link handling** (`setWindowOpenHandler`): unchanged — non-
  frontend URLs still open in the OS browser via `shell.openExternal`, never
  inside the Electron shell.
- **Child-process env allowlist** (`desktop/orchestrator.mjs`): the four
  spawned services (Ollama, backend, frontend, Wilbur) no longer inherit
  the full parent environment via `{ ...process.env }`. A `_filteredEnv()`
  function passes only OS basics (`PATH`, `USERPROFILE`, `APPDATA`, …) plus
  the EduTutor-specific vars they actually need (`EDU_DEV_MODE`,
  `OLLAMA_MODELS`, `EDU_UE5_AUDIO`, `HF_HOME`, …). Developer secrets in
  the parent env (AWS keys, GH_TOKEN, npm tokens, …) no longer leak to
  long-running subprocesses.
- **`.gitignore`** (S4): added `.env.local`, `.env.*.local`, `*.key`,
  `*.pem`, `secrets/`, `.aws/` to the secrets block.
- **Dev-only endpoints** (already shipped in v0.8.0): `prompt_eval` and
  `diagnostics` routers are gated behind a shared `_dev_gate.py` dependency
  that returns 404 unless `EDU_DEV_MODE=1`. End-user installs never expose
  these.

### Opt-ins

- `EDU_DEV_MODE=1` — enables dev-only HTTP routers (prompt eval, diagnostics).
- `EDU_DEV_AVATAR_DEBUG=1` — enables verbose avatar/lipsync logging.
- LLM API keys (OPENAI/ANTHROPIC/DEEPSEEK): loaded by the backend from
  `tutor-service/.env` (or `EDU_ENV_FILE` in packaged installs) via
  `python-dotenv`. They are NOT in the orchestrator allowlist by design —
  child processes that don't need them never see them.

### Deferred (out of scope for this batch)

- `/lipsync/*` HTTP routes — separate audit pass; do not touch in W7.
- Code signing / notarization of the Electron installer.
- LLM API key rotation guidance for end users (planned for v0.8.1 onboarding doc).
- Per-request CORS allowlist tightening (currently permissive for `localhost`).
