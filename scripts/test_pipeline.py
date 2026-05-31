#!/usr/bin/env python3
"""
EduTutor.AI - Pipeline Test Script
Tests the complete STT -> LLM -> TTS pipeline
"""

import asyncio
import sys
import os
import argparse
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tutor-service"))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "tutor-service" / ".env")


async def test_llm():
    """Test LLM service"""
    print("\n" + "=" * 50)
    print("Testing LLM Service")
    print("=" * 50)

    from app.services.llm_service import LLMService, ChatMessage

    llm = LLMService()
    await llm.initialize()

    print(f"Provider: {llm.provider}")

    messages = [
        ChatMessage(
            role="system",
            content="Si EduTutor, slovenský vzdelávací asistent. Odpovedaj stručne.",
        ),
        ChatMessage(role="user", content="Čo je Python?"),
    ]

    print("\nGenerating response...")
    response = await llm.generate(messages)
    print(f"\nResponse: {response}")

    return True


async def test_tts():
    """Test TTS service"""
    print("\n" + "=" * 50)
    print("Testing TTS Service")
    print("=" * 50)

    from app.services.tts_service import TTSService

    tts = TTSService()
    await tts.initialize()

    print(f"Provider: {tts.provider}")

    text = "Ahoj! Som EduTutor, tvoj vzdelávací asistent."
    print(f"\nSynthesizing: '{text}'")

    result = await tts.synthesize(text)

    print(f"Audio format: {result.audio_format}")
    print(f"Duration: {result.duration_ms}ms")
    print(f"Visemes: {len(result.visemes)}")
    print(f"Audio size: {len(result.audio_data)} bytes")

    # Save audio to file
    output_path = Path(__file__).parent.parent / "test-files" / "tts_output.mp3"
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(result.audio_data)
    print(f"\nSaved audio to: {output_path}")

    return True


async def test_stt(audio_file: str = None):
    """Test STT service"""
    print("\n" + "=" * 50)
    print("Testing STT Service")
    print("=" * 50)

    from app.services.stt_service import STTService

    stt = STTService()
    await stt.initialize()

    print(f"Provider: {stt.provider}")
    print(f"Model: {stt.model_name}")

    if audio_file and os.path.exists(audio_file):
        print(f"\nTranscribing: {audio_file}")
        with open(audio_file, "rb") as f:
            audio_data = f.read()

        result = await stt.transcribe(audio_data, language="sk")

        print(f"\nTranscription: {result.text}")
        print(f"Language: {result.language}")
        print(f"Confidence: {result.confidence}")
        print(f"Duration: {result.duration_seconds}s")
    else:
        print("\nNo audio file provided, using mock transcription")
        result = await stt.transcribe(b"mock audio data")
        print(f"Mock transcription: {result.text}")

    return True


async def test_rag():
    """Test RAG service"""
    print("\n" + "=" * 50)
    print("Testing RAG Service")
    print("=" * 50)

    from app.services.rag_service import RAGService

    rag = RAGService()

    try:
        await rag.initialize()
        print("RAG service initialized successfully")
        print(f"Ready: {rag.is_ready()}")

        # Test embedding
        test_text = "Python je vysokoúrovňový programovací jazyk."
        embedding = rag._generate_embedding(test_text)
        print(f"\nEmbedding dimension: {len(embedding)}")

        await rag.close()
        return True

    except Exception as e:
        print(f"RAG service error (Weaviate may not be running): {e}")
        return False


async def test_full_pipeline(audio_file: str = None):
    """Test complete pipeline"""
    print("\n" + "=" * 50)
    print("Testing Full Pipeline: STT -> LLM -> TTS")
    print("=" * 50)

    from app.services.stt_service import STTService
    from app.services.llm_service import LLMService, ChatMessage
    from app.services.tts_service import TTSService

    # Initialize services
    stt = STTService()
    await stt.initialize()

    llm = LLMService()
    await llm.initialize()

    tts = TTSService()
    await tts.initialize()

    # Step 1: STT
    print("\n1. Speech-to-Text...")
    if audio_file and os.path.exists(audio_file):
        with open(audio_file, "rb") as f:
            audio_data = f.read()
        stt_result = await stt.transcribe(audio_data, language="sk")
        user_text = stt_result.text
    else:
        user_text = "Čo je objektovo orientované programovanie?"

    print(f"   User: {user_text}")

    # Step 2: LLM
    print("\n2. LLM Processing...")
    messages = [
        ChatMessage(
            role="system",
            content="Si EduTutor, slovenský vzdelávací asistent. Odpovedaj stručne a jasne.",
        ),
        ChatMessage(role="user", content=user_text),
    ]

    response = await llm.generate(messages)
    print(f"   EduTutor: {response}")

    # Step 3: TTS
    print("\n3. Text-to-Speech...")
    tts_result = await tts.synthesize(response)
    print(f"   Audio duration: {tts_result.duration_ms}ms")

    # Save output
    output_path = Path(__file__).parent.parent / "test-files" / "pipeline_output.mp3"
    output_path.parent.mkdir(exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(tts_result.audio_data)
    print(f"\n   Saved to: {output_path}")

    print("\n" + "=" * 50)
    print("Pipeline test completed!")
    print("=" * 50)

    return True


async def main():
    parser = argparse.ArgumentParser(description="EduTutor.AI Pipeline Test")
    parser.add_argument("--audio", help="Path to audio file for STT test")
    parser.add_argument(
        "--test",
        choices=["llm", "tts", "stt", "rag", "pipeline", "all"],
        default="all",
        help="Test to run",
    )

    args = parser.parse_args()

    print("=" * 50)
    print("EduTutor.AI - Pipeline Test")
    print("=" * 50)

    results = {}

    if args.test in ["llm", "all"]:
        try:
            results["LLM"] = await test_llm()
        except Exception as e:
            print(f"LLM test failed: {e}")
            results["LLM"] = False

    if args.test in ["tts", "all"]:
        try:
            results["TTS"] = await test_tts()
        except Exception as e:
            print(f"TTS test failed: {e}")
            results["TTS"] = False

    if args.test in ["stt", "all"]:
        try:
            results["STT"] = await test_stt(args.audio)
        except Exception as e:
            print(f"STT test failed: {e}")
            results["STT"] = False

    if args.test in ["rag", "all"]:
        try:
            results["RAG"] = await test_rag()
        except Exception as e:
            print(f"RAG test failed: {e}")
            results["RAG"] = False

    if args.test == "pipeline":
        try:
            results["Pipeline"] = await test_full_pipeline(args.audio)
        except Exception as e:
            print(f"Pipeline test failed: {e}")
            results["Pipeline"] = False

    # Summary
    print("\n" + "=" * 50)
    print("Test Summary")
    print("=" * 50)
    for test, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"  {test}: {status}")

    all_passed = all(results.values())
    print("\n" + ("All tests passed!" if all_passed else "Some tests failed."))

    return 0 if all_passed else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
