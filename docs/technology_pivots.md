# Technology Pivots — EduTutor.AI
## Documented Decisions and Rationale

### Pivot 1: Coqui TTS → Azure/Edge TTS (June 2025)

| | Before | After |
|---|--------|-------|
| **Technology** | Coqui TTS (local) | Azure Neural TTS + Edge TTS (cloud) |
| **Quality** | 2.5/5 MOS | 4.5/5 MOS |
| **Trigger** | TTS quality unacceptable for tutoring |
| **Impact** | Dramatic voice quality improvement |
| **Tradeoff** | Local → Cloud dependency (mitigated by Piper fallback) |
| **Decision by** | Team (Lucia Uhrinova, Sofia Hornakova) |
| **Date** | June 2025, completed in 3 days |

### Pivot 2: Gemma → Mistral 7B (July 2025)

| | Before | After |
|---|--------|-------|
| **Technology** | Gemma 9B | Mistral 7B (4-bit quantized) |
| **Slovak quality** | Medium | High |
| **Latency** | ~3s | ~2s |
| **Trigger** | Better Slovak language support needed |
| **Decision by** | Csilla Kovacova, Lucia Uhrinova |
| **Date** | July 11, 2025 |

### Pivot 3: Pinecone → Weaviate/ChromaDB (October 2025)

| | Before | After |
|---|--------|-------|
| **Technology** | Pinecone (cloud SaaS) | Weaviate (Docker) + ChromaDB (embedded) |
| **Deployment** | Cloud only | Local + Cloud |
| **Trigger** | Grant requires local deployment capability |
| **Benefit** | Hybrid search (BM25 + vector), zero cost |
| **Hit Rate** | 82% | 86-88% |
| **Decision by** | Csilla Kovacova, Andrea Kutlikova |
| **Date** | October 2025 |

### Pivot 4: BERT Sentiment → Regex Detector (PB5, March 2026)

| | Before | After |
|---|--------|-------|
| **Technology** | Fine-tuned DistilBERT (91% acc) | Regex keyword detector (~85% acc) |
| **Latency** | ~50ms | ~1ms |
| **Resources** | ~300MB + GPU recommended | Zero |
| **Trigger** | Production latency requirements for real-time tutoring |
| **BERT status** | Available as configurable backend (`EMOTION_BACKEND=bert`) |
| **Decision by** | Csilla Kovacova |
| **Date** | March 2026 |

### Pivot 5: Mistral 7B Default → Multi-Provider (Ongoing)

| | Before | After |
|---|--------|-------|
| **Technology** | Mistral 7B (single model) | Multi-provider: OpenAI, Anthropic, Ollama, Groq, vLLM |
| **Trigger** | Different hardware requires different models |
| **Benefit** | Hardware-adaptive: auto-selects best model for user's machine |
| **Local option** | Ollama + Gemma3:4b / Mistral 7B |
| **Cloud option** | GPT-4o-mini (best quality) |

## Summary

Each pivot was driven by measurable quality or performance data. The project evolved from single-provider to multi-provider architecture, giving users the flexibility to choose between local (offline) and cloud (quality) deployments.
