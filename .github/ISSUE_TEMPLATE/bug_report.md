---
name: Bug report
about: Something is broken — help us reproduce and fix it
title: 'bug: '
labels: ['bug', 'triage']
assignees: ''
---

## Summary

<!-- One sentence: what's broken? -->

## Reproduction steps

1.
2.
3.

## Expected

<!-- What did you expect to happen? -->

## Actual

<!-- What happened instead? Include logs / screenshots / error text. -->

```
<paste error text or stack trace here>
```

## Environment

- **OS:** (e.g. macOS 14.5, Ubuntu 22.04, Windows 11)
- **Python:** `python --version`
- **Node:** `node --version` (frontend only)
- **Browser:** (frontend bugs)
- **Commit / version:** `git rev-parse --short HEAD` or release tag

## Affected component

<!-- Tick what applies -->

- [ ] Backend API (`tutor-service/`)
- [ ] Frontend (`core/`)
- [ ] UE5 avatar bridge
- [ ] Voice session (STT / TTS)
- [ ] RAG / knowledge base
- [ ] Skill platform / tool dispatch
- [ ] Identity / auth
- [ ] Deployment (Docker, scripts)
- [ ] Documentation
- [ ] Other:

## Severity

- [ ] Blocker — app unusable
- [ ] High — feature broken
- [ ] Medium — degraded UX, workaround exists
- [ ] Low — cosmetic / docs

## Additional context

<!-- Anything else: when did it start, related issues, your debugging notes. -->
