# UE5 Team Branch — Complete Deep Dive & Integration Mapping

**Analysis date:** 2026-05-22
**Branch:** `origin/Edutor_UnrealEngine` (Dominik + Martin)
**Diverged from main at:** `5fdabd86` (late April 2026)
**Our current HEAD:** `e39d68b9` (2026-05-22)

---

## 1. Branch Timeline

```
main: ...fbc38e22 [our last commit before audit batch]
           │
           ├── 818ea99f fix: endSession + StudyMode + session_name
           ├── 01bf1e08 docs: drift alignment (595 tests, 8 modes, 7 TTS)
           ├── 20e3e1eb docs: STATE_OF_PROJECT.md + audits + PDF
           ├── cfabf05a docs: professional PDF/HTML
           ├── 6745cc95 docs: CHANGELOG update
           └── e39d68b9 docs: avatar protocol deep dive ← HEAD

Edutor_UnrealEngine: diverged at 5fdabd86 (merge with main at April 30)
           │
           ├── 55575c9d Merge remote-tracking branch 'origin/main' into Unreal_Vis
           ├── 1dbb2886 Cleanup with new avatar part 1
           ├── 63f100bf Cleanup with new avatar part 2
           ├── d5f1d4cf Cleanup with new avatar part 3
           ├── 8d0788f0 Pushed lfs
           ├── b64a2a6c Cleanup with new avatar part 5
           ├── adcad094 Cleanup with new avatar part 6
           ├── 8e17e505 upload of PixelStreaming server
           ├── 57f5d114 added MHC_Girl, parenting
           ├── 53bb1b5d Martin - animace na skeletonu a osvětlení
           ├── 7d80632c Dominik - update Readme pro vývoj Viseme a reset hodnoty
           └── ecb45de8 Martin - oprava trika
```

**Key insight:** The UE5 branch diverged BEFORE all of our hardening work. Their branch is based on pre-May code. This explains why their shared code changes appear to "revert" our improvements — they never had them.

---

## 2. What the UE5 Team Built

### 2.1 UE5 Project (`EdutorUE/`)

**MetaHuman:** Ada (Epic Marketplace MetaHuman)
**Level:** `Main_MH.umap`
**Engine config highlights:**
- WebControl enabled (`WebControl.EnableServerOnStartup=1`)
- Hardware ray tracing
- Default graphics: Maximum
- Skin cache with shader compilation
- Unlimited bone influences for GPU skin

**Blueprint Architecture (10 Blueprints):**

| Blueprint | Purpose | Contract Relevance |
|---|---|---|
| `Edutor_MetaHuman_Base.uasset` | Base MetaHuman character class | Animation layer root |
| `Edutor_Body_AnimBP.uasset` | Body animation blueprint | Idle/talking body poses |
| `ABP_Ada_FaceMesh_PostProcess.uasset` | Face mesh post-process | ARKit → blendshape pipeline |
| `FacePose.uasset` | LiveLink Face Pose asset | ARKit channel mapping |
| `Edutor_AgentConnection.uasset` | WebSocket client to `/ws/avatar` | **CRITICAL** — protocol contract |
| `VisemeEnum.uasset` | Viseme enumeration | Defines supported viseme set |
| `Viseme.uasset` | Viseme data structure | `{viseme, weight, duration}` |
| `VisemeTask.uasset` | Async viseme timeline player | **CRITICAL** — how BP plays visemes |
| `Command.uasset` | Avatar command parser | JSON → animation dispatch |
| `ControlPanel.uasset` | Level control panel | Debug/testing UI |

**Blueprint flow (inferred from naming):**
```
Edutor_AgentConnection (WS client)
  ↓ receives JSON from /ws/avatar
Command (parses JSON)
  ↓ emotion, isSpeaking, visemes, blink, viseme_timeline, total_duration_ms
VisemeTask (plays timeline)
  ↓ reads viseme_timeline[], total_duration_ms
  ↓ floor(elapsed_ms / frame_step) → active viseme
Edutor_Body_AnimBP (body animation layer)
  + ABP_Ada_FaceMesh (face via ARKit)
  = final MetaHuman animation
```

