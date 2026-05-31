# Changelog

All notable changes to EduTutor.AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — TBD

### Initial public release

EduTutor.AI is a Slovak-first voice tutor desktop application combining
on-device AI services with a real-time UE5 MetaHuman avatar.

#### Features
- **Slovak STT** via Whisper SloPal fine-tunes (NaiveNeuron, EMNLP 2025, CC-BY-4.0)
- **Multi-provider LLM**: OpenAI / Anthropic / Ollama (bundled) / vLLM / custom-registry
- **Slovak TTS**: Edge TTS (default), Piper offline, Azure Neural, OpenAI, Google
- **RAG** with ChromaDB embedded (no Docker needed) — paraphrase-multilingual-MiniLM-L12-v2
- **UE5 MetaHuman avatar** (MHC_Girl) with 14-viseme grapheme-to-viseme Slovak lipsync
- **9-emotion pedagogical avatar** (neutral, celebrating, proud, encouraging_mild, correcting, patient, curious, thinking_deep, surprise)
- **Knowledge Base platform**: PDF/DOCX upload, Chat / Study / Voice / Ask modes
- **Skills**: web_search, spaced_repetition (FSRS-6), memory
- **8 learning modes** in Slovak and English

#### Distribution
- **Windows .exe installer** (NSIS, per-user, ~1.8 GB, zero-key offline ready)
- **Docker Compose** for institutional server deployment
- **MIT licensed** — fully open-source

#### Architecture
- FastAPI backend (Python 3.11+) — 23 routers, ~95 endpoints
- Next.js 15 frontend (React 19, App Router)
- Electron desktop launcher (5-service orchestrator with health probes)
- 6 ADRs documenting architectural decisions
- 681+ pytest backend tests

#### Acknowledgments
Developed by SORRYWECAN s.r.o. with support from Slovak Recovery Plan (Plán Obnovy)
under Slovak Government Office, project 09I05-03-V04-00072 (VAIA).

[Unreleased]: https://github.com/sorrywecann/edututor-ai/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sorrywecann/edututor-ai/releases/tag/v1.0.0
