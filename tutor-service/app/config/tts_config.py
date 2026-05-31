"""
EduTutor.AI - TTS Configuration
Konfigurácia Text-to-Speech pre PB3
"""

from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class TTSConfig(BaseSettings):
    """Konfigurácia pre Text-to-Speech (OpenAI, Azure, Edge)"""

    # Provider settings
    provider: str = Field(
        default="openai", description="TTS provider: openai, azure, edge, mock"
    )

    # OpenAI settings
    openai_tts_voice: str = Field(
        default="nova",
        description="OpenAI TTS voice: alloy, echo, fable, onyx, nova, shimmer",
    )
    openai_tts_model: str = Field(
        default="tts-1", description="OpenAI TTS model: tts-1, tts-1-hd"
    )

    # Azure settings
    azure_speech_key: Optional[str] = Field(
        default=None, description="Azure Speech Services API kľúč"
    )
    azure_speech_region: str = Field(default="westeurope", description="Azure región")

    # Voice settings
    voice_name: str = Field(default="sk-SK-LukasNeural", description="Názov hlasu")
    speech_rate: str = Field(default="1.0", description="Rýchlosť reči (0.5 - 2.0)")
    pitch: str = Field(default="0%", description="Výška hlasu (-50% až +50%)")

    # Output settings
    output_format: str = Field(
        default="audio-24khz-48kbitrate-mono-mp3", description="Formát výstupného audia"
    )
    sample_rate: int = Field(default=24000, description="Vzorkovacia frekvencia")

    # SSML settings
    enable_ssml: bool = Field(default=True, description="Povoliť SSML pre emócie")
    enable_viseme: bool = Field(
        default=True, description="Povoliť viseme timestamps pre lipsync"
    )

    # Emotion mapping
    default_emotion: str = Field(default="friendly", description="Predvolená emócia")

    model_config = SettingsConfigDict(
        env_prefix="TTS_",
        env_file=".env",
        extra="ignore",
    )


tts_config = TTSConfig()

TTS_CONFIG = {
    "provider": tts_config.provider,
    "voice_name": tts_config.voice_name,
    "speech_rate": tts_config.speech_rate,
    "pitch": tts_config.pitch,
    "output_format": tts_config.output_format,
    "enable_ssml": tts_config.enable_ssml,
    "enable_viseme": tts_config.enable_viseme,
}

# SSML template pre emócie
SSML_TEMPLATE = """
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="sk-SK">
    <voice name="{voice_name}">
        <mstts:express-as style="{emotion}">
            <prosody rate="{rate}" pitch="{pitch}">
                {text}
            </prosody>
        </mstts:express-as>
    </voice>
</speak>
"""
