"""
EduTutor.AI - XTTS2 Voice Cloning Tool
=======================================
Clone any voice from a 3-6 second audio sample.

Usage:
    python tools/clone_voice.py --reference path/to/voice.wav --text "Ahoj, ako sa mas?" --output output.wav
    python tools/clone_voice.py --reference path/to/voice.wav --text "Hello world" --language en --output output.wav
    python tools/clone_voice.py --record  # Record reference from mic first

HOW TO GET A GOOD VOICE CLONE:
1. Record 6-10 seconds of clear speech (one speaker, no background noise)
2. Use a decent mic (even laptop mic works if room is quiet)
3. Speak naturally - don't read robotically
4. Save as WAV (16-bit, mono, 22050 or 24000 Hz ideal)
5. The transcript of what's said in the reference doesn't need to match output text

Supported languages: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, ja, hu, ko
Note: Slovak (sk) not natively supported - use 'cs' (Czech) as closest alternative,
      or try the community Slovak model: Felagund/XTTSv2-sk on HuggingFace
"""

import argparse
import sys
import os
import time

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def record_reference(output_path: str, duration: int = 8):
    """Record a voice reference from the microphone."""
    try:
        import sounddevice as sd
        import soundfile as sf
    except ImportError:
        print("Install sounddevice: pip install sounddevice")
        sys.exit(1)

    sample_rate = 22050
    print(f"\n{'='*50}")
    print("VOICE REFERENCE RECORDING")
    print(f"{'='*50}")
    print(f"Duration: {duration} seconds")
    print("Tips for best results:")
    print("  - Quiet room, no background noise")
    print("  - Speak naturally, not robotic")
    print("  - Hold mic 15-20cm from mouth")
    print(f"{'='*50}")
    input("\nPress ENTER when ready to record...")

    print(f"\nRECORDING for {duration} seconds...")
    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='int16')
    sd.wait()
    print("Recording complete!")

    sf.write(output_path, audio, sample_rate)
    print(f"Saved to: {output_path}")
    return output_path


def clone_voice(reference_wav: str, text: str, language: str, output_path: str):
    """Clone a voice using XTTS2."""
    import torch
    from TTS.api import TTS

    device = "cpu"  # MPS not fully supported for XTTS2, CPU is stable on Mac
    print(f"\nDevice: {device}")
    print(f"Reference: {reference_wav}")
    print(f"Language: {language}")
    print(f"Text: {text[:80]}...")

    print("\nLoading XTTS2 model (first run downloads ~1.8GB)...")
    t0 = time.time()
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    print(f"Model loaded in {time.time() - t0:.1f}s")

    print("\nGenerating cloned speech...")
    t0 = time.time()
    tts.tts_to_file(
        text=text,
        speaker_wav=reference_wav,
        language=language,
        file_path=output_path,
    )
    gen_time = time.time() - t0
    print(f"Generated in {gen_time:.1f}s")
    print(f"Output saved to: {output_path}")

    # Show file size
    size_kb = os.path.getsize(output_path) / 1024
    print(f"File size: {size_kb:.1f} KB")

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="XTTS2 Voice Cloning for EduTutor.AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--reference", "-r", type=str, help="Path to reference voice WAV (3-10 seconds)")
    parser.add_argument("--record", action="store_true", help="Record reference from microphone")
    parser.add_argument("--record-duration", type=int, default=8, help="Recording duration in seconds (default: 8)")
    parser.add_argument("--text", "-t", type=str,
                        default="Ahoj, vitajte na hodine. Dnes sa budeme ucit nieco nove a zaujimave.",
                        help="Text to synthesize")
    parser.add_argument("--language", "-l", type=str, default="cs",
                        help="Language code (default: cs for Czech, closest to Slovak)")
    parser.add_argument("--output", "-o", type=str, default="cloned_output.wav",
                        help="Output file path")

    args = parser.parse_args()

    # Handle recording
    if args.record:
        ref_dir = os.path.join(os.path.dirname(__file__), "..", "models", "xtts", "references")
        os.makedirs(ref_dir, exist_ok=True)
        ref_path = os.path.join(ref_dir, "my_voice_reference.wav")
        args.reference = record_reference(ref_path, args.record_duration)

    if not args.reference:
        print("ERROR: Provide --reference path/to/voice.wav or use --record")
        parser.print_help()
        sys.exit(1)

    if not os.path.exists(args.reference):
        print(f"ERROR: Reference file not found: {args.reference}")
        sys.exit(1)

    clone_voice(args.reference, args.text, args.language, args.output)

    print(f"\n{'='*50}")
    print("DONE! Play the output:")
    print(f"  afplay {args.output}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
