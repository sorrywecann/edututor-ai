# Lipsync — Codepath Audit

**Verzia:** draft v0.1  ·  **Datum:** maj 2026
**Ucel:** Technicka mapa lipsync kodovych ciest pre validation report.

---

## Subory v audite

| Subor | Ucel |
|---|---|
| `tutor-service/app/services/viseme_timeline.py` | Text→14 viseme: slovenska fonetika + coarticulation ramp |
| `tutor-service/app/services/audio2lipsync_client.py` | Audio→52 ARKit: lokalny HuBERT infer, singleton runtime |
| `tutor-service/app/services/audio2lipsync/model.py` | HuBERT Large + 8-layer Transformer → 52 blendshapes |
| `tutor-service/app/services/audio2lipsync/constants.py` | 52 ARKit kanalov, loss weights, FACE_FPS=60 |
| `tutor-service/app/services/expression_presets.py` | 9 emocnych presetov → upper-face ARKit kanaly |
| `tutor-service/app/services/avatar_broadcaster.py` | WS broadcast do vsetkych UE5 klientov |
| `tutor-service/app/api/chat.py` | SSE chat: orchestrácia timeline + audio + broadcast |
| `tutor-service/app/api/lipsync.py` | REST: /api/v1/lipsync/status + /switch |
| `tutor-service/app/api/ws_avatar.py` | WebSocket: /ws/avatar handshake pre UE5 |
| `core/src/lib/ue5-bridge/types.ts` | Frontend type defs: AvatarCommand, VisemeFrame, ARKitFrame |
| `core/src/lib/ue5-bridge/UEWebBrowserAdapter.ts` (+3) | 4 adaptery prijimajuce a aplikujuce lipsync data |

---

## Per-subor analyza

### 1. tutor-service/app/services/viseme_timeline.py
- **Ucel:** Generuje viseme timeline zo slovenskeho textu (14 viseme tried, ±25ms presnost). Tri cesty kvality: Azure phonemes → WordBoundary → text.
- **Public API:**
  - `build_timeline(text, azure_phonemes=None, word_boundaries=None) -> tuple[list[dict], int]`
  - `from_text(text: str) -> tuple[list[dict], int]`
  - `from_azure_phonemes(phoneme_data: list[dict]) -> tuple[list[dict], int]`
  - `from_word_boundaries(word_boundaries: list[dict]) -> tuple[list[dict], int]`
- **Algoritmus:** Tokenizacia textu na grafémy (digrafy ch/dz/dž pred jednotlivymi znakmi) → lookup v `SLOVAK_CHAR_VISEME` (46 grafémy → 14 viseme) → foneticke pravidla (devoicing, palatalizacia) → hrube ramce (coarse frames) → `_densify_timeline` rozdeluje na _FRAME_STEP_MS mikro-ramce s kosinusovym coarticulation rampom. Vyhladavanie aktivneho ramca O(n).
- **Vstupy/vystupy:** Vstup: textova retazec `"Ahoj, ako sa mas?"`. Vystup: `([{"viseme":"aa","weight":0.8,"start_ms":50,"duration_ms":40}, ...], 2840)`.
- **Konfiguracne env vars:**
  - `EDU_VISEME_FRAME_STEP_MS` (default 40, range 4-200) — grid spacing
  - `EDU_VISEME_RAMP_MS` (default = frame_step, range frame_step-200) — coarticulation ramp
  - `EDU_VISEME_SHORT_VOWEL_MS` (default 60, range 20-300) — kratka samohlaska
  - `EDU_VISEME_LONG_VOWEL_MS` (default 100, range 30-400) — dlha samohlaska
  - `EDU_VISEME_CONSONANT_MS` (default 45, range 15-200) — spoluhlaska
- **Konstanty:**
  - 14 produkčných viseme tried: `PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou`
  - + interné: `sil` (silence), `__skip__` (medzery/interpunkcia)
  - `SLOVAK_DIGRAPH_VISEME`: ch→kk, dz→SS, dž→CH
  - `SLOVAK_DIPHTHONGS`: ia→(ih+aa), ie→(ih+E), iu→(ih+ou), uo→(ou+oh)
  - `PHONEME_VISEME`: 33 ARPAbet→viseme mapovanie pre Azure cestu
  - `_VOICED_CONSONANTS`: {v,b,z,ž,d,g}, `_VOICELESS_CONSONANTS`: {p,t,k,s,š,f,c,č,ch}, `_SOFT_VOWELS`: {e,i,í}, `_PALATALIZABLE`: {n,d,t}
