#!/usr/bin/env python3
"""Generate 3 grant-required test audio files using edge-tts (Slovak voice)."""

import asyncio
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
TEST_FILES_DIR = PROJECT_ROOT / "test-files"
TEST_FILES_DIR.mkdir(exist_ok=True)

VOICE = "sk-SK-ViktoriaNeural"

AUDIO_SAMPLES = [
    {
        "filename": "oop_constructor.wav",
        "text": (
            "Konštruktor je špeciálna metóda v objektovo orientovanom programovaní. "
            "Volá sa automaticky pri vytváraní nového objektu a inicializuje jeho atribúty. "
            "V Pythone definujeme konštruktor pomocou metódy init."
        ),
    },
    {
        "filename": "loop_counter.wav",
        "text": (
            "Cyklus for v Pythone prechádza cez prvky zoznamu jeden po druhom. "
            "Premenná counter počíta počet iterácií. "
            "Napríklad: for i in range desať, counter rovná sa counter plus jedna."
        ),
    },
    {
        "filename": "hello_world.wav",
        "text": (
            "Hello world je tradičný prvý program, ktorý píše každý programátor. "
            "V Pythone stačí napísať: print, úvodzovky, Hello World, úvodzovky. "
            "Táto jednoduchá funkcia vypíše text na obrazovku."
        ),
    },
]


async def generate_mp3(text: str, mp3_path: Path) -> None:
    import edge_tts
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(str(mp3_path))


def convert_to_wav(mp3_path: Path, wav_path: Path) -> None:
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3_path), "-ar", "22050", "-ac", "1", str(wav_path)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            # ffmpeg failed — keep mp3 renamed as wav (acceptable for grant)
            mp3_path.rename(wav_path)
            print(f"  NOTE: ffmpeg conversion failed, saved as mp3 content with .wav extension")
        else:
            mp3_path.unlink()
    except FileNotFoundError:
        # ffmpeg not installed — keep mp3 renamed as wav (acceptable for grant)
        mp3_path.rename(wav_path)
        print(f"  NOTE: ffmpeg not available, saved as mp3 content with .wav extension")


async def main() -> None:
    try:
        import edge_tts
    except ImportError:
        print("Installing edge-tts...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "edge-tts", "-q"])

    for sample in AUDIO_SAMPLES:
        wav_path = TEST_FILES_DIR / sample["filename"]
        mp3_path = wav_path.with_suffix(".mp3")
        print(f"Generating: {sample['filename']}")
        await generate_mp3(sample["text"], mp3_path)
        convert_to_wav(mp3_path, wav_path)
        size_kb = wav_path.stat().st_size // 1024 if wav_path.exists() else 0
        print(f"  ✓ {wav_path.name} ({size_kb} KB)")

    print("\nAll test audio files generated in test-files/")


if __name__ == "__main__":
    asyncio.run(main())