### 2.2 PixelStreaming Server

**Commit:** `8e17e505` "upload of PixelStreaming server"
- UE5 PixelStreaming server packaged alongside the project
- Allows browser-based streaming of the UE5 viewport
- Activated via `?ue5=URL` query param in the frontend

### 2.3 Strategy Documents (`EDOTUTOR_V2/`)

| Document | Content |
|---|---|
| `EDUTUTOR_DEVELOPER_GUIDE.md` | Full integration guide: TPII + edututor-rough → unified backend. 10-15 day plan. Fáza 1 (Setup), Fáza 2 (Unified Backend), Fáza 3 (UE Project), Fáza 4 (Frontend), Fáza 5 (Testing) |
| `EDUTUTOR_PB3_KOMPLETNY_KRITICKY_AUDIT.md` | Critical audit of the entire project (Slovak) |
| `EDUTUTOR_DUAL_CORE_COMPLETE_SOLUTION.md` | Dual-core architecture proposal |
| `MetaHuman_AI_Avatar_Technical_Blueprint.docx` | Technical Blueprint for the avatar |

### 2.4 Research Documents

| Document | Lines | Finding |
|---|---|---|
| `EXECUTIVE_SUMMARY.md` | ~150 | Slovak phonetics: keep current system, add 3 rules (assimilation, palatalization, diphthongs). GPL-3.0 tools rejected (license). Transphone too heavy. |
| `AnimaSync_Deep_Analysis.md` | ~200+ | Detailed analysis of AnimaSync as lipsync alternative. WASM + ONNX inference. 141-dim features @ 30fps. UniLSTM + CausalTransformer + FiLM. 5-dim emotion input. |
| `ANIMASYNC_INTEGRATION_ARCHITECTURE.md` | ~300+ | Full integration blueprint. TTS → AudioContext → AnimaSync WASM → ONNX inference → viseme output → UE5 via WS. |
| `ANIMASYNC_QUICK_REFERENCE.md` | ~100 | Quick reference card for AnimaSync |
| `TTS_DECISION_MATRIX.md` | 209 | 8-section comparison: Pocket TTS, OpenVoice V2, Edge TTS, Azure TTS, Piper. Latency, RT factor, languages, features, hardware, integration effort, cost. |
| `TTS_EVALUATION_POCKET_VS_OPENVOICE.md` | ~200 | Deep comparison of Pocket TTS vs OpenVoice V2 for Slovak |
| `VOICEBOX_ARCHITECTURE_ANALYSIS.md` | ~200 | Meta VoiceBox architecture analysis |
| `OPEN_NOTEBOOK_ARCHITECTURE.md` | ~200 | Open Notebook backend research (Notebook/Source/Note/Insight data models, SurrealDB, RAG pipeline, LiveKit worker) |
| `PHONETIC_ANALYSIS.md` | ~150 | Detailed Slovak phonetic analysis |

### 2.5 Backend Enhancements (ENHANCEMENT_CHANGELOG.md, 209 lines)

| Enhancement | Files | Status (vs our main) |
|---|---|---|
| Voice clone API (upload/list/delete/preview) | `voice_clones.py` (238 lines) | ❌ NOT in main |
| Emotion backend runtime switch | `emotion.py` (56 lines) | ❌ NOT in main |
| Phonetic rules (assimilation, palatalization, diphthongs) | `viseme_timeline.py` (+79 lines) | ✅ Already in main (better version) |
| Hybrid lipsync provider | `audio2lipsync_client.py`, `lipsync.py`, `chat.py` | ❌ NOT in main |
| XTTS reference voice scanning | `tts.py` (+15 lines) | ❌ NOT in main |

---

## 3. Shared Code Changes — REGRESSION ANALYSIS

### 3.1 WebSocketServerAdapter.ts (115 lines changed — CRITICAL REGRESSION)