- **Zavislosti:** `dataclasses`, `typing`, `math`, `os` — cisto stdlib, ziadne app/services/ zavislosti.
- **Edge cases:**
  - Prazdny text → prazdny timeline, total_duration_ms=0
  - Neznamy graféma → mapuje na `sil`
  - Medzera → 60ms pauza v coarse timeline (cursor_ms += 60)
  - Fonem s duráciou < 2 ramce → peak weight bez rampy (Blueprint robi lerp)
  - `_densify_timeline`: medzery medzi coarse frames → `sil` ramce
- **Test coverage:**
  - `tutor-service/tests/test_viseme_timeline.py`
  - `tutor-service/tests/test_viseme_timeline_deep.py`
  - `tutor-service/tests/test_phonetic_rules.py`
  - `tutor-service/tests/test_word_boundaries.py`
  - `tutor-service/tests/test_fragile_contracts.py`

### 2. tutor-service/app/services/audio2lipsync_client.py
- **Ucel:** Audio2Lipsync lokalna inferencia — HuBERT model pre 52 ARKit blendshapes. Singleton `Audio2LipsyncRuntime`. Fallback: ak sa model nenacita, volajuci pouzije textove viseme.
- **Public API:**
  - `get_lipsync_provider() -> str` — vracia "text"|"audio2lipsync"|"hybrid"
  - `set_lipsync_provider(provider: str) -> bool`
  - `check_health() -> bool` — async, overuje ensure_model()
  - `generate_from_audio(audio_bytes, fps=60, gain=1.5, smooth_window=3) -> Optional[Dict]`
  - `arkit_to_frames(arkit_raw: Dict[str, List[float]], fps=60) -> Tuple[List[dict], int]`
- **Algoritmus:** Audio bytes → ffmpeg resample (16kHz mono, subprocess) → soundfile.read → torch tensor → model forward (HuBERT + Transformer) → de-normalizacia (*std + mean) → clip [0,1] → gain*1.5 → scipy uniform_filter1d → dict channel→values → arkit_to_frames prevadza na frame list s thresholdom 0.005.
- **Vstupy/vystupy:** Vstup: `audio_bytes` (MP3/WAV). Vystup: `{"fps":60, "n_frames":144, "duration":2.4, "arkit_raw": {"JawOpen":[0.02,...], "MouthFunnel":[...], ...}}`. arkit_to_frames konvertuje na `[{"start_ms":0,"duration_ms":16,"arkit":{"JawOpen":0.02,...}}, ...]`.
- **Konfiguracne env vars:**
  - `AUDIO2LIPSYNC_CHECKPOINT` (default: `models/audio2lipsync/best.pt`)
  - `LIPSYNC_PROVIDER` (default "hybrid") — validne: text, audio2lipsync, hybrid
- **Konstanty:** `_VALID_PROVIDERS = ("text", "audio2lipsync", "hybrid")`, `_SEND_TIMEOUT_SECONDS = 2.0`
- **Zavislosti:** `numpy`, `torch`, `soundfile`, `scipy.ndimage.uniform_filter1d`, `huggingface_hub.hf_hub_download`, `subprocess`, model a constants z `audio2lipsync/`
- **Edge cases:**
  - Model checkpoint neexistuje a download zlyha → ensure_model() vrati False, generate_from_audio vrati None
  - Prazdne audio → wav.shape[1] = 0 → n_frames = 0 → prazdny vystup
  - ffmpeg timeout 10s — chrani pred poskodennym audio
  - GPU/MPS nedostupne → fallback na CPU
  - arkit_to_frames: hodnoty ≤ 0.005 sa vynechavaju z channels dict (setri payload)
- **Test coverage:**
  - `tutor-service/tests/test_ue5_sync.py`
  - `tutor-service/tests/test_fragile_contracts.py`

