# EduTutor.AI — Master Plan (road to v1.0.0)

**Date:** 2026-05-27
**Grant:** 09I05-03-V04-00072 · **Milestone:** Výstup 3 → ship **v1.0.0**
**Dev repo:** `github.com/princeofwellness/edotutor` (working) → **Release repo:** `github.com/sorrywecann/edututor-ai` (clean, public)
**Owner / lead:** PM (SORRYWECAN s.r.o.)

This plan consolidates the existing planning docs — it does not replace them. Each workstream links the doc(s) to build on. Public sandbox readers: per-workstream planning briefs (`docs/plans/*.md`, `avatar-emotion-blueprint-handoff.md`, `avatar-pipeline-handoff.md`) are internal documents not yet published — see GitHub issues for current state. The published references are:
`docs/architecture/ue5-avatar-contract.md`, `docs/ue5/viseme-to-arkit-mapping.csv`, `docs/guides/FINAL_TESTING_CHECKLIST.md`.

---

## Locked decisions (2026-05-27)
1. **Distribution:** one **downloadable EXE = a desktop launcher** that bootstraps the entire stack locally — the user downloads, runs, and it "just works." Heavy components (local LLM, UE5 avatar) are fetched/installed on first run rather than shipped raw where possible.
2. **Audio:** the **UE5 avatar is the single audio source** — it plays the speech so audio and lip-sync can never drift. The browser does not play TTS audio in avatar mode.
3. **Clean release:** ship a **fresh, clean public repo** `sorrywecann/edututor-ai` (no Claude / AI references in history, comments, or docs) rather than rewriting the dev repo's shared history.
4. **Target:** **Výstup 3 / v1.0.0.** (Confirm calendar deadline — see Open items.)

---

## People & briefs
| Who | Owns | Needs a brief on |
|---|---|---|
| **PM (lead)** | product, coordination, sign-off | every decision below |
| **UE5 Engineer** | UE5 avatar, scene, animations, **emotion plugin** | W4 (emotion JSON ↔ plugin naming — top priority), W2 (UE5 plays audio), W3 (lip-sync curves for the new avatar) |
| **Animation Engineer** | Blueprints (`ABP_Face_PostProcess`, visemes) | W3 (viseme→blendshape for the **new** avatar), W4 (emotion read/apply in BP) |
| **Partner's AI agent** | pipeline (has `avatar-pipeline-handoff.md` — internal, not yet published) | W1/W2 only if it touches packaging/streaming |
| **Eng (PM + tooling)** | frontend, backend, scaffolding, docs, release | execution of W1, W4(a/b), W5, W6, W8, W9 |

---

## Workstreams

### W1 — Desktop launcher EXE  *(one-click, runs everything)*
**Goal:** a single Windows installer/EXE the user downloads → it brings up frontend + backend + local LLM + UE5 avatar stream and opens the app.
**Build on:** `docs/plans/audio-sync-and-exe-packaging.md` (not yet published — see GitHub issues for current state).
**Tasks**
- [ ] Choose shell: **Tauri** (small, Rust) vs **Electron** (heavier, familiar). Recommend Tauri for installer size.
- [ ] Launcher orchestrates the stack (replaces `Start-EduTutor-Dev.ps1`): start `tutor-service`, frontend, Wilbur signalling, UE5 build — in order, with health checks.
- [ ] First-run setup: detect hardware, install Ollama + pull recommended model (reuse `/system/ollama-pull`), fetch/locate the UE5 build.
- [ ] Bundle vs fetch: ship the launcher small; download UE5 build + model on first run (avoid a multi-GB installer).
- [ ] **Windows code-signing** (cert) so SmartScreen doesn't block the download. ⚠️
- [ ] Graceful shutdown of all child processes on quit.
**Owner:** Eng + PM. **Depends on:** app functionally complete (P1/P2). **Phase:** 3 (Výstup 3 "Phase F").

