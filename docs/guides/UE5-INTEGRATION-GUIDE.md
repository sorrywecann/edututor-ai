# UE5 Blueprint Integration Guide — EduTutor.AI

> **Tento súbor bol nahradený.** Kanonickú špecifikáciu UE5 ↔ backend
> protokolu nájdeš v [`ue5-avatar-contract.md`](./ue5-avatar-contract.md)
> (aktuálne v4.0). Tu je len rýchly pointer.

---

## Pre PM (UE5 Blueprint dev)

**Backend endpoint:** `ws://localhost:8000/ws/avatar`
**Status check:** `GET http://localhost:8000/api/v1/avatar/status`
**Smoke test (bez UE5):** `python scripts/smoke_avatar_ws.py`
**Blueprint logika v TypeScripte:** [`core/src/app/(shell)/avatar-debug/simulator/page.tsx`](../core/src/app/(shell)/avatar-debug/simulator/page.tsx) — ten súbor JE Blueprint referencia.

## Verzie protokolu (kumulatívne)

| Verzia | Pridáva |
|---|---|
| v2.0 | `emotion`, `intensity`, `isSpeaking`, `visemes`, `blink`, `viseme_timeline`, `total_duration_ms` |
| v2.1 | `agentState` (idle / thinking / searching / writing / listening) — voliteľné, back-compat |
| v3.0 | `arkit` (52 ARKit blendshapes, PascalCase) + `arkit_frames` timeline @ 60fps |
| v4.0 | `audioPositionMs` + `sentenceIdx` (per-frame audio clock — viď simulátor) |

Detaily, JSON príklady, naming convention pre MetaHuman LiveLink / `SetMorphTarget()`, emotion tabuľka a failure-mode matrix sú v [`ue5-avatar-contract.md`](./ue5-avatar-contract.md).

## Pre 3D tím (UE5 Engineer, Adrián)

- ARKit kanály produkuje `tutor-service/app/services/audio2lipsync_client.py` (52 PascalCase mien — viď [`audio2lipsync/constants.py`](../tutor-service/app/services/audio2lipsync/constants.py))
- LiveLink Pose Asset `mh_arkit_mapping_pose` (od MetaHuman) automaticky mapuje PascalCase → Control Rig
- Validácia rig→viseme (bez PM): otvor [`/avatar-debug/simulator`](http://localhost:3000/avatar-debug/simulator) v prehliadači, scrubuj timeline, sleduj farebné viseme pills

## Pre platform dev

- Pri zmene protokolu: najprv edituj [`ue5-avatar-contract.md`](./ue5-avatar-contract.md), pin v [`tutor-service/tests/test_ws_avatar.py`](../tutor-service/tests/test_ws_avatar.py), implementuj v [`tutor-service/app/api/chat.py`](../tutor-service/app/api/chat.py) (`_broadcast_avatar_state` helper)
- v2.1+ pridanie polí MUSÍ byť back-compat: pole sa **vynecháva** keď nie je nastavené (nie default value)
- 600 backend testov zelených = neporušený kontrakt

---

*Predchádzajúce vydanie tohto súboru (v2.0-only, 171 riadkov) bolo nahradené 2026-05-12. Dôvod: drift od kanonickej špecifikácie (chýbal v2.1 agentState, v3.0 arkit, v4.0 audioPositionMs). Single source of truth = [`ue5-avatar-contract.md`](./ue5-avatar-contract.md).*