### 3. tutor-service/app/services/audio2lipsync/model.py
- **Ucel:** `LipSyncModel(nn.Module)` — HuBERT Large audio encoder + bidirectional Transformer → 52 ARKit blendshapes na kazdu face frame.
- **Public API:**
  - `__init__(n_channels=52, encoder_name="hubert_large", hidden=512, n_layers=8, n_heads=8, ff_dim=2048, dropout=0.2, max_seq_len=1024)`
  - `forward(audio: Tensor, n_face_frames: int) -> Tensor` — [B, samples] → [B, n_face_frames, 52]
  - `trainable_state_dict() -> dict` — vylucuje frozen audio_encoder
  - `load_trainable_state_dict(sd: dict)` — load s varovanim na neocakavane/missing keys
- **Architektura modelu:**
  - HuBERT Large (315M param, frozen, `torchaudio.pipelines.HUBERT_LARGE`), 24 vrstiev, 1024-dim feat @ ~50Hz
  - Learnable weighted sum cez vsetkych 24 vrstiev (SUPERB-style fusion), init final layer dominance
  - Linear proj 1024→512 + LayerNorm + Dropout(0.2)
  - Ucitelna pozicna embed (1, 1024, 512)
  - Bidirectional Transformer Encoder (8 layers × 512 hidden × 8 heads × 2048 ff-dim, pre-LN, GELU)
  - LayerNorm + Linear 512→52, zero-init head (stabilny start)
  - Linear time-interp 50Hz→n_face_frames cez `F.interpolate`
  - **Trainable params:** ~25M (vsetko okrem audio_encoder)
- **Vstupy/vystupy:** `audio: [B, samples] @ 16kHz` → `output: [B, n_face_frames, 52]`, vystup normalizovany (Z-score), konzument de-normalizuje.
- **Konfiguracne env vars:** ziadne (vsetko cez konstruktor parametre)
- **Konstanty:** `_ENCODERS` dict mapujuci 7 encoder nazvov na (bundle_attr, feat_dim, n_layers): wav2vec2_base/large, hubert_base/large/xlarge, wavlm_base/large. `N_BLENDSHAPES = 52` (import z constants).
- **Zavislosti:** `torch`, `torchaudio`, `audio2lipsync/constants`
- **Edge cases:**
  - Sekvencia dlhsia ako max_seq_len (1024) → `ValueError`
  - Neznamy encoder_name → `ValueError` s vypisom moznosti
  - `train()` override: vzdy nastavi `audio_encoder.eval()` — chrani frozen encoder
- **Test coverage:** ziadne priame jednotkove testy — testovane integracne cez `audio2lipsync_client` v `test_ue5_sync.py`

### 4. tutor-service/app/services/audio2lipsync/constants.py
- **Ucel:** Definuje 52 ARKit blendshape kanalov v poradí iPhone Live Link Face CSV + loss weights pre trenovanie.
- **Public API:**
  - `ARKIT_CHANNELS: list[str]` — 61 kanalov (52 blendshapes + 9 rotacii)
  - `BLENDSHAPE_NAMES: list[str]` — prvych 52
  - `N_BLENDSHAPES = 52`
  - `MOUTH_INDICES = list(range(14, 41))` — 27 primarnych mouth/jaw
  - `SECONDARY_MOUTH_INDICES = [46, 47, 48, 51]` — CheekPuff, CheekSquint L/R, TongueOut
  - `make_channel_weights() -> np.ndarray` — per-channel L1 loss: mouth=3.0, secondary=1.0, ostatne=0.1
  - `AUDIO_SR = 16000`, `FACE_FPS = 60`
