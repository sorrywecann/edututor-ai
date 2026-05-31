---
name: Feature request
about: Suggest a new capability for EduTutor.AI
title: 'feat: '
labels: ['enhancement', 'triage']
assignees: ''
---

## Summary

<!-- One sentence: what feature do you want? -->

## Problem

<!-- What user problem does this solve? Be specific. -->

## Proposed solution

<!-- High-level approach. Code-level detail not required yet. -->

## Anchor use case

<!--
EduTutor.AI's anchor use case is the Slovak voice tutor. The avatar is
the differentiator. New features should either:
  1. Improve the anchor (better tutoring, more natural avatar, etc.), OR
  2. Demonstrate the platform's range via a new LearningMode
     (assistant, researcher, code companion, mock interviewer)
Which is this?
-->

- [ ] Improves the anchor (Slovak voice tutor)
- [ ] Demonstrates platform range (new LearningMode)
- [ ] Infrastructure / developer experience
- [ ] Other:

## Affected component

- [ ] Backend API (`tutor-service/`)
- [ ] Frontend (`core/`)
- [ ] UE5 avatar bridge
- [ ] Skill platform — new skill?
- [ ] TTS / LLM / STT / RAG — new provider?
- [ ] New LearningMode (persona)
- [ ] Other:

## Invariants to preserve

<!--
Read AGENTS.md "Non-negotiable invariants". If your feature touches one,
flag it here.
-->

- [ ] UE5 protocol v2.1 — preserved
- [ ] NaiveNeuron HF IDs — unchanged
- [ ] Identity header path — preserved
- [ ] Asymmetric DI — preserved
- [ ] Dict-dispatch tables — preserved

## Acceptance criteria

<!-- How will we know this is done? Bullet list of testable behaviors. -->

1.
2.

## Alternatives considered

<!-- What other approaches did you think about? Why this one? -->

## Additional context

<!-- Sketches, references, related issues. -->