**All removed:**
- Logger import (`import { logger }`)
- Adapter state machine (connecting/connected/reconnecting/disconnected)
- Exponential backoff constants + logic (500ms→30s, ±20% jitter)
- Heartbeat detection (15s timeout)
- Message queue flush on reconnect
- Destroy flag (prevents operations after disconnect)
- State handler callback

**Result:** The WS Server adapter on their branch has NO reconnection, NO heartbeat, NO state tracking. It's a bare WebSocket with console.log.

**Verdict:** ⛔ DO NOT MERGE. Our version is objectively superior.

### 3.2 useUE5Bridge.ts (8 lines changed — HIGH REGRESSION)

**Removed:**
- `sentenceIdx` parameter from `startLipsync()` and `startARKitLipsync()`
- `audioPositionMs` and `sentenceIdx` from sent commands (v4.0 protocol fields)
- Frame step fallback changed: `40 → 8` (back to dense frames, pre-coarticulation tuning)

**Result:** Loses UE5-side viseme lookup capability. Coarticulation tuning undone.

**Verdict:** ⛔ DO NOT MERGE. Our version has the v4.0 protocol extensions.

### 3.3 useVoiceSession.ts (357 lines changed — CRITICAL REGRESSION)

**Removed:**
- `api` import (their branch predates our endSession fix!)
- `logger` import
- `sentenceIdx` from QueueItem
- `readWithTimeout` timer-leak fix (reverted to leaky version)
- MediaSource-backed live streaming (entire feature removed)
- Per-sentence streaming buffers

**Result:** Massive strip-down of the voice session hook. Loses live audio streaming, timer leak fix, and the `api.endConversation()` call we just fixed.

**Verdict:** ⛔ DO NOT MERGE.

### 3.4 api.ts (66 lines changed — HIGH REGRESSION)

**Removed:**
- `X-EduTutor-User-Id` header from all requests
- Podcast API (createPodcast, getPodcast, getPodcastAudioUrl, deletePodcast)
- `renameKnowledgeBase()` method
- `clearKBDocuments()` method
- `PodcastResponse` interface

**Result:** Loses user identity tracking and podcast functionality.

**Verdict:** ⛔ DO NOT MERGE (the header removal breaks Phase 8a/b).

### 3.5 AvatarContainer.tsx (28 lines changed — MEDIUM REGRESSION)

**Removed:**
- `logger` import
- SSR-safe streamUrl pattern (used `useState` + `useEffect`)
- Gating condition changed from `streamUrl` to `ue5Bridge.mode === 'pixel-streaming'` (narrower)

**Result:** Inline URL parsing, no logger, different gating logic.

**Verdict:** ⚠️ REVIEW CAREFULLY. The narrower gating (`ue5Bridge.mode === 'pixel-streaming'`) might actually be better, but the SSR-safe pattern was correct.

### 3.6 types.ts (9 lines removed — LOW)

Their branch has slightly fewer type exports. Minimal impact.

### 3.7 Other changed files (largely cosmetic/stripping)

- `core/README.md` (-63 lines)
- `core/package.json` (-25 lines of dependencies)
- `core/pnpm-lock.yaml` (-3045 lines of lockfile)
- Multiple KB components simplified
- `VoiceZone.tsx` (-286 lines)
- `ModePicker.tsx` (-253 lines)
- `use-reconnecting-websocket.ts` (-264 lines, entire file removed)
- `cleanMarkdown.ts` + test (-117 lines removed)
- `connection-state-pill.tsx` (-59 lines removed)
- `vitest.config.ts` (-23 lines removed)
- Multiple podcast-related files removed
- `dev-blueprint-changes.html` (-640 lines removed)
- `technicka-dokumentacia.html` (-1205 lines removed)

---

## 4. What We Have vs What They Have