- **52 ARKit kanalov — uplny listing:**
  - **Eyes (0-13, 14ks):** EyeBlinkLeft/Right, EyeLookDownLeft/Right, EyeLookInLeft/Right, EyeLookOutLeft/Right, EyeLookUpLeft/Right, EyeSquintLeft/Right, EyeWideLeft/Right
  - **Jaw (14-17, 4ks):** JawForward, JawRight, JawLeft, JawOpen
  - **Mouth (18-40, 23ks):** MouthClose, MouthFunnel, MouthPucker, MouthRight, MouthLeft, MouthSmileLeft/Right, MouthFrownLeft/Right, MouthDimpleLeft/Right, MouthStretchLeft/Right, MouthRollLower/Upper, MouthShrugLower/Upper, MouthPressLeft/Right, MouthLowerDownLeft/Right, MouthUpperUpLeft/Right
  - **Brows (41-45, 5ks):** BrowDownLeft/Right, BrowInnerUp, BrowOuterUpLeft/Right
  - **Cheeks (46-48, 3ks):** CheekPuff, CheekSquintLeft/Right
  - **Nose (49-50, 2ks):** NoseSneerLeft/Right
  - **Tongue (51, 1ks):** TongueOut
  - Rotacie (52-60, 9ks, nepouzite): HeadYaw/Pitch/Roll, Left/Right EyeYaw/Pitch/Roll
- **Zavislosti:** `numpy`
- **Edge cases:** `assert len(ARKIT_CHANNELS) == 61` — ochrana pri zmene poradia
- **Test coverage:** implicitne cez `test_fragile_contracts.py` (overuje existenciu ARKIT_CHANNELS[14]=='JawForward' a pod.)

### 5. tutor-service/app/services/expression_presets.py
- **Ucel:** Upper-face expresie pre MetaHuman — brows, eyes, cheeks, nose. 9 emocnych presetov aplikovanych aditivne na lipsync ARKit dict (kanaly sa neprekryvaju s mouth/jaw indexami 14-40).
- **Public API:**
  - `expression_for(emotion: str) -> Dict[str, float]` — stateless, cista funkcia
  - `known_emotions() -> frozenset[str]`
- **Algoritmus:** Priame dict mapovanie. Prazdny dict pre unknown emotions. Konzument vola `frame["arkit"].update(expr)` — aditivne mergovanie.
- **Vstupy/vystupy:** Vstup: `"joy"`. Vystup: `{"EyeSquintLeft":0.35, "EyeSquintRight":0.35, "BrowInnerUp":0.15}`.
- **Mapovanie emotion → upper-face channels:**
  - `neutral`: {} (prazdny, auto-blink z Blueprint)
  - `joy`: EyeSquint=0.35, BrowInnerUp=0.15
  - `proud`: EyeSquint=0.30, BrowDown=0.10
  - `encouraging_mild`: EyeSquint=0.15, BrowInnerUp=0.10
  - `sadness`: BrowInnerUp=0.45, BrowDown=0.15, EyeSquint=0.10
  - `patient`: BrowInnerUp=0.15, EyeSquint=0.08
  - `curious`: BrowInnerUp=0.30, BrowOuterUp=0.20/0.10, EyeLookUp=0.15, EyeWide=0.10
  - `thinking_deep`: BrowInnerUp=0.35, BrowDown=0.15/0.10, EyeLookUp=0.25, EyeSquint=0.10/0.05
  - `surprise`: BrowOuterUp=0.65, BrowInnerUp=0.50, EyeWide=0.45
- **Konfiguracne env vars:** ziadne — vsetky hodnoty su umelecke odhady na iteraciu 3D artistom
- **Zavislosti:** `typing` (stdlib)
- **Edge cases:**
  - Neznama/nepodporovana emocia → prazdny dict (ziadna forced pose)
  - Neutral ma prazdny dict → Blueprint auto-blink timer (3-6s) funguje nerusene
  - Kanaly su disjunktne s audio2lipsync mouth/jaw rozsahom (14-40) — bezpecne aditivne
- **Test coverage:**
  - `tutor-service/tests/test_expression_presets.py`

### 6. tutor-service/app/services/avatar_broadcaster.py
- **Ucel:** Sprava vsetkych UE5 WebSocket spojeni. `broadcast(command)` posle JSON vsetkym pripojenym klientom. Detekuje mrtve spojenia pri neuspesnom send.
- **Public API:**
  - `connect(websocket)`, `disconnect(websocket)`
  - `broadcast(command: dict) -> None` (async)
  - `connection_count -> int`, `is_speaking -> bool`, `set_speaking(value: bool)`
  - `get_avatar_broadcaster() -> AvatarBroadcaster`
  - `build_blink_payload() -> Dict[str, Any]`
  - `idle_heartbeat_loop(broadcaster)` — async, nekonecny loop s nahodnym intervalom