### W2 — UE5 single-source audio + sync  *(your #2)*
**Goal:** UE5 plays the speech audio; lip-sync is generated from the same source → zero drift.
**Build on:** `docs/plans/audio-from-ue5-brief.md` (not yet published — see GitHub issues for current state).
**Tasks**
- [ ] Backend streams audio to UE5 (chunked over WS) instead of the browser playing it; browser muted in avatar mode.
- [ ] UE5 plays audio + drives visemes/ARKit from the same clock (UE5 Engineer).
- [ ] `/ws/avatar` **auto-reconnect** — currently drops on backend restart and needs a manual UE5 relaunch. ⚠️ (added)
- [ ] Retire / repurpose `UE5_BROADCAST_DELAY_MS` once audio is co-located.
**Owner:** Eng (protocol) + **UE5 Engineer** (UE5 playback). **Phase:** 1.

### W3 — Lip-sync blendshapes for the NEW avatar  *(your #3)*
**Goal:** accurate visemes on UE5 Engineer's new avatar (different face mesh than the old MetaHuman).
**Build on:** `docs/ue5/viseme-to-arkit-mapping.csv`, `docs/architecture/ue5-avatar-contract.md`, `ABP_Face_PostProcess`.
**Tasks**
- [ ] Re-map the 14-viseme inventory → the new avatar's blendshape/ARKit curve names.
- [ ] Tune per-viseme preset values in `Blueprints/ABP_Face_PostProcess` for the new mesh.
- [ ] Verify against the recorded Slovak viseme reference (`slovak-viseme-recording-brief.md` — not yet published; see GitHub issues for current state).
**Owner:** **Animation Engineer** + **UE5 Engineer**. **Phase:** 1.

### W4 — Emotions: detect → send → render  *(your #4 — HIGH PRIORITY, currently all "neutral")*
**Goal:** emotion + intensity detected from the LLM reply, sent in JSON, and visibly rendered on the avatar.
**Build on:** `docs/avatar-emotion-blueprint-handoff.md` (not yet published — see GitHub issues for current state); memory note "BP renders visemes but ignores emotion."
**Debug order (root-cause the all-neutral)**
- [ ] (a) Backend — confirm emotion is actually **classified**, not defaulting to `neutral`.
- [ ] (b) Contract — confirm `emotion` + `intensity` are in the `/ws/avatar` payload (verify a live broadcast).
- [ ] (c) UE5 — confirm the avatar/plugin **reads** the field.
- [ ] (d) **Naming match** — align our emotion labels with the emotion plugin's exact enum (UE5 Engineer). This is the most likely culprit.
- [ ] Lock the emotion JSON contract in `avatar-pipeline-handoff.md` (not yet published — see GitHub issues for current state).
**Owner:** Eng (a/b) + **UE5 Engineer** (c/d). **Phase:** 1.

### W5 — Avatar in the KB workspace + the orb  *(your #5)*
**Goal:** spawn the avatar inside Knowledge Base mode (talk to your documents *with* the avatar); finalize the main-page orb.
**Tasks**
- [ ] Embed `AvatarContainer` in KB `VoiceMode` (avatar answers from the active KB).
- [ ] Decide the orb's final role (keep `GradientOrb` as the no-stream fallback; confirm look).
**Owner:** Eng. **Phase:** 2.

### W6 — Modular voice / TTS providers  *(your #6)*
**Goal:** a clean, modular provider system — add TTS engines + voices without code churn; smart, intuitive UI.
**Tasks**
- [ ] Provider registry (engine + voices) the UI reads dynamically.
- [ ] Manage providers from the chip/settings popover; surface voice-cloning (OmniVoice).
- [ ] Keep cloud keys (OpenAI/Anthropic/DeepSeek) + local paths consistent with onboarding.
**Owner:** Eng. **Phase:** 2.