### ✅ We have that they don't (keepers):
| Feature | Our main | Their branch |
|---|---|---|
| Exponential backoff WS reconnect | ✅ | ❌ (removed) |
| Heartbeat detection | ✅ | ❌ (removed) |
| Logger (tagged, structured) | ✅ | ❌ (console.log only) |
| v4.0 protocol (audioPositionMs, sentenceIdx) | ✅ | ❌ (removed) |
| endSession → api.endConversation() fix | ✅ | ❌ (predates fix) |
| MediaSource live audio streaming | ✅ | ❌ (removed) |
| Timer leak fix (readWithTimeout) | ✅ | ❌ (reverted) |
| X-EduTutor-User-Id header | ✅ | ❌ (removed) |
| Podcast API | ✅ | ❌ (removed) |
| 595 aligned test count across docs | ✅ | ❌ |
| 8 LearningModes (correct count) | ✅ | ❌ |
| Professional PDF | ✅ | ❌ |
| STATE_OF_PROJECT.md | ✅ | ❌ |
| Avatar protocol deep dive | ✅ | ❌ |
| StudyMode mounted | ✅ | ❌ |

### ✅ They have that we don't (valuable):
| Feature | Description | Action |
|---|---|---|
| `EdutorUE/` | Full UE5.5 project with Ada MetaHuman | **EXTRACT** — copy entire project |
| 10 Blueprints | Viseme/Command/AgentConnection/FacePose | **STUDY** — understand contract |
| `EDOTUTOR_V2/` | Strategy + audit + developer guide | **READ** — extract requirements |
| AnimaSync research | Alternative lipsync engine | **ARCHIVE** — future reference |
| TTS decision matrix | 8-section comparison of 5 TTS engines | **KEEP** — useful reference |
| Voice clone API | Upload/list/delete/preview voice clones | **EVALUATE** — useful for reference voices |
| Phonetic rules | 3 Slovak rules (assimilation, palatalization, diphthongs) | **NOTE** — already in main |
| PixelStreaming server | Packaged with UE5 project | **EXTRACT** — with EdutorUE/ |

---

## 5. Integration Plan

### Phase A: Extract UE5 Project (1 hour)
```bash
# Copy the UE5 project from their branch
git checkout origin/Edutor_UnrealEngine -- EdutorUE/
git checkout origin/Edutor_UnrealEngine -- EDOTUTOR_V2/

# Commit with proper attribution
git add EdutorUE/ EDOTUTOR_V2/
git commit -m "feat(ue5): add EdutorUE project + strategy docs from Dominik/Martin

Blueprint architecture: Edutor_MetaHuman_Base, VisemeTask,
Edutor_AgentConnection, Command, FacePose, VisemeEnum, EdutorPawn,
ControlPanel, Edutor_Body_AnimBP

MetaHuman: Ada (Epic Marketplace)
Level: Main_MH.umap with PixelStreaming support"
```

### Phase B: Archive Research (30 min)
```bash
# Copy research documents (rename with ue5-research/ prefix)
mkdir -p docs/ue5-research/
git show origin/Edutor_UnrealEngine:AnimaSync_Deep_Analysis.md > docs/ue5-research/animasync-deep-analysis.md
git show origin/Edutor_UnrealEngine:ANIMASYNC_INTEGRATION_ARCHITECTURE.md > docs/ue5-research/animasync-architecture.md
git show origin/Edutor_UnrealEngine:TTS_DECISION_MATRIX.md > docs/ue5-research/tts-decision-matrix.md
git show origin/Edutor_UnrealEngine:TTS_EVALUATION_POCKET_VS_OPENVOICE.md > docs/ue5-research/tts-pocket-vs-openvoice.md
git show origin/Edutor_UnrealEngine:VOICEBOX_ARCHITECTURE_ANALYSIS.md > docs/ue5-research/voicebox-analysis.md
git show origin/Edutor_UnrealEngine:OPEN_NOTEBOOK_ARCHITECTURE.md > docs/ue5-research/open-notebook.md
git show origin/Edutor_UnrealEngine:PHONETIC_ANALYSIS.md > docs/ue5-research/phonetic-analysis.md
git show origin/Edutor_UnrealEngine:EXECUTIVE_SUMMARY.md > docs/ue5-research/phonetic-executive-summary.md

git add docs/ue5-research/
git commit -m "docs(ue5-research): archive Dominik/Martin AnimaSync/TTS/VoiceBox/phonetics research"
```