- **Algoritmus (broadcast):** Snapshotne `_connections` do listu → pre kazdy WS: `asyncio.wait_for(ws.send_text(payload), timeout=2.0s)` → pri zlyhani prida do `dead` setu → na koniec discardne mrtve → loguje pocet delivered/dropped.
- **Lipsync-relevantny payload (z build_blink_payload):**
  ```json
  {"emotion":"neutral","intensity":0.3,"isSpeaking":false,
   "visemes":[{"viseme":"sil","weight":1.0}],"viseme_timeline":[],
   "total_duration_ms":0,"blink":0.85}
  ```
- **Konstanty:** `_SEND_TIMEOUT_SECONDS=2.0`, `_HEARTBEAT_MIN_INTERVAL_S=3.0`, `_HEARTBEAT_MAX_INTERVAL_S=6.0`, `_BLINK_PULSE_WEIGHT=0.85`
- **Zavislosti:** `asyncio`, `json`, `logging`, `random`, `typing`
- **Edge cases:**
  - Ziadny pripojeny klient → broadcast skipped (debug log)
  - Konkurentny disconnect pocas broadcastu → snapshot chrani pred mutaciou setu
  - `asyncio.TimeoutError` → klient dropnuty, log warning
  - Vynimka v idle heartbeat → pokracuje (nikdy nesmie crashnut loop)
- **Test coverage:**
  - `tutor-service/tests/test_idle_heartbeat.py`
  - `tutor-service/tests/test_ws_avatar.py`

### 7. tutor-service/app/api/chat.py
- **Ucel:** `/chat/stream` (SSE) — hlavny endpoint pre chat. Obsahuje lipsync orchestráciu: detekcia emócie → `_build_lipsync` (text/audio2lipsync) → `_broadcast_avatar_state` (UE5 WS).
- **Public API (lipsync-relevantne):**
  - `_build_lipsync(text, audio_bytes, word_boundaries, emotion) -> (viseme_frames, duration_ms, arkit_frames)` — async
  - `_broadcast_avatar_state(*, emotion, intensity, is_speaking, visemes, viseme_timeline, duration_ms, agent_state=None)` — async
  - `_speaking_head_visemes(frames) -> List[dict]`
  - `_map_emotion_to_ue5(emotion) -> str`
- **Algoritmus (_build_lipsync):**
  1. Ak provider ∈ {audio2lipsync, hybrid} AND audio_bytes → `generate_from_audio(audio_bytes)` → `arkit_to_frames()` → merge `expression_for(emotion)` do kazdeho ARKit frame → vrati (viseme_frames, duration_ms, arkit_frames)
  2. Inak → `build_timeline(text, word_boundaries=word_boundaries)` → vrati (viseme_frames, duration_ms, None)
- **Broadcast payload struktura:**
  ```json
  {"emotion":"joy","intensity":0.9,"isSpeaking":true,
   "visemes":[{"viseme":"aa","weight":0.8}],"blink":0.0,
   "viseme_timeline":[{...}],"total_duration_ms":2400,
   "agentState":"thinking"}
  ```
  `agentState` je vynechane ked None (ADR-005 invariant).
- **Sekvencovanie v `_synthesize_and_send_sentence`:**
  1. `detect_emotion(sentence)` → emotion label + intensity
  2. `build_timeline(sentence)` → text_frames (predbezne, bez audio)
  3. YIELD `sentence_start` SSE event (s viseme_timeline)
  4. `asyncio.create_task(_delayed_ue5_broadcast)` — broadcast po _UE5_BROADCAST_DELAY_MS (180ms)
  5. `tts_svc.stream_chunks(...)` → audio_buf + word_boundaries
  6. Po dokonceni TTS: `_build_lipsync(sentence, audio_bytes, word_boundaries, emotion)` → final_frames (audio-aligned)
  7. YIELD `sentence_end` SSE event (s final viseme_timeline + arkit_frames)
  8. **NO second UE5 broadcast** — Gap B fix
