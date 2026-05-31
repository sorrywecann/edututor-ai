---
title: "EduTutor.AI — Technical Documentation"
subtitle: "AI-Powered Slovak Language Tutoring Platform"
author: "SORRYWECAN s.r.o."
date: "2026-04-09"
lang: en
---

# Executive Summary

EduTutor.AI is an AI-powered voice tutoring platform for Slovak language acquisition. It delivers a real-time conversational learning experience via a Speech-to-Text → Retrieval-Augmented Generation → Large Language Model → Text-to-Speech pipeline, with a visual avatar that reflects AI emotional state.

# System Architecture

## Components

| Component | Technology | Role |
|-----------|-----------|------|
| Frontend | Next.js 15, React 19, TypeScript | User interface, voice interaction |
| Backend | Python 3.11, FastAPI | API layer, business logic |
| LLM | Anthropic Claude (claude-haiku-4-5-20251001) | Natural language understanding, response generation |
| STT | OpenAI Whisper / edge-tts | Speech recognition (Slovak sk-SK) |
| TTS | edge-tts sk-SK-ViktoriaNeural / Azure | Voice synthesis (Slovak) |
| Vector DB | Weaviate 1.28 | Course material retrieval (RAG) |
| Relational DB | PostgreSQL 16 | Users, conversations, knowledge bases |
| Cache | Redis 7 | Conversation context cache (24h TTL) |
| Voice Server | LiveKit | Real-time audio pipeline |

## Voice Pipeline

```
Microphone → WAV/WebM → STT (Whisper sk-SK)
    → Transcript → Context Retrieval (Weaviate RAG)
    → LLM (Claude Haiku) with system prompt + retrieved context
    → Response text → Sentiment analysis → Emotion label
    → SSML with emotion → TTS (sk-SK-ViktoriaNeural)
    → Audio stream → Speaker → Avatar state update
```

# Avatar System

## Phase 1: Orb (Implemented)
Abstract animated orb as avatar. Four states (idle, listening, thinking, speaking) communicated via CSS animation speed and color. Pulsing aura provides ambient presence.

## Phase 2: Three.js (Web-native, Planned)
React Three Fiber bust model with 15 Slovak viseme blendshapes. BlendshapeController driven by TTS phoneme stream. Falls back to orb if WebGL unavailable.

## Phase 3: UE5 (Desktop/Streamed, Planned)
ZBrush → Maya character with 15 Slovak viseme blendshapes. Animation Blueprint driven by JavaScript Bridge.

```js
// JavaScript Bridge — EduTutor → UE5
window.postMessage({ type: 'viseme', viseme: 'AA', weight: 0.8, duration: 120 }, '*');
window.postMessage({ type: 'emotion', emotion: 'encouraging', intensity: 0.6 }, '*');
```

Slovak viseme set: PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou, ww, uw, sil

# Lipsync Module

```typescript
const PHONEME_VISEME: Record<string, string> = {
  'AA': 'aa', 'AE': 'aa', 'AH': 'aa',
  'IY': 'ih', 'IH': 'ih',
  'OW': 'oh', 'OY': 'ou',
  'UW': 'uw', 'UH': 'uw',
  'P': 'PP', 'B': 'PP', 'M': 'PP',
  'F': 'FF', 'V': 'FF',
  'T': 'DD', 'D': 'DD', 'N': 'nn',
  'K': 'kk', 'G': 'kk',
  'S': 'SS', 'Z': 'SS',
  'SH': 'CH', 'CH': 'CH',
  'R': 'RR', 'L': 'RR',
  'W': 'ww', 'Y': 'ww',
};
```

# Performance Targets

k6 load test (50 concurrent users, 5 minutes):
- p95 response time: < 3000ms
- Median chat latency: < 2000ms
- Error rate: < 5%

Run: `k6 run tests/k6/load-test.js`

# Grant Deliverables

| # | Deliverable | Status | Location |
|---|-------------|--------|----------|
| 1 | Lipsync module | Implemented | `core/src/components/voice/OrbAvatar.tsx` + phoneme map |
| 2 | UE5 JS bridge spec | Documented | Section 3 of this document |
| 3 | Performance test | k6 script provided | `tests/k6/load-test.js` |
| 4 | Docker package | Complete | `docker-compose.yml`, `tutor-service/Dockerfile` |
| 5 | Technical documentation | This document | `docs/tech-report.md` |
| 6 | Open-source publication | Published | github.com/princeofwellness/edotutor (MIT) |
| 7 | Test audio files (3x) | Generated | `test-files/*.wav` |
| 8 | One-click startup | Shell script | `scripts/start.sh` |
| 9 | MIT License | Applied | `LICENSE` |

# Installation

```bash
# Quick start
bash scripts/start.sh

# Manual
cp tutor-service/.env.example tutor-service/.env
# Fill in ANTHROPIC_API_KEY in .env
docker compose up -d
cd tutor-service && source venv/bin/activate && uvicorn app.main:app --port 8000
cd core && pnpm dev
```

Demo credentials: `demo@edututor.sk` / `edututor2026`
