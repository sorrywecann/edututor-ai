"""
Channel names and loss weights for the LipSync model.

The iPhone Live Link Face app logs 61 floats per frame:
    - 52 ARKit blendshapes (EyeBlink, Jaw*, Mouth*, Brow*, Cheek*, Nose*, TongueOut)
    - 3 head rotations (HeadYaw, HeadPitch, HeadRoll)
    - 6 eye rotations (Left/Right EyeYaw/Pitch/Roll)

We only train on the 52 blendshapes. Head/eye rotations are driven by the
Text2Face model (for expressive head movement) and are kept at zero here.

The model predicts all 52 channels, but the loss is weighted so only mouth/jaw
channels matter. At inference, non-mouth channels are zeroed before being
pushed to LiveLink — this way the lipsync layer only touches the mouth while
Text2Face drives the rest of the face additively.
"""
from __future__ import annotations

import numpy as np

# All 61 channels in the exact order they appear in the iPhone _raw.csv file
# (after skipping the leading Timecode and BlendshapeCount columns).
ARKIT_CHANNELS = [
    # 0-13: Eyes
    "EyeBlinkLeft", "EyeLookDownLeft", "EyeLookInLeft", "EyeLookOutLeft",
    "EyeLookUpLeft", "EyeSquintLeft", "EyeWideLeft",
    "EyeBlinkRight", "EyeLookDownRight", "EyeLookInRight", "EyeLookOutRight",
    "EyeLookUpRight", "EyeSquintRight", "EyeWideRight",
    # 14-17: Jaw
    "JawForward", "JawRight", "JawLeft", "JawOpen",
    # 18-40: Mouth
    "MouthClose", "MouthFunnel", "MouthPucker",
    "MouthRight", "MouthLeft",
    "MouthSmileLeft", "MouthSmileRight",
    "MouthFrownLeft", "MouthFrownRight",
    "MouthDimpleLeft", "MouthDimpleRight",
    "MouthStretchLeft", "MouthStretchRight",
    "MouthRollLower", "MouthRollUpper",
    "MouthShrugLower", "MouthShrugUpper",
    "MouthPressLeft", "MouthPressRight",
    "MouthLowerDownLeft", "MouthLowerDownRight",
    "MouthUpperUpLeft", "MouthUpperUpRight",
    # 41-45: Brows
    "BrowDownLeft", "BrowDownRight",
    "BrowInnerUp", "BrowOuterUpLeft", "BrowOuterUpRight",
    # 46-48: Cheeks
    "CheekPuff", "CheekSquintLeft", "CheekSquintRight",
    # 49-50: Nose
    "NoseSneerLeft", "NoseSneerRight",
    # 51: Tongue
    "TongueOut",
    # 52-54: Head rotation (not predicted by lipsync)
    "HeadYaw", "HeadPitch", "HeadRoll",
    # 55-60: Eye rotation (not predicted by lipsync)
    "LeftEyeYaw", "LeftEyePitch", "LeftEyeRoll",
    "RightEyeYaw", "RightEyePitch", "RightEyeRoll",
]
if len(ARKIT_CHANNELS) != 61:
    raise ValueError(
        f"ARKIT_CHANNELS must have exactly 61 entries, got {len(ARKIT_CHANNELS)}"
    )

N_BLENDSHAPES = 52
BLENDSHAPE_NAMES = ARKIT_CHANNELS[:N_BLENDSHAPES]

# Primary mouth/jaw channels — these are what the model is trained hardest on.
# Covers JawForward through MouthUpperUpRight (indices 14-40, inclusive).
MOUTH_INDICES = list(range(14, 41))

# Secondary speech-relevant channels (cheeks puff during plosives, tongue sticks out).
# Still trained on but with lower weight than primary mouth channels.
SECONDARY_MOUTH_INDICES = [46, 47, 48, 51]  # CheekPuff, CheekSquint L/R, TongueOut

# Non-mouth channels get near-zero weight — the model should learn to leave
# them at the training mean (~neutral).
PRIMARY_WEIGHT = 3.0
SECONDARY_WEIGHT = 1.0
OTHER_WEIGHT = 0.1


def make_channel_weights() -> np.ndarray:
    """Per-channel L1 loss weights, shape [52]."""
    w = np.full(N_BLENDSHAPES, OTHER_WEIGHT, dtype=np.float32)
    for i in MOUTH_INDICES:
        w[i] = PRIMARY_WEIGHT
    for i in SECONDARY_MOUTH_INDICES:
        w[i] = SECONDARY_WEIGHT
    return w


# Audio must be resampled to this rate before going into Wav2Vec2.
AUDIO_SR = 16000
# iPhone Live Link Face runs at 60fps.
FACE_FPS = 60