- **Konfiguracne env vars:** `UE5_BROADCAST_DELAY_MS` (default 180)
- **Konstanty:** `_UE5_EMOTION_MAP`: 9 backend labels → UE5 states. `_AVATAR_IDLE_VISEMES = [{"viseme":"sil","weight":1.0}]`. `_TOOL_NAME_TO_AGENT_STATE`: tool→agentState mapovanie.
- **Zavislosti:** viseme_timeline, audio2lipsync_client, expression_presets, emotion_detector, avatar_broadcaster
- **Edge cases:**
  - `_build_lipsync`: audio2lipsync zlyha → fallback na text s word_boundaries
  - TTS zlyha alebo prazdne audio → final_frames = text_frames, final_arkit=None
  - Klient disconnect mid-stream → `http_request.is_disconnected()` poll + `finally` broadcast idle
  - Gap B: ziaden druhy broadcast na sentence_end (prvy broadcast s text timeline uz bezi)
- **Test coverage:**
  - `tutor-service/tests/test_api.py`
  - `tutor-service/tests/test_chat_rag.py`
  - `tutor-service/tests/test_streaming_tts.py`
  - `tutor-service/tests/test_ue5_sync.py`
  - `tutor-service/tests/test_fragile_contracts.py`

### 8. tutor-service/app/api/lipsync.py
- **Ucel:** REST endpointy pre kontrolu a spravu lipsync providera.
- **Public API:**
  - `GET /api/v1/lipsync/status` — vracia active provider, dostupnost vsetkych troch
  - `POST /api/v1/lipsync/switch` — prepne provider (body: `{"provider":"audio2lipsync"}`)
- **Algoritmus:** `lipsync_status()` vola `check_health()` pre audio2lipsync dostupnost. `switch_lipsync()` overuje `check_health()` pred prepnutim na audio2lipsync (vracia error ak model nenacitany).
- **Vstupy/vystupy:** GET→`{"active":"hybrid","providers":{...}}`, POST `{"provider":"text"}` → `{"success":true,"provider":"text"}`
- **Zavislosti:** `audio2lipsync_client` (check_health, get/set provider), FastAPI
- **Edge cases:** Switch na audio2lipsync ked model failed → `{"success":false,"error":"..."}`. Neznamy provider → `{"success":false}`.
- **Test coverage:**
  - `tutor-service/tests/test_api.py`

### 9. tutor-service/app/api/ws_avatar.py
- **Ucel:** `/ws/avatar` WebSocket endpoint — UE5 Blueprint handshake. Prijima `avatar_ready` + `speech_complete`, odpoveda `ready_ack`.
- **Public API:**
  - `GET /api/v1/avatar/status` — `{"connected":bool,"clients":int}`
  - `WS /ws/avatar` — `await websocket.accept()`, handshake, message loop
- **Handshake flow:** UE5 connect → server: `{"type":"connected","message":"EduTutor avatar bridge v2 ready"}` → UE5: `{"type":"avatar_ready","capabilities":[...]}` → server: `{"type":"ready_ack","version":"v2","capabilities_accepted":[...]}`
- **Konstanty:** `_WS_MAX_MESSAGE_BYTES = 16384`
- **Zavislosti:** `avatar_broadcaster` (connect/disconnect)
- **Edge cases:**
  - Non-JSON message → warning, continue
  - Message > 16KB → close code 1009
  - WebSocketDisconnect → clean disconnect
  - Povod vsetkych origin accepted v dev mode (_is_local_origin check existuje ale nie je enforce)
- **Test coverage:**
  - `tutor-service/tests/test_ws_avatar.py`
  - `tutor-service/tests/test_idle_heartbeat.py`

### 10. core/src/lib/ue5-bridge/types.ts
- **Ucel:** Frontend TypeScript typove definicie pre AvatarCommand, VisemeFrame, ARKitFrame, IAdapter.
- **Public API (typy):**
  - `SlovakViseme` = `'PP'|'FF'|'TH'|'DD'|'kk'|'CH'|'SS'|'nn'|'RR'|'aa'|'E'|'ih'|'oh'|'ou'|'ww'|'uw'|'sil'` (17 labels — `ww` a `uw` su rezervovane pre buduce rozsirenie, v Pythone nepouzite)
  - `UE5Emotion` = 9 stavov (neutral, joy, surprise, sadness, encouraging_mild, proud, patient, curious, thinking_deep)
  - `InternalEmotion` = 9 backend labelov (neutral, celebrating, proud, encouraging_mild, correcting, patient, curious, thinking_deep, surprise)
  - `AvatarCommand` — hlavny payload: emotion, intensity, isSpeaking, visemes, arkit?, blink?, audioPositionMs?, sentenceIdx?, agentState?
  - `VisemeFrame` — {viseme, weight, start_ms, duration_ms}
  - `ARKitFrame` — {start_ms, duration_ms, arkit: ARKitChannels}
  - `ARKitChannels` — `{[channel:string]: number}`
  - `IAdapter` — sendCommand, onMessage, disconnect
