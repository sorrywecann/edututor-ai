from dataclasses import dataclass, field
from typing import Optional
import json
import os

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")

# Editable system-prompt overrides. The original prompts/*.md files are NEVER
# modified; instead an override (set from Settings → Persona) is stored here
# and wins over the file in get_system_prompt(). Reverting just removes it.
_OVERRIDES_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "prompt_overrides.json")
)
_prompt_overrides: dict = {}


def _load_prompt(filename: str) -> str:
    path = os.path.join(PROMPTS_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_overrides() -> None:
    global _prompt_overrides
    try:
        with open(_OVERRIDES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _prompt_overrides = data if isinstance(data, dict) else {}
    except Exception:
        _prompt_overrides = {}


def _persist_overrides() -> None:
    os.makedirs(os.path.dirname(_OVERRIDES_PATH), exist_ok=True)
    with open(_OVERRIDES_PATH, "w", encoding="utf-8") as f:
        json.dump(_prompt_overrides, f, ensure_ascii=False, indent=2)


@dataclass
class LearningMode:
    id: str
    label: str                        # "Po slovensky", "In English"
    description: str                  # Short explainer for the picker
    ui_locale: str                    # "sk" | "en"
    stt_language: str                 # "sk" | "en" | "auto"
    tts_voice: str                    # default voice ID
    tts_provider: str                 # "edge" | "kokoro" | "omnivoice" | "piper" (chatterbox removed in b22c568)
    tutor_name: str                   # "Lukáš", "Alex"
    tutor_color: str                  # hex for avatar
    system_prompt_file: str           # filename in prompts/
    greeting_instruction: str         # what the LLM receives on __greeting__
    native_language: Optional[str] = None   # for bilingual modes (source lang)
    target_language: Optional[str] = None   # for bilingual modes (target lang)
    native_tts_voice: Optional[str] = None  # secondary voice for bilingual (native lang sentences)
    native_tts_provider: Optional[str] = None
    available_voices: list = field(default_factory=list)
    # Phase 6d: agent-platform extension. enabled_skills lists Skill.name
    # values from the SkillRegistry whose tools the LLM may call in this
    # mode. agent_type categorises the persona for UI display + future
    # avatar-animation differentiation. Defaults preserve the v0 tutor
    # behaviour: empty skill list (chat.py's tool loop bypasses entirely)
    # and "tutor" type. Existing modes load unchanged.
    enabled_skills: list = field(default_factory=list)
    agent_type: str = "tutor"  # "tutor" | "assistant" | "researcher" | "coach"


def _build_modes() -> dict:
    return {
        "deeptutor": LearningMode(
            id="deeptutor",
            label="Hĺbkový učiteľ",
            description="Sokratovský slovenský učiteľ — vedie študenta k odpovedi otázkami, pamätá si rozhovor",
            ui_locale="sk",
            stt_language="sk",
            tts_voice="sk-SK-LukasNeural",
            tts_provider="edge",
            tutor_name="Lukáš",
            tutor_color="#3b82f6",
            system_prompt_file="deeptutor.md",
            greeting_instruction=(
                "Začni konverzáciu vrelo a vzdelávacie — pýtaj sa "
                "čo by sa študent dnes chcel naučiť. Jedna veta."
            ),
            available_voices=[
                "sk-SK-LukasNeural",
                "sk-SK-ViktoriaNeural",
                "sk_SK-lili-medium",
            ],
            agent_type="tutor",
        ),
        "sk": LearningMode(
            id="sk",
            label="Po slovensky",
            description="Slovenský tutor, slovenský hlas",
            ui_locale="sk",
            stt_language="sk",
            tts_voice="sk-SK-LukasNeural",
            tts_provider="edge",
            tutor_name="Lukáš",
            tutor_color="#3b82f6",
            system_prompt_file="sk.md",
            greeting_instruction=(
                "Začni konverzáciu. Pozdrav študenta prirodzene a veľmi krátko — max jedna veta."
            ),
            available_voices=[
                "sk-SK-LukasNeural",
                "sk-SK-ViktoriaNeural",
                "sk_SK-lili-medium",
            ],
        ),
        "en": LearningMode(
            id="en",
            label="In English",
            description="English tutor, premium voice",
            ui_locale="en",
            stt_language="en",
            tts_voice="af_heart",
            tts_provider="kokoro",
            tutor_name="Alex",
            tutor_color="#10b981",
            system_prompt_file="en.md",
            greeting_instruction=(
                "Start the conversation. Greet the student naturally and very briefly — one sentence max."
            ),
            available_voices=[
                "af_heart",
                "af_bella",
                "am_michael",
                "am_adam",
                "af_sarah",
                "en-US-AriaNeural",
                "en-US-GuyNeural",
                "en-GB-SoniaNeural",
                "en-GB-RyanNeural",
            ],
        ),
        "learn-en-from-sk": LearningMode(
            id="learn-en-from-sk",
            label="Učím sa angličtinu",
            description="Vysvetlenia po slovensky, precvičuje angličtinu",
            ui_locale="sk",
            stt_language="auto",
            tts_voice="af_heart",           # English sentences → Kokoro
            tts_provider="kokoro",
            tutor_name="Alex",
            tutor_color="#f59e0b",
            system_prompt_file="learn-en-from-sk.md",
            greeting_instruction=(
                "Pozdrav študenta po slovensky v jednej vete a povedz mu, "
                "že dnes budete spolu precvičovať angličtinu."
            ),
            native_language="sk",
            target_language="en",
            native_tts_voice="sk-SK-LukasNeural",   # Slovak sentences → Edge
            native_tts_provider="edge",
            available_voices=["af_heart", "am_michael", "en-US-AriaNeural", "en-US-GuyNeural"],
        ),
        "assistant": LearningMode(
            id="assistant",
            label="Research assistant",
            description="General-purpose assistant with web search; bilingual",
            ui_locale="en",
            stt_language="auto",
            tts_voice="af_heart",
            tts_provider="kokoro",
            tutor_name="Aria",
            tutor_color="#8b5cf6",
            system_prompt_file="assistant.md",
            greeting_instruction=(
                "Greet the user briefly and offer to look something up online if they need current information."
            ),
            available_voices=["af_heart", "am_michael"],
            enabled_skills=["web_search"],
            agent_type="assistant",
        ),
        "tutor_practice": LearningMode(
            id="tutor_practice",
            label="Slovenský tréner (kartičky)",
            description="Slovenský lektor s FSRS kartičkami na opakovanie",
            ui_locale="sk",
            stt_language="sk",
            tts_voice="sk-SK-LukasNeural",
            tts_provider="edge",
            tutor_name="Lukáš",
            tutor_color="#06b6d4",
            system_prompt_file="tutor_practice.md",
            greeting_instruction=(
                "Pozdrav žiaka po slovensky v jednej vete a opýtaj sa, či chce pridať novú kartičku alebo opakovať tie, ktoré sú dnes na rade."
            ),
            available_voices=["sk-SK-LukasNeural", "sk-SK-ViktoriaNeural"],
            enabled_skills=["spaced_repetition"],
            agent_type="tutor",
        ),
        "assistant_pro": LearningMode(
            id="assistant_pro",
            label="Assistant Pro",
            description="Research assistant with web search and cross-session memory",
            ui_locale="en",
            stt_language="auto",
            tts_voice="af_heart",
            tts_provider="kokoro",
            tutor_name="Aria",
            tutor_color="#8b5cf6",
            system_prompt_file="assistant_pro.md",
            greeting_instruction=(
                "Greet the user briefly and offer to look something up online or recall something from past conversations if they need it."
            ),
            available_voices=["af_heart", "am_michael"],
            enabled_skills=["web_search", "memory"],
            agent_type="assistant",
        ),
        "tutor_practice_pro": LearningMode(
            id="tutor_practice_pro",
            label="Slovenský tréner Pro (kartičky + pamäť)",
            description="Slovenský lektor s FSRS kartičkami a pamäťou naprieč reláciami",
            ui_locale="sk",
            stt_language="sk",
            tts_voice="sk-SK-LukasNeural",
            tts_provider="edge",
            tutor_name="Lukáš",
            tutor_color="#06b6d4",
            system_prompt_file="tutor_practice_pro.md",
            greeting_instruction=(
                "Pozdrav žiaka po slovensky v jednej vete a opýtaj sa, či chce pridať novú kartičku, opakovať, alebo pokračovať tam, kde skončili minule."
            ),
            available_voices=["sk-SK-LukasNeural", "sk-SK-ViktoriaNeural"],
            enabled_skills=["spaced_repetition", "memory"],
            agent_type="tutor",
        ),
    }


_modes_cache: Optional[dict] = None
_prompts_cache: dict = {}


def get_all_modes() -> dict:
    global _modes_cache
    if _modes_cache is None:
        _modes_cache = _build_modes()
    return _modes_cache


def get_mode(mode_id: str) -> Optional[LearningMode]:
    return get_all_modes().get(mode_id)


def get_system_prompt(mode_id: str) -> str:
    # A saved override (from Settings → Persona) wins over the file.
    if mode_id in _prompt_overrides:
        return _prompt_overrides[mode_id]
    if mode_id not in _prompts_cache:
        mode = get_mode(mode_id) or get_mode("sk")
        _prompts_cache[mode_id] = _load_prompt(mode.system_prompt_file)
    return _prompts_cache[mode_id]


def get_default_prompt(mode_id: str) -> str:
    """The original prompt from disk, ignoring any override."""
    mode = get_mode(mode_id) or get_mode("sk")
    return _load_prompt(mode.system_prompt_file)


def has_prompt_override(mode_id: str) -> bool:
    return mode_id in _prompt_overrides


def set_prompt_override(mode_id: str, content: str) -> None:
    _prompt_overrides[mode_id] = content
    _persist_overrides()


def clear_prompt_override(mode_id: str) -> None:
    _prompt_overrides.pop(mode_id, None)
    _persist_overrides()


# Load any saved overrides at import so they apply from the first chat turn.
_load_overrides()


def get_default_mode() -> LearningMode:
    return get_all_modes()["deeptutor"]
