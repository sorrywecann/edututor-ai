# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in EduTutor.AI, **please do
not open a public GitHub issue.**

Instead, report it privately via one of the following:

- **GitHub Security Advisory**: use the "Report a vulnerability" button
  in the repository's Security tab (preferred)
- **Email**: security@sorrywecan.com (replace with the maintainer's
  preferred address if forked)

Please include:

- A clear description of the vulnerability
- Steps to reproduce, or a proof-of-concept
- The affected component (backend, frontend, UE5 bridge, etc.)
- The version / commit SHA you tested against
- Your assessment of impact and severity
- Optional: a suggested fix

## Response timeline

- **48 hours** — initial acknowledgment
- **7 days** — initial assessment + severity classification
- **30 days target** — fix released for high-severity issues

We will credit you in the security advisory unless you prefer to remain
anonymous.

## In scope

- Backend API (`tutor-service/`)
- Frontend (`core/`)
- WebSocket protocols (UE5 avatar bridge, voice session)
- Identity / auth flows
- Skill platform (tool dispatch, sandboxing)
- Provider integrations (TTS / LLM / STT / RAG)
- Deployment configs (`docker-compose*`, `nginx/`)

## Out of scope

- Vulnerabilities in third-party dependencies — please report those
  upstream (and let us know so we can pin / patch / upgrade)
- Social engineering of maintainers
- DoS via unauthenticated request flooding (rate-limit configurable at
  deploy time)
- Issues that require physical access to the user's device

## Hardening notes

- Secrets live in `.env` (gitignored). Never commit credentials.
- The Phase 8a identity middleware is anonymous-by-default. Phase 9
  will introduce real authentication. Until then, treat the deployment
  as a single-trust-domain.
- The UE5 WebSocket allows localhost origins on any port (a deliberate
  fix for the development loop, see [`docs/adrs/005-ue5-protocol-v21.md`](./docs/adrs/005-ue5-protocol-v21.md)).
  Production deployments should restrict origins via reverse proxy.