- **Zavislosti:** ziadne (cisto typy)
- **Edge cases:** `arkit?`, `audioPositionMs?`, `sentenceIdx?`, `agentState?` — vsetky optional pre backward compat

### 11. core/src/lib/ue5-bridge adapters (4 subory)
- **Ucel:** 4 transporty pre dorucenie AvatarCommand do UE5.

| Adapter | Transport | Metoda |
|---|---|---|
| `UEWebBrowserAdapter.ts` | UE5 Web Browser Widget | `window.ue.interface.broadcast('avatarCommand', JSON.stringify(cmd))` |
| `PixelStreamingAdapter.ts` | WebRTC DataChannel | `datachannel.send({type:'avatarCommand',payload:cmd})` |
| `WebSocketServerAdapter.ts` | Priamy WS na /ws/avatar | `new WebSocket(url)`, reconnect s exp backoff (500ms→30s), heartbeat detection 15s |
| `MockAdapter.ts` | Console | `console.log` s emotion/speaking/viseme/blink info |

- **WebSocketServerAdapter detaily:** Reconnect: backoff_start=500, max=30000, multiplier=2.0, jitter=±20%. Heartbeat timeout: 15s (server posiela blink pulsy kazdych 3-6s). Queue pending messages wa disconnected.
- **Zavislosti:** `types.ts` (IAdapter, AvatarCommand, UE5Message)
- **Edge cases:**
  - UEWebBrowserAdapter: `window.ue?.interface?.broadcast` moze byt undefined (UE5 Web Browser Widget nie je nacitany) → silent no-op
  - PixelStreamingAdapter: DataChannel este nie je open → queue-uje spravy
  - WebSocketServerAdapter: `destroyed` flag blokuje reconnect po zniceni adaptera
- **Test coverage:** ziadne priame jednotkove testy — `autoBlink.ts` pokryty cez simulator/page.tsx

---

## Dataflow Summary

```
TTS Text (sk)
    │
    ├──[1]──► emotion_detector.py ──► emotion label (9 states)
    │                                          │
    └──[2]──► viseme_timeline.build_timeline() │
               │  ├─ from_azure_phonemes()     │
               │  ├─ from_word_boundaries()    │
               │  └─ from_text()               │
               │                                │
               ▼                                ▼
         viseme_frames[]              expression_presets.expression_for()
         [{viseme,weight,start,...}]      ──► upper-face ARKit dict
               │                                │
               │                                │
    ┌──────────┤                                │
    │          │                                │
    │  ┌───────┴───────────[3]──────────────────┤
    │  │ TTS audio  ──► audio2lipsync_client    │
    │  │   (MP3)         generate_from_audio()  │
    │  │                      │                 │
    │  │                 HuBERT Large           │
    │  │                 + Transformer          │
    │  │                      │                 │
    │  │                 arkit_raw{}            │
    │  │                      │                 │
    │  │                 arkit_to_frames()      │
    │  │                      │                 │
    │  │                 arkit_frames[]         │
    │  │                 [{arkit:{JawOpen:..}}] │
    │  │                      │                 │
    │  │       expression_for() merge ◄─────────┘
    │  │         frame.arkit.update(expr)
    │  │                      │
    │  └──────────────────────┘
    │           │
    ▼           ▼
chat.py:_build_lipsync()
    │  zlucuje text visemes + ARKit frames
    │  podla provider (text/audio2lipsync/hybrid)
    ▼
chat.py:_broadcast_avatar_state()
    │  payload = {emotion, intensity, isSpeaking,
    │             visemes, viseme_timeline,
    │             total_duration_ms, blink,
    │             agentState?}
    │  +_UE5_BROADCAST_DELAY_MS (180ms)
    ▼
avatar_broadcaster.broadcast(payload)
    │  JSON.stringify → ws.send_text()
    │  snapshot + timeout 2.0s per client
    ▼
/ws/avatar WebSocket
    │  UE5 Blueprint prijima JSON
    │  ├─ viseme mode: viseme_timeline[]
    │  ├─ ARKit mode: arkit_frames[] (ak pritomne)
    │  └─ emotion: mh_arkit_mapping_pose
    ▼
UE5 MetaHuman rig
    │  LiveLink Pose Asset → blendshapes
    │  Blueprint lerp/timeline
    ▼
MetaHuman AnimBP (60fps)
```

