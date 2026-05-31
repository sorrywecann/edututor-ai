# Workflow: Add a New LearningMode

> Use the [`/edu-new-mode <name>`](../../.opencode/commands/edu-new-mode.md)
> slash command — this document is its long-form companion.

EduTutor.AI's anchor use case is the Slovak voice tutor. The roadmap
(personal assistant, research companion, code companion, mock
interviewer) all share the **same avatar spine** via different
`LearningMode` configs. Adding a new persona = adding a new mode, NOT a
separate codebase.

---

## Before you start

Read these:

1. [`tutor-service/app/config/learning_modes.py`](../../tutor-service/app/config/learning_modes.py) — read every existing mode end-to-end
2. [`tutor-service/app/config/prompts/`](../../tutor-service/app/config/prompts/) — system prompt files per mode
3. [`tutor-service/tests/test_learning_modes.py`](../../tutor-service/tests/test_learning_modes.py) — backwards-compat invariants

## Existing modes (DO NOT modify these)

| Mode | Tutor | Language | Skills | Pinned by |
|---|---|---|---|---|
| `sk` | Slovak tutor | sk | (none — empty) | test_learning_modes |
| `en` | English tutor | en | (none — empty) | test_learning_modes |
| `learn-en-from-sk` | EN-from-SK tutor | sk-en | (none — empty) | test_learning_modes |
| `default` | Default tutor | sk | (none — empty) | test_learning_modes |
| `assistant` | Web research assistant | en | `web_search` | (Phase 7) |
| `tutor_practice` | SR flashcard tutor | sk | `spaced_repetition` | (Phase 7) |

Adding a 7th mode for a new persona is the path. Modifying the first
four is a backwards-compat hard block.

## The 4 steps

### 1. System prompt file

Create `tutor-service/app/config/prompts/<mode-name>.md` with the
persona's full system prompt. Reference the Slovak tutor prompt for
structure if unsure.

A good system prompt covers:
- Identity (who am I?)
- Capabilities (what can I do?)
- Tone (how do I speak?)
- Constraints (what do I refuse?)
- Format (how do I respond?)

### 2. Mode config entry

In [`learning_modes.py`](../../tutor-service/app/config/learning_modes.py),
append a new `LearningMode` instance:

```python
LearningMode(
 id="<mode-name>",
 name="<UI-facing name>",
 description="<UI-facing description>",
 tutor_name="<Avatar name>",
 tutor_colour="<hex>", # pick one that doesn't collide with existing
 system_prompt_file="<mode-name>.md",
 tts_provider="<provider>",
 tts_voice_id="<voice>", # MUST exist in tts_config.TTS_VOICES
 stt_language="<lang>", # e.g. "sk", "en"
 enabled_skills=["<skill>"], # names of registered Skills, or []
 agent_type="<type>", # v6 field
)
```

Cross-check the `tts_voice_id` against `tts_config.TTS_VOICES` — if it
doesn't exist, the mode crashes at runtime.

Cross-check each `enabled_skills` entry against registered Skills in
`app/skills/startup.py` — startup validation logs a warning otherwise.

### 3. Test

In [`test_learning_modes.py`](../../tutor-service/tests/test_learning_modes.py),
append a test verifying:
- Mode loads without error
- Required fields are non-empty
- System prompt file exists
- Referenced voice and skills exist

Pattern from existing tests:

```python
def test_<mode_name>_mode_loads:
 """Pin: <mode-name> mode parses with all required fields and references valid voice/skills."""
 mode = MODES["<mode-name>"]
 assert mode.tts_voice_id in TTS_VOICES
 for skill_name in mode.enabled_skills:
 assert skill_name in REGISTERED_SKILL_NAMES # registry check
```

### 4. Verify

```bash
cd tutor-service && python -m pytest tests/test_learning_modes.py -v
python -m pytest tests/ -q # full suite
```

Baseline: 6 mode tests pass. After your change: 7.

## Hard constraints (recap)

- **NEVER** modify `sk`, `en`, `learn-en-from-sk`, `default` modes
- **TTS voice MUST exist** in `tts_config.TTS_VOICES`
- **Skills MUST be registered** in `app/skills/startup.py`
- **Tutor colour** picks must not collide with existing tutors (UI guideline)
- **System prompt file** lives in `app/config/prompts/`

## When done

Run [`/edu-pre-pr`](../../.opencode/commands/edu-pre-pr.md).
