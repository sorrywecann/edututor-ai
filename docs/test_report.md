# Test Report — EduTutor.AI
## Comprehensive Testing Summary | April 2026

## Test Matrix

| Category | Test Files | Tests | Status |
|----------|-----------|-------|--------|
| API Health | test_health.py | 3 | Pass |
| Chat Pipeline | test_chat_deep.py | 8+ | Pass |
| Chat RAG Integration | test_chat_rag.py | 5+ | Pass |
| RAG Pipeline | test_rag_pipeline.py | 6+ | Pass |
| RAG Edge Cases | test_rag_edge_cases.py | 5+ | Pass |
| Knowledge Base API | test_knowledge_base_api.py | 6+ | Pass |
| Conversations API | test_conversations_api.py | 5+ | Pass |
| STT Service | test_stt_service.py | 4+ | Pass |
| Emotion Detector | test_emotion_detector.py | 5+ | Pass |
| Emotion Deep Tests | test_emotion_detector_deep.py | 8+ | Pass |
| Viseme Timeline | test_viseme_timeline.py | 4+ | Pass |
| Viseme Deep Tests | test_viseme_timeline_deep.py | 6+ | Pass |
| WebSocket Avatar | test_ws_avatar.py | 4+ | Pass |
| Memory Service | test_memory_service.py | 5+ | Pass |
| Memory Security | test_memory_service_security.py | 4+ | Pass |
| Context Cache | test_context_cache.py | 4+ | Pass |
| Sentence Splitting | test_split_sentences.py | 6+ | Pass |
| Ollama Provider | test_ollama_provider.py | 3+ | Pass |
| Stats Endpoint | test_stats_endpoint.py | 3+ | Pass |
| **Total** | **19 test files** | **~95+** | **All Pass** |

## Golden Dataset Validation

| Metric | Value |
|--------|-------|
| Total questions | 354 |
| Subjects | 5 (OOP, PRPR, DSA, IAU, MA) |
| Golden benchmark set | 30 questions |
| Schema validation | Pass |
| Target Hit Rate | >90% |

Validation script: `scripts/validate_golden_dataset.py`

## Performance Benchmarks

| Component | Metric | Target | Measured |
|-----------|--------|--------|----------|
| STT (faster-whisper) | Latency | <2s | ~1.0s |
| STT (mlx-whisper) | Latency | <1s | ~0.5s |
| LLM (GPT-4o-mini) | TTFB | <2s | ~1.5s |
| LLM (Ollama gemma3:4b) | TTFB | <4s | ~3.0s |
| TTS (Edge) | Latency | <500ms | ~100ms |
| TTS (Piper) | Latency | <500ms | ~30ms |
| RAG retrieval | Latency | <200ms | ~45ms (Chroma) |
| End-to-end | Total | <8s | ~5-7s |

## Offline Mode Verification

Script: `scripts/test_offline_mode.sh`

| Check | Status |
|-------|--------|
| Piper ONNX model present | Pass |
| piper-tts package installed | Pass |
| Ollama available | Pass (when installed) |
| faster-whisper available | Pass |
| ChromaDB available | Pass |

## Load Testing

K6 load test: `tests/k6/load-test.js`
- Health endpoint: <50ms p95
- Chat endpoint: <10s p95 (includes LLM generation)
- Concurrent users: tested up to 10 simultaneous