**Paralelne cesty (chat.py `_synthesize_and_send_sentence`):**
1. SSE `sentence_start` → posiela text-based timeline (pred TTS)
2. TTS stream → audio chunky + word_boundaries
3. `sentence_end` → posiela audio-aligned timeline + ARKit (po TTS)
4. UE5 broadcast → oneskoreny o `_UE5_BROADCAST_DELAY_MS` (180ms), len raz na zaciatku

**Idle path:** `idle_heartbeat_loop` → kazdych 3-6s → `broadcast(build_blink_payload())` → blink 0.85, sil viseme

---

## Konfiguracne parametre (zhrnutie)

| Env var | Default | Subor | Popis |
|---|---|---|---|
| `EDU_VISEME_FRAME_STEP_MS` | 40 | viseme_timeline.py | Grid spacing mikro-ramcov v ms |
| `EDU_VISEME_RAMP_MS` | =frame_step | viseme_timeline.py | Coarticulation ramp duration v ms |
| `EDU_VISEME_SHORT_VOWEL_MS` | 60 | viseme_timeline.py | Trvanie kratkej samohlasky |
| `EDU_VISEME_LONG_VOWEL_MS` | 100 | viseme_timeline.py | Trvanie dlhej samohlasky |
| `EDU_VISEME_CONSONANT_MS` | 45 | viseme_timeline.py | Trvanie spoluhlasky |
| `LIPSYNC_PROVIDER` | hybrid | audio2lipsync_client.py | Aktivny provider: text/audio2lipsync/hybrid |
| `AUDIO2LIPSYNC_CHECKPOINT` | models/audio2lipsync/best.pt | audio2lipsync_client.py | Cesta k model checkpointu |
| `UE5_BROADCAST_DELAY_MS` | 180 | chat.py | Oneskorenie UE5 broadcastu voci audio startu |

---

## Invarianty (z ADR-005)

- **`agentState` omitted when None** — `_broadcast_avatar_state` zapisuje `payload["agentState"]` len ked `agent_state is not None`. Nikdy nie `null` alebo prazdny string. V2 Blueprinty vidia byte-identical traffic.
- **60fps frame rate** — `FACE_FPS=60` v constants.py, `arkit_to_frames` pouziva `int(1000/fps)` = 16ms per frame
- **arkit_frames threshold 0.005** — `arkit_to_frames` vynechava kanaly s hodnotou ≤0.005 z channels dict (setri payload, `if v > 0.005`)

---

## Test coverage (zoznam)

| Test subor | Pokryva |
|---|---|
| `test_viseme_timeline.py` | from_text, build_timeline, grapheme→viseme mapping |
| `test_viseme_timeline_deep.py` | Hlbkove testy: diphthongs, digraphs, edge cases |
| `test_phonetic_rules.py` | Devoicing, palatalizacia, _apply_phonetic_rules |
| `test_expression_presets.py` | expression_for, known_emotions, channel counts |
| `test_ue5_sync.py` | audio2lipsync integracia, arkit_to_frames, threshold |
| `test_idle_heartbeat.py` | avatar_broadcaster idle loop, blink payload |
| `test_ws_avatar.py` | /ws/avatar handshake, connect/disconnect |
| `test_fragile_contracts.py` | ARKit channel naming, protocol invariants |
| `test_api.py` | /lipsync/status, /lipsync/switch, /chat/stream |
| `test_word_boundaries.py` | from_word_boundaries, Edge TTS integration |
