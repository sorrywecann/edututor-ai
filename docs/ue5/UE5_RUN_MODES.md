# UE5 Run Modes — Packaged `.exe` vs. Editor (and why both "just connect")

This answers a recurring confusion: *"In one workflow I pull from git and it wants
to start an **`.exe`**, but another time we just run the signalling server + the UE
project and it connects. What's the difference?"*

**Short answer:** they are **two ways to run the same UE5 game**, not two different
projects. They differ in **exactly one** of the stack pieces — *how the UE5 avatar
binary is launched*. Everything else (backend, frontend, signalling server) is
**identical**.

For the full clone→avatar setup use [`FULL_STACK_SETUP.md`](./FULL_STACK_SETUP.md)
(portable) or [`START_STACK.md`](./START_STACK.md) (this machine's exact paths).
This doc only explains the UE5 piece and why the two modes are interchangeable.

> Paths below use the same placeholders as `FULL_STACK_SETUP.md`:
> `<REPO>` = the backend+frontend checkout (`main`), `<UE>` = the `EdutorUE` folder
> from the **`Edutor_UnrealEngine`** branch. On the all-in-one branch they're the
> same clone (`<UE>` = `<REPO>\EdutorUE`).

---

## Why both modes connect to the signalling server the same way

Pixel Streaming is a **UE plugin compiled into the project**, not part of any
launcher script. The cooked `SlovakEdu.exe` and the editor-run game both contain
the same plugin. So in either mode:

- Passing **`-PixelStreamingURL=ws://127.0.0.1:8888`** makes the game dial the
  signalling server's **streamer endpoint** (`:8888`) and register as
  **`DefaultStreamer`** (UE 5.7 ignores `-PixelStreamingID`, so it always falls back
  to that default).
- The browser / iframe connects to the **player endpoint** (`:80`).
- The avatar logic is the same compiled code: on `BeginPlay` the Blueprint
  `Edutor_AgentConnection` connects to `ws://localhost:8000/ws/avatar` and receives
  emotion/viseme commands.

**Only the host process differs** (cooked exe vs. editor-driven game). That's why
"it just connects" no matter which you launch — as long as a signalling server is
up first and you pass the streamer URL.

---

## Where the signalling server comes from (applies to both modes)

You need a Pixel Streaming signalling server on `:80` (player) + `:8888` (streamer).
Two ways to get one:

1. **Standalone signalling server** — `cd <UE>; .\RunPixelStreamingServer.bat`.
   First run builds the signalling monorepo (bundled Node + libraries + player page),
   then serves `:80`/`:8888`. Required for **Mode A** and for **Mode B run with
   `-game`** (neither has an editor to host it).
2. **The editor's embedded server** — if the project is already **open in the UE 5.7
   editor GUI**, the editor hosts its own signalling on `:80`/`:8888`, so you can skip
   the standalone server. (This is how the stack was first verified.) Only available
   while the editor GUI is running.

---

## Mode A — Packaged `.exe` (sharing / no-editor machines)

`SlovakEdu.exe` is the UE5 project **cooked** into a standalone game. It needs **no
UE editor installed** and **no shader compile** (shaders are cooked in → starts in
seconds). This is what a release ships and what you hand to someone without UE.

**Launch (with a signalling server already up):**
```bat
SlovakEdu.exe -PixelStreamingURL=ws://127.0.0.1:8888
```
That one line is the whole of `<UE>\SlovakEdu_WithPixelStreaming.bat`.

Builds are produced by cooking the project (UE → Platforms → Windows) and are shared
as `Edutor<date>` folders. The real binary lives at
`SlovakEdu\Binaries\Win64\SlovakEdu.exe`; a small launcher-shim `SlovakEdu.exe` at the
folder root redirects to it.

> ⚠️ On this machine the only packaged builds (`Downloads\Edutor0515`,
> `Desktop\Edutor 0514`) are **stale** — they predate current avatar work (e.g. only
> `JawAlpha` wired). Use Mode B until a fresh package is cooked.

**Pros:** instant start, no editor, what an end user / release runs.
**Cons:** can't edit Blueprints or the scene; you're stuck with whatever was cooked.

---

## Mode B — Editor / source (active development)

Runs the **project source** through the installed UE 5.7 editor. Needs the editor
**and** the UE project (`<UE>`). First launch from a cold checkout **compiles
shaders** (minutes); a checkout with a warm `DerivedDataCache` starts in under a
minute.

**Standalone game session (what dev uses — needs a separate signalling server):**
```powershell
& "C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" `
  "<UE>\SlovakEdu.uproject" `
  -game -PixelStreamingURL=ws://127.0.0.1:8888 `
  -windowed -ResX=1920 -ResY=1080 -AudioMixer `
  -ExecCmds="r.BloomQuality 0, r.DepthOfFieldQuality 0, r.MotionBlurQuality 0, DisableAllScreenMessages, PixelStreaming.Encoder.MaxQP 18, PixelStreaming.WebRTC.MaxBitrate 100000000, PixelStreaming.WebRTC.Fps 60"
```
`-game` runs the project as a standalone game session **without cooking** — the
editor binary is the host. The default map is `/Game/Level/Main_MH`. See
`START_STACK.md` §5 for what each `-ExecCmds` flag does (bloom/DoF off, near-lossless
encoder, etc.).

**Editor GUI + Play** — `<UE>\Open-SlovakEdu-Streaming.bat` just opens the editor on
the `.uproject`; then hit **Play**. In this variant the editor hosts the embedded
signalling server, so no separate server is needed.

**Pros:** live Blueprint/scene edits, always current source, full quality flags.
**Cons:** needs the editor; first-run shader compile; heavier than the cooked exe.

---

## Which to use when

| You want to… | Mode |
|---|---|
| Develop the avatar (Blueprints, emotion wiring, scene) | **B** |
| Demo / run on a machine without UE / ship the clean release | **A** (once a fresh package is cooked) |

The repo's portable launchers cover the dev path end-to-end:
`Start-EduTutor-Web.ps1` (backend + frontend) then `Start-EduTutor-Avatar.ps1`
(signalling + the UE5 `-game` streamer). See `FULL_STACK_SETUP.md`.

---

## Gotchas specific to the UE5 piece

- **Only ONE streamer instance.** A second registers a stray streamer. Kill strays:
  `Get-Process UnrealEditor,SlovakEdu | Stop-Process -Force`.
- **Restarting the Backend drops `/ws/avatar`** and UE does **not** auto-reconnect —
  relaunch the UE5 game (either mode).
- **`clients:0` on `/api/v1/avatar/status`** → the UE game isn't *playing* (an open
  editor that isn't in Play ≠ streaming) or wasn't launched with `-game`. The
  Blueprint connects on `BeginPlay`.
- **Black avatar in the browser** → the page loaded before the streamer was ready;
  hard-refresh with **Ctrl+Shift+R**.
- The signalling server's `config.json` may hardcode another machine's `http_root`;
  `RunPixelStreamingServer.bat` / the documented `--http_root` override handle this
  (see `START_STACK.md` §4).
