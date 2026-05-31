# ADR-003: NaiveNeuron HF Model IDs are an Attribution Contract (CC-BY-4.0)

**Status:** Accepted (immutable)

---

## Context

EduTutor.AI's Slovak STT (Speech-to-Text) uses HuggingFace models from
the **NaiveNeuron** organization (SloPal fine-tunes of Whisper for Slovak).
These models are released under **CC-BY-4.0**, which requires:

1. **Attribution** — the model's original IDs and source must be preserved
2. **Derivative marking** — if modified, derivatives must be marked as such
3. **License preservation** — downstream uses inherit CC-BY-4.0

For EduTutor.AI, the cleanest path to compliance is to **never rename or
re-organize** the NaiveNeuron model IDs in our codebase. The IDs serve
as the attribution link back to the original publishers.

## Decision

The NaiveNeuron HuggingFace model IDs are referenced **verbatim** in the
EduTutor.AI codebase. They are a contract, not implementation detail.

Specifically, the IDs appear in:
- `tutor-service/app/services/` (STT service registry)
- `tutor-service/app/config/` (STT model configuration)

These IDs are **pinned by** [`tutor-service/tests/test_slopal_registry.py`](../../tutor-service/tests/test_slopal_registry.py)
(6 tests). The test compares the in-code IDs against a frozen baseline.
Any change to the IDs fails this test.

## The rule (NON-NEGOTIABLE)

**NEVER change NaiveNeuron HF model IDs verbatim** without explicit user
confirmation in the current turn.

This rule is pinned in:
- This ADR (canonical source). The NaiveNeuron attribution rule: CC-BY-4.0 mandates citing the SK model authors by preserving their HuggingFace model IDs verbatim in the codebase.
- [`tutor-service/app/services/README.md`](../../tutor-service/app/services/README.md)
- [`.opencode/commands/edu-new-tts.md`](../../.opencode/commands/edu-new-tts.md) (NaiveNeuron warning)

## Acceptable changes (without user confirmation)

- **Adding** new STT providers / non-NaiveNeuron model IDs
- **Reordering** non-NaiveNeuron entries
- **Reformatting** the file (whitespace, imports) without touching ID strings
- **Documentation** changes around the IDs

## Unacceptable changes (require explicit user confirmation)

- **Renaming** any NaiveNeuron model ID
- **Reordering** NaiveNeuron entries (the test pins their position too)
- **Deleting** any NaiveNeuron model ID
- **Wrapping** NaiveNeuron IDs in a layer of abstraction that hides them

Even an autonomous AI agent must STOP and ASK before any of the above.

## Why this is a hard rule

1. **Legal**: CC-BY-4.0 attribution. Renaming = effectively un-crediting.
2. **Operational**: NaiveNeuron releases new revisions. Tracking which
 version we use requires the canonical ID being unchanged in source
 control.
3. **Reputation**: SORRYWECAN s.r.o. (the grant recipient) has a public
 association with this codebase via the grant ID `09I05-03-V04-00072`.
 License violations create reputational and legal risk.

## Pinned by

- [`tutor-service/tests/test_slopal_registry.py`](../../tutor-service/tests/test_slopal_registry.py) (6 tests):
 - 3 tests for verbatim ID match
 - 3 tests for baseline non-displacement (ordering)

## Related

- Hugging Face model cards for the cited NaiveNeuron repositories carry the canonical CC-BY-4.0 license texts and citation requirements.