### W7 — End-to-end testing  *(your #7)*
**Goal:** full chain on the packaged EXE: mic → STT → KB/RAG → LLM → **emotion** → TTS → **UE5 audio** → lip-sync → speech.
**Build on:** `docs/guides/FINAL_TESTING_CHECKLIST.md`, `docs/test_report.md`.
**Tasks**
- [ ] Scripted E2E pass (voice + text), Slovak QA, KB-grounded answers.
- [ ] STT + TTS matrix (local + cloud).
- [ ] **Latency target ~300–600 ms perceived** validated on the perf page. (added)
- [ ] Run the whole thing from the EXE on a clean machine.
**Owner:** PM + Eng. **Depends on:** W2, W3, W4, W1. **Phase:** 4.

### W8 — Final technical documentation  *(your #8 — grant deliverable)*
**Goal:** docs match shipped reality. Update `EduTutor_AI_Technicka_Dokumentacia_final_v0.1.md` (internal — not yet published) + `docs/architecture/TECHNICKA_DOKUMENTACIA.md`. **Owner:** Eng + PM. **Phase:** 5.

### W9 — Clean public release (no Claude / AI references)  *(your #9)*
**Goal:** publish **`github.com/sorrywecann/edututor-ai`** v1.0.0 — clean history, no AI references in commits/comments/docs.
**Method (recommended): fresh repo, not history-rewrite.**
- [ ] Tag a backup of the dev repo first. ⚠️
- [ ] Squash to clean v1.0.0 commits authored by the team (no `Co-Authored-By` AI lines).
- [ ] Strip AI references from code comments + docs.
- [ ] Verify no secrets land in the public repo (see W-A).
**Owner:** Eng + PM. **Phase:** 5 (last).

### W10 — AGENT.md for future builders  *(your #10, later)*
Contributor/agent guide in the release repo. **Phase:** 5 (after v1.0.0).

### W-A — Security / secrets pass  *(added — not on your list, important)*
- [ ] **Rotate cloud service API keys** per the security checklist.
- [ ] `.env` hygiene; confirm **no secrets in git history** before the public release (W9 freezes it).
**Owner:** PM + Eng. **Phase:** 0 + re-check before P5.

---

## Roadmap (phases)
- **Phase 0 — now:** confirm decisions; **W-A** security pass; send briefs to **UE5 Engineer** (W4 + W2 + W3) and **Animation Engineer** (W3 + W4).
- **Phase 1 — Pipeline correctness:** **W4 emotions** → W2 UE5 audio/sync → W3 lip-sync → reconnect. *Nothing else matters until the avatar speaks, synced, with emotion.*
- **Phase 2 — Product (parallel):** W5 avatar-in-KB + orb, W6 modular TTS.
- **Phase 3 — Packaging:** W1 one-click EXE + code-signing.
- **Phase 4 — E2E testing:** W7 on the EXE + latency + Slovak QA.
- **Phase 5 — Finalize & release:** W8 docs → W-A re-check → **W9 clean public release** → W10 AGENT.md.

---

## Open items to confirm
1. **Výstup 3 calendar deadline** (the plan estimates ~6–8 days effort; need the real date to schedule phases).
2. **EXE bundling detail:** which heavy parts ship vs first-run download (UE5 build size; Ollama model).
3. **Code-signing cert** for Windows (procurement lead time).
4. **Who drives the cloud-deploy track** (`render.yaml`/Docker already in `main`) — is it a separate web product, or staging for the desktop backend?

---

## Next: briefs to generate from this plan
- **Brief → UE5 Engineer:** emotion JSON ↔ plugin naming (W4), UE5 audio playback + sync (W2), new-avatar lip-sync curves (W3).
- **Brief → Animation Engineer:** viseme→blendshape mapping + preset tuning for the new avatar (W3), emotion read/apply in the Blueprint (W4).
- **Brief → Partner's agent:** packaging/streaming touchpoints (W1/W2) — only if in scope.
- **Internal task list:** Phase-ordered checkboxes (W1, W4a/b, W5, W6, W8, W9) for Eng.
