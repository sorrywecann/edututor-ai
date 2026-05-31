#!/usr/bin/env python3
"""
EduTutor.AI — Pipeline Benchmark
Measures per-module latency for the full voice pipeline.
Runs each test .wav through: STT → RAG → LLM → Emotion → Viseme → TTS

Usage:
    cd tutor-service
    python -m tests.benchmark_pipeline          # uses API calls
    python ../tests/benchmark_pipeline.py       # same thing
"""

from __future__ import annotations

import asyncio
import time
import json
import sys
import os
import httpx

API = os.getenv("API_BASE", "http://localhost:8000")

TEST_FILES = [
    ("test.wav", "krátky vstup"),
    ("oop_test.wav", "stredný vstup (OOP)"),
    ("oop_constructor.wav", "dlhý vstup (OOP konštruktory)"),
]

TEST_DIR = os.path.join(os.path.dirname(__file__), "..", "test-files")


async def benchmark_stt(client: httpx.AsyncClient, wav_path: str) -> tuple[float, str]:
    """Send .wav to STT, return (seconds, transcript)."""
    with open(wav_path, "rb") as f:
        audio_data = f.read()

    t0 = time.perf_counter()
    resp = await client.post(
        f"{API}/api/v1/stt",
        files={"audio": ("test.wav", audio_data, "audio/wav")},
        timeout=60,
    )
    elapsed = time.perf_counter() - t0
    resp.raise_for_status()
    data = resp.json()
    transcript = data.get("text", data.get("transcript", str(data)))
    return elapsed, transcript


async def benchmark_chat_modules(
    client: httpx.AsyncClient,
    text: str,
    llm_provider: str | None = None,
    tts_provider: str = "edge",
    tts_voice: str = "sk-SK-LukasNeural",
    knowledge_base: str | None = None,
) -> dict:
    """
    Call /chat (non-streaming) and measure total latency.
    The response includes latency_ms, emotion, viseme_timeline.
    """
    payload = {
        "message": text,
        "tts_provider": tts_provider,
        "tts_voice": tts_voice,
        "stream": False,
    }
    if llm_provider:
        payload["provider"] = llm_provider
    if knowledge_base:
        payload["knowledge_base"] = knowledge_base

    t0 = time.perf_counter()
    resp = await client.post(f"{API}/api/v1/chat", json=payload, timeout=120)
    total_elapsed = time.perf_counter() - t0
    resp.raise_for_status()
    data = resp.json()

    return {
        "total_s": total_elapsed,
        "server_latency_ms": data.get("latency_ms"),
        "response_text": data.get("response", "")[:120],
        "response_len": len(data.get("response", "")),
        "emotion": data.get("emotion", "unknown"),
        "intensity": data.get("intensity", 0),
        "viseme_count": len(data.get("viseme_timeline", [])),
        "audio_duration_ms": data.get("audio_duration_ms", 0),
        "provider": data.get("provider", "unknown"),
    }


async def benchmark_tts_standalone(
    client: httpx.AsyncClient,
    text: str,
    provider: str = "edge",
    voice: str = "sk-SK-LukasNeural",
) -> float:
    """Measure TTS synthesis time independently."""
    t0 = time.perf_counter()
    resp = await client.post(
        f"{API}/api/v1/tts",
        json={"text": text, "provider": provider, "voice": voice},
        timeout=60,
    )
    elapsed = time.perf_counter() - t0
    resp.raise_for_status()
    return elapsed


async def measure_local_modules(text: str) -> dict:
    """Measure emotion detection + viseme timeline locally (no network)."""
    # Add tutor-service to path so we can import directly
    svc_path = os.path.join(os.path.dirname(__file__), "..", "tutor-service")
    if svc_path not in sys.path:
        sys.path.insert(0, svc_path)

    from app.services.emotion_detector import detect_emotion
    from app.services.viseme_timeline import build_timeline

    t0 = time.perf_counter()
    emotion_result = detect_emotion(text)
    emotion_time = time.perf_counter() - t0

    t0 = time.perf_counter()
    frames, duration_ms = build_timeline(text)
    viseme_time = time.perf_counter() - t0

    return {
        "emotion_s": emotion_time,
        "viseme_s": viseme_time,
        "emotion": emotion_result.emotion,
        "intensity": emotion_result.intensity,
        "viseme_count": len(frames),
        "audio_duration_ms": duration_ms,
    }