### Phase C: Evaluate Voice Clone API (2 hours)
- Review `voice_clones.py` (238 lines) for integration feasibility
- Check if it conflicts with our current TTS provider architecture
- If compatible: integrate as `POST/GET/DELETE /api/v1/voice-clones`
- If not: document as reference for future voice-clone feature

### Phase D: Understand Blueprint Contract (4 hours)
Key questions to answer from Blueprints:
1. What JSON fields does `Command` actually parse? (our `AvatarCommand` type vs reality)
2. How does `VisemeTask` handle `viseme_timeline`? (does it use `total_duration_ms` for self-timing?)
3. What happens when `isSpeaking: false` arrives mid-timeline? (cancel behavior)
4. Does `Edutor_AgentConnection` support reconnection?
5. What visemes does `VisemeEnum` define? (does it match our 14 + sil?)
6. How does `FacePose` map ARKit channel names? (PascalCase vs camelCase)

### Phase E: Do NOT Merge These Files (EVER)
- `core/src/lib/ue5-bridge/WebSocketServerAdapter.ts` (regression)
- `core/src/hooks/useUE5Bridge.ts` (regression)
- `core/src/hooks/useVoiceSession.ts` (regression)
- `core/src/lib/api.ts` (regression)
- `core/src/components/voice/AvatarContainer.tsx` (partial regression)
- `README.md` (our version is superior)
- `core/package.json` (removes dependencies)
- All removed test files (our test suite is complete)
- All removed KB/podcast files (we need those)

---

## 6. Blueprint → Code Contract Mapping

Based on Blueprint naming and our JSON protocol, here's the inferred contract:

| Blueprint | Expects from us | Sends to us |
|---|---|---|
| `Edutor_AgentConnection` | WS connection to `/ws/avatar` | `avatar_ready`, `speech_complete` |
| `Command` | `{emotion, intensity, isSpeaking, visemes, blink, viseme_timeline, total_duration_ms, agentState?}` | → dispatches to animation layers |
| `VisemeTask` | `viseme_timeline: [{viseme, start_ms, duration_ms}, ...]` + `total_duration_ms` | → drives face animation |
| `FacePose` | ARKit channel names (PascalCase expected) | → blendshape weights |
| `VisemeEnum` | Our 14+sil viseme string values | → validation |

**⚠️ Open questions we need answered by opening the Blueprints in UE5 editor:**
1. Exact ARKit channel naming convention (PascalCase? `JawOpen` or `jawOpen`?)
2. Whether agentState field is consumed (v2.1 protocol)
3. Whether arkiteframes are consumed (52-channel mode)
4. Exact viseme value strings (do they match our `PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou, ww, uw, sil`?)
5. What frame step the BP uses (8ms? 80ms? configurable?)
6. Maximum supported timeline length (UE5 BP has memory limits)

---

## 7. Summary: Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Blueprint contract doesn't match our JSON protocol | 🟠 HIGH | Must open Blueprints in UE5 editor to verify |
| Viseme naming mismatch (our 14 vs BP's enum) | 🟠 HIGH | Must verify `VisemeEnum` values |
| ARKit channel naming mismatch (PascalCase vs camelCase) | 🟠 HIGH | Must verify `FacePose` mapping |
| Shared code regressions accidentally merged | 🟡 MEDIUM | Explicit do-not-merge list in Phase E |
| UE5 project requires different engine version | 🟡 MEDIUM | Check `.uproject` engine version |
| PixelStreaming path has performance issues | 🟡 MEDIUM | Need latency benchmarking |

---

## 8. Next Steps

1. **Immediate (today):** Extract `EdutorUE/` + `EDOTUTOR_V2/` + archive research docs
2. **This week:** Open `EdutorUE/` project in UE5 editor → verify Blueprint contract
3. **This week:** Create `docs/ue5-contract-verified.md` with exact answers to Phase D questions
4. **Next sprint:** Evaluate voice clone API for integration
5. **Post-grant:** AnimaSync evaluation (if perceptual MOS study recommends it)
6. **Never:** Merge shared code changes from this branch (all are regressions from our hardening)
