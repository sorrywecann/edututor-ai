# Avatar Emotion — Blueprint Handoff

**Date:** 2026-05-25
**Status:** Backend sends emotion correctly; **UE5 Blueprint does not render it.** This doc is the spec to wire it.

## What we verified (live test)

Using the dev broadcast endpoint (`POST /api/v1/avatar/dev/broadcast`), we forced
`emotion: "surprise"` at `intensity: 1.0` onto the connected UE5 avatar — both
idle and while speaking. **The mouth animated (visemes work), but the brows/eyes
never changed.** So `Edutor_AgentConnection` / `ABP_Face_PostProcess` is reading
`viseme` but ignoring `emotion` + `intensity`.

The backend is NOT the blocker — it sends these fields on every broadcast.

## The fields already arriving on `/ws/avatar`

Every avatar payload includes:

```json
{
  "emotion": "joy",        // one of 9 values (below)
  "intensity": 0.9,        // 0.0–1.0 — scale the pose by this
  "isSpeaking": true,
  "visemes": [{"viseme":"aa","weight":0.9}],
  "viseme_timeline": [...],
  "total_duration_ms": 2400,
  "agentState": "speaking" // optional: idle|thinking|searching|writing|listening|speaking
}
```

**9 emotion values:** `neutral · joy · surprise · sadness · proud · patient · curious · encouraging_mild · thinking_deep`

## What the Blueprint needs to do

On each avatar command, read `emotion` + `intensity` and drive these **upper-face
blendshapes** (ARKit/MetaHuman naming) — additively on top of the viseme mouth
shapes. Multiply each value below by `intensity`. Ease in/out over ~150ms so it
doesn't snap. This table is the backend's `expression_presets.py` (already tuned):

| emotion | blendshapes (value @ intensity 1.0) |
|---|---|
| **neutral** | *(none — rest pose)* |
| **joy** | EyeSquintLeft/Right 0.35, BrowInnerUp 0.15 |
| **proud** | EyeSquintLeft/Right 0.30, BrowDownLeft/Right 0.10 |
| **encouraging_mild** | EyeSquintLeft/Right 0.15, BrowInnerUp 0.10 |
| **sadness** | BrowInnerUp 0.45, BrowDownLeft/Right 0.15, EyeSquintLeft/Right 0.10 |
| **patient** | BrowInnerUp 0.15, EyeSquintLeft/Right 0.08 |
| **curious** | BrowInnerUp 0.30, BrowOuterUpLeft 0.20, BrowOuterUpRight 0.10, EyeLookUpLeft/Right 0.15, EyeWideLeft/Right 0.10 |
| **thinking_deep** | BrowInnerUp 0.35, BrowDownLeft 0.15, BrowDownRight 0.10, EyeLookUpLeft 0.25, EyeLookUpRight 0.15, EyeSquintLeft 0.10, EyeSquintRight 0.05 |
| **surprise** | BrowOuterUpLeft/Right 0.65, BrowInnerUp 0.50, EyeWideLeft/Right 0.45 |

(Optional, later: also react to `agentState` — e.g. a subtle "thinking" look while
`thinking`/`searching`, an attentive look while `listening`.)

## How to test your wiring (no chat needed)

With the backend running and the avatar connected, run this to force each emotion
for a few seconds — watch the face change:

```bash
# from tutor-service/
python -c "
import urllib.request, json, time
URL='http://localhost:8000/api/v1/avatar/dev/broadcast'
def send(e,i):
    p={'emotion':e,'intensity':i,'isSpeaking':False,'visemes':[{'viseme':'sil','weight':1.0}],
       'blink':0.0,'viseme_timeline':[],'total_duration_ms':0,'agentState':'idle'}
    urllib.request.urlopen(urllib.request.Request(URL,data=json.dumps(p).encode(),
        headers={'Content-Type':'application/json'}),timeout=5)
for e in ['surprise','joy','sadness','curious','neutral']:
    print('showing',e); 
    end=time.time()+4
    while time.time()<end: send(e,1.0); time.sleep(0.7)
"
```

When the face visibly changes per emotion, the wiring is done — the backend already
feeds the right data during real conversations.