async def run_full_benchmark(llm_provider: str | None = None, label: str = ""):
    """Run the complete benchmark suite."""
    print(f"\n{'='*70}")
    print(f"  BENCHMARK: {label or 'default config'}")
    print(f"{'='*70}")

    async with httpx.AsyncClient(timeout=120) as client:
        # Verify backend
        try:
            r = await client.get(f"{API}/api/v1/health")
            health = r.json()
            print(f"  Backend: OK | LLM: {health.get('model', '?')}")
        except Exception as e:
            print(f"  ❌ Backend nedostupný: {e}")
            return None

        results = []

        for wav_name, description in TEST_FILES:
            wav_path = os.path.join(TEST_DIR, wav_name)
            if not os.path.exists(wav_path):
                print(f"  ⚠ {wav_name} not found, skipping")
                continue

            print(f"\n  ── {wav_name} ({description}) ──")

            # 1. STT
            try:
                stt_time, transcript = await benchmark_stt(client, wav_path)
                print(f"  STT:      {stt_time:.3f}s | \"{transcript[:80]}...\"")
            except Exception as e:
                print(f"  STT:      ❌ {e}")
                stt_time, transcript = -1, ""
                continue

            # 2. Emotion + Viseme (local, no network)
            try:
                local = await measure_local_modules(transcript)
                print(f"  Emotion:  {local['emotion_s']:.4f}s | {local['emotion']} ({local['intensity']:.2f})")
                print(f"  Viseme:   {local['viseme_s']:.4f}s | {local['viseme_count']} frames, {local['audio_duration_ms']}ms")
            except Exception as e:
                print(f"  Local:    ❌ {e}")
                local = {"emotion_s": -1, "viseme_s": -1}

            # 3. Chat (RAG + LLM + emotion + viseme — full server pipeline)
            try:
                chat = await benchmark_chat_modules(client, transcript, llm_provider=llm_provider)
                print(f"  Chat:     {chat['total_s']:.3f}s (server: {chat['server_latency_ms']}ms) | provider: {chat['provider']}")
                print(f"            → \"{chat['response_text']}...\"")
            except Exception as e:
                print(f"  Chat:     ❌ {e}")
                chat = {"total_s": -1, "server_latency_ms": -1}

            # 4. TTS standalone (Edge)
            response_text = chat.get("response_text", transcript) or transcript
            try:
                tts_time = await benchmark_tts_standalone(client, response_text, "edge")
                print(f"  TTS Edge: {tts_time:.3f}s")
            except Exception as e:
                print(f"  TTS Edge: ❌ {e}")
                tts_time = -1

            # 5. TTS Azure (if available)
            tts_azure_time = -1
            try:
                tts_azure_time = await benchmark_tts_standalone(
                    client, response_text, "azure", "sk-SK-LukasNeural"
                )
                print(f"  TTS Azure:{tts_azure_time:.3f}s")
            except Exception as e:
                print(f"  TTS Azure: ⚠ {e}")

            # Compute total E2E
            e2e = stt_time + chat["total_s"] + tts_time
            print(f"  ────────────────────────────────")
            print(f"  E2E total: {e2e:.3f}s (STT + Chat + TTS Edge)")

            results.append({
                "file": wav_name,
                "description": description,
                "stt_s": round(stt_time, 3),
                "transcript": transcript,
                "chat_total_s": round(chat["total_s"], 3),
                "chat_server_ms": chat.get("server_latency_ms"),
                "llm_provider": chat.get("provider", "unknown"),
                "response_len": chat.get("response_len", 0),
                "emotion_s": round(local.get("emotion_s", -1), 4),
                "viseme_s": round(local.get("viseme_s", -1), 4),
                "viseme_count": local.get("viseme_count", 0),
                "tts_edge_s": round(tts_time, 3),
                "tts_azure_s": round(tts_azure_time, 3) if tts_azure_time > 0 else None,
                "e2e_s": round(e2e, 3),
            })

    return results


async def main():
    all_results = {}

    # Benchmark 1: Current config (OpenAI/cloud)
    r = await run_full_benchmark(label="Aktuálny stack (Cloud LLM + Edge TTS)")
    if r:
        all_results["cloud"] = r

    # Benchmark 2: Ollama mistral (local)
    r = await run_full_benchmark(llm_provider="ollama:mistral:latest", label="Lokálny stack (Ollama/Mistral + Edge TTS)")
    if r:
        all_results["ollama_mistral"] = r

    # Benchmark 3: Ollama gemma3:12b (comparable to old Gemma)
    r = await run_full_benchmark(llm_provider="ollama:gemma3:12b", label="Lokálny stack (Ollama/Gemma3:12b + Edge TTS)")
    if r:
        all_results["ollama_gemma3"] = r

    # Save JSON results
    out_path = os.path.join(os.path.dirname(__file__), "..", "docs", "benchmark_results.json")
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"\n✅ Výsledky uložené: {out_path}")

    # Print summary table
    print(f"\n{'='*70}")
    print("  SÚHRNNÁ TABUĽKA")
    print(f"{'='*70}")
    print(f"  {'Vstup':<22} {'STT':>7} {'Chat':>7} {'TTS':>7} {'E2E':>7}  Provider")
    print(f"  {'─'*22} {'─'*7} {'─'*7} {'─'*7} {'─'*7}  {'─'*20}")

    for config_name, runs in all_results.items():
        print(f"\n  [{config_name}]")
        for r in runs:
            print(
                f"  {r['file']:<22} {r['stt_s']:>6.2f}s {r['chat_total_s']:>6.2f}s "
                f"{r['tts_edge_s']:>6.2f}s {r['e2e_s']:>6.2f}s  {r['llm_provider']}"
            )


if __name__ == "__main__":
    asyncio.run(main())
