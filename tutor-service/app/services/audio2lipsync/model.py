"""
LipSyncModel — audio → 52 ARKit blendshapes.

v2 architecture:
    audio (16kHz)
        │
        ▼
    HuBERT Large   (315M params, frozen, from torchaudio.pipelines)
        │  returns 24 layer outputs
        ▼
    learnable weighted sum over all 24 layers  (SUPERB-style fusion)
        │  [B, T_audio, 1024] at ~50Hz
        ▼
    linear projection 1024 → hidden
        │
        ▼
    linear time-interp 50Hz → n_face_frames (60Hz)
        │
        ▼
    bidirectional transformer encoder
        (8 layers × 512 hidden × 8 heads × 2048 ff-dim, pre-LN, GELU)
        │
        ▼
    LayerNorm + Linear  → 52 ARKit blendshapes (normalized)

Only the fusion weights, projection, pos embedding, transformer, layer norm,
and head are trained (~25M trainable). The 315M audio encoder is kept in
eval mode permanently — no dropout, no BN updates, weights never change.

Bidirectional attention is fine because the server generates whole clips
(not streaming frame-by-frame), so future audio context is available and
helps with coarticulation prediction.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchaudio

from constants import N_BLENDSHAPES


# (bundle name in torchaudio.pipelines, feature dim, number of transformer layers)
_ENCODERS = {
    "wav2vec2_base":  ("WAV2VEC2_BASE",   768, 12),
    "wav2vec2_large": ("WAV2VEC2_LARGE", 1024, 24),
    "hubert_base":    ("HUBERT_BASE",     768, 12),
    "hubert_large":   ("HUBERT_LARGE",   1024, 24),
    "hubert_xlarge":  ("HUBERT_XLARGE",  1280, 48),
    "wavlm_base":     ("WAVLM_BASE_PLUS", 768, 12),
    "wavlm_large":    ("WAVLM_LARGE",    1024, 24),
}


class LipSyncModel(nn.Module):
    def __init__(
        self,
        n_channels: int = N_BLENDSHAPES,
        encoder_name: str = "hubert_large",
        hidden: int = 512,
        n_layers: int = 8,
        n_heads: int = 8,
        ff_dim: int = 2048,
        dropout: float = 0.2,
        max_seq_len: int = 1024,
    ):
        super().__init__()
        self.encoder_name = encoder_name

        if encoder_name not in _ENCODERS:
            raise ValueError(f"unknown encoder_name: {encoder_name} "
                             f"(choices: {list(_ENCODERS)})")
        bundle_attr, feat_dim, n_enc_layers = _ENCODERS[encoder_name]
        bundle = getattr(torchaudio.pipelines, bundle_attr)
        self.audio_encoder = bundle.get_model()
        for p in self.audio_encoder.parameters():
            p.requires_grad = False
        self.audio_encoder.eval()
        self.audio_sr = bundle.sample_rate  # always 16kHz for these encoders
        self.audio_feat_dim = feat_dim
        self.n_enc_layers = n_enc_layers

        # --- Learnable weighted sum over all encoder transformer layers ---
        # Different layers of HuBERT/Wav2Vec2 encode different information:
        # early layers are acoustic, mid-to-late layers are phonetic/semantic.
        # A softmax-weighted combination consistently outperforms using only
        # the final layer for downstream tasks (SUPERB benchmark, s3prl).
        #
        # Init so the final layer dominates at start (matches v1 behavior),
        # then let training discover the optimal mix.
        init_w = torch.full((n_enc_layers,), -2.0)
        init_w[-1] = 2.0
        self.layer_weights = nn.Parameter(init_w)

        # --- Projection + pos embed + transformer decoder ---
        self.proj = nn.Linear(self.audio_feat_dim, hidden)
        self.proj_norm = nn.LayerNorm(hidden)
        self.proj_dropout = nn.Dropout(dropout)

        self.pos_embed = nn.Parameter(torch.randn(1, max_seq_len, hidden) * 0.02)

        enc_layer = nn.TransformerEncoderLayer(
            d_model=hidden,
            nhead=n_heads,
            dim_feedforward=ff_dim,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
            activation="gelu",
        )
        self.transformer = nn.TransformerEncoder(enc_layer, num_layers=n_layers)

        self.out_norm = nn.LayerNorm(hidden)
        self.head = nn.Linear(hidden, n_channels)

        # Zero-init the head so the model starts by predicting "neutral face"
        # (normalized face = 0). Training then learns the residual — much
        # more stable with small-to-medium data.
        nn.init.zeros_(self.head.weight)
        nn.init.zeros_(self.head.bias)

    # ------------------------------------------------------------------
    # Keep the frozen audio encoder in eval mode even when the outer
    # module is in train mode (no dropout or BN updates inside it).
    # ------------------------------------------------------------------
    def train(self, mode: bool = True):
        super().train(mode)
        self.audio_encoder.eval()
        return self

    # ------------------------------------------------------------------
    # Audio feature extraction with multi-layer weighted fusion.
    # ------------------------------------------------------------------
    def _encode_audio(self, audio: torch.Tensor) -> torch.Tensor:
        """audio: [B, samples] @ 16kHz → features [B, T_audio, feat_dim] @ ~50Hz"""
        with torch.no_grad():
            # list of [B, T, D] tensors, one per encoder transformer layer
            layer_feats, _ = self.audio_encoder.extract_features(audio)
            stacked = torch.stack(layer_feats, dim=0)  # [L, B, T, D], detached

        # The layer_weights parameter IS trainable — gradients flow to it
        # via this multiplication, but not into the frozen encoder.
        weights = F.softmax(self.layer_weights, dim=0)  # [L]
        fused = (stacked * weights.view(-1, 1, 1, 1)).sum(dim=0)  # [B, T, D]
        return fused

    # ------------------------------------------------------------------
    # Checkpoint helpers — save/load only trainable params, leaving the
    # 315M frozen encoder to be rebuilt from torchaudio on load.
    # ------------------------------------------------------------------
    def trainable_state_dict(self) -> dict:
        return {
            k: v for k, v in self.state_dict().items()
            if not k.startswith("audio_encoder.")
        }

    def load_trainable_state_dict(self, sd: dict):
        sd = {k: v for k, v in sd.items() if not k.startswith("audio_encoder.")}
        result = self.load_state_dict(sd, strict=False)
        unexpected = [k for k in result.unexpected_keys
                      if not k.startswith("audio_encoder.")]
        missing = [k for k in result.missing_keys
                   if not k.startswith("audio_encoder.")]
        if unexpected:
            print(f"[model] warning: unexpected keys: {unexpected[:3]}")
        if missing:
            print(f"[model] warning: missing keys: {missing[:3]}")

    def forward(self, audio: torch.Tensor, n_face_frames: int) -> torch.Tensor:
        """
        audio: [B, samples] at 16kHz
        n_face_frames: target length in face frames (@ 60fps)
        returns: [B, n_face_frames, n_channels] normalized predictions
        """
        feats = self._encode_audio(audio)  # [B, T_audio, D]

        # Resample time axis from ~50Hz to n_face_frames (60Hz) via linear interp
        feats = feats.transpose(1, 2)  # [B, D, T_audio]
        feats = F.interpolate(feats, size=n_face_frames,
                              mode="linear", align_corners=False)
        feats = feats.transpose(1, 2)  # [B, n_face_frames, D]

        x = self.proj(feats)
        x = self.proj_norm(x)
        x = self.proj_dropout(x)

        T = x.size(1)
        if T > self.pos_embed.size(1):
            raise ValueError(f"sequence length {T} exceeds max_seq_len "
                             f"{self.pos_embed.size(1)}")
        x = x + self.pos_embed[:, :T]

        x = self.transformer(x)
        x = self.out_norm(x)
        y = self.head(x)
        return y
