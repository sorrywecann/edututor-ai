# Contributing to EduTutor.AI

Thanks for your interest. This project welcomes contributions.

---

## Before you start

1. **Read the ADRs** under [`docs/adrs/`](./docs/adrs/) — they document
   the five non-negotiable architectural invariants. This is the on-ramp.
2. **Run the test suite** to confirm a green baseline. After completing SETUP.md (Prerequisites + start.ps1/sh first run), you can run:
   ```bash
   cd tutor-service && python -m pytest tests/ -q
   # Expect: 523 passed, 8 skipped
   # (or 512 / 10 if your host's ffmpeg is incompatible with torchcodec —
   #  the 11 memory tests skip cleanly at module level in that case)
   ```
3. **Check open issues** for in-flight work. If your idea overlaps active
   work, coordinate before duplicating effort.

---

## How to contribute

### Reporting a bug

Open an issue using the **Bug report** template. Include:
- What you did
- What you expected
- What actually happened (logs, screenshots, error text)
- Environment (OS, Python/Node versions, browser)

### Proposing a feature

Open an issue using the **Feature request** template. For non-trivial
features, expect that we'll ask you to draft a plan before code. See
[`docs/workflows/phase-deliverable.md`](./docs/workflows/phase-deliverable.md).

### Sending a pull request

1. Fork, branch from `main`, name your branch descriptively
   (e.g. `feat/spaced-rep-stats`, `fix/ue5-disconnect-race`).
2. Make focused commits. Imperative summary line. No AI/tool
   attribution. No emojis. Body explains the why.
3. Run **`/edu-pre-pr`** (if you have OpenCode) or the equivalent manual
   checklist in [`.github/pull_request_template.md`](./.github/pull_request_template.md).
4. Open the PR. Fill in the template completely.
5. Address review comments. Push fixes as new commits (don't force-push
   during review unless asked).
6. Maintainer merges when CI passes and the invariants checklist is
   satisfied.

---

## Architectural invariants (non-negotiable)

These five contracts must not break. If your change touches one,
discuss in an issue first.

1. **UE5 protocol v2.1 back-compat** — see [`docs/adrs/005-ue5-protocol-v21.md`](./docs/adrs/005-ue5-protocol-v21.md)
2. **NaiveNeuron HF model IDs** (CC-BY-4.0 attribution) — see [`docs/adrs/003-naiveneuron-attribution.md`](./docs/adrs/003-naiveneuron-attribution.md)
3. **`X-EduTutor-User-Id` header path** for identity — see [`docs/adrs/004-anonymous-by-default-identity.md`](./docs/adrs/004-anonymous-by-default-identity.md)
4. **Asymmetric DI** (LLM eager, RAG/TTS lazy) — see [`docs/adrs/001-asymmetric-DI.md`](./docs/adrs/001-asymmetric-DI.md)
5. **Dict-dispatch tables** for providers (no `if/elif`) — see [`docs/adrs/002-dict-dispatch.md`](./docs/adrs/002-dict-dispatch.md)

---

## Code conventions

| Concern | Convention |
|---|---|
| Type errors | No `as any`, `@ts-ignore`, `@ts-expect-error` — fix the type |
| Error handling | No empty `catch {}` blocks — handle or let it propagate |
| Comments | Only for non-obvious invariants, security/protocol contracts, performance choices, license attribution. CI hook flags violations. |
| Test docstrings | Required. Document the contract pinned + historical context. |
| Commits | Imperative summary, no AI attribution, no emojis, body explains *why*. End with `Verified: N passed + M skipped`. |
| Provider additions | Dict-dispatch table entries only (TTS / LLM / STT / RAG). See [`docs/adrs/002-dict-dispatch.md`](./docs/adrs/002-dict-dispatch.md). |
| Skill additions | Follow the canonical pattern in [`docs/workflows/new-skill.md`](./docs/workflows/new-skill.md). |

---

## Setting up locally

See [`SETUP.md`](./SETUP.md) for full setup. TL;DR:

```bash
git clone <your fork>
cd edututor-ai-sandbox
./start.sh        # Mac/Linux  ·  start.bat for Windows
```

For one-click dev environments, this repo includes a
[`.devcontainer/`](./.devcontainer/) config compatible with VS Code Dev
Containers and GitHub Codespaces.

---

## Community

- **Bug reports / features**: GitHub Issues
- **Security disclosures**: see [`SECURITY.md`](./SECURITY.md) — please
  do not file public issues for security problems
- **Code of conduct**: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

---

## Contact

### Maintainers
- **Project Owner**: princeofwellness ([GitHub](https://github.com/princeofwellness))
- **UE5 / Avatar**: open a GitHub issue tagged `avatar` on this repo, or DM via GitHub.
- **Slack/Discord**: TBD — see repo README for community channels.

### Avatar work
Avatar pipeline changes (visemes, MetaHuman Blueprint, ZenDyn) require coordination with the UE5 team. Before touching:
- `tutor-service/app/services/avatar_*`
- `tutor-service/app/services/lipsync*`
- `docs/architecture/ue5-avatar-contract.md`
- any `/ws/avatar` payload field

Open a GitHub issue tagged `avatar-coordination` and assign to the project owner.

---

## License

By contributing, you agree your contributions will be licensed under
the same terms as the project. See [`LICENSE`](./LICENSE).
