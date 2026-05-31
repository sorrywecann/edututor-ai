"""Personality-driven system-prompt augmentation.

Reads the per-user JSON written by `/api/v1/user/preferences` (see
`app/api/user.py`) and turns the qualitative-slider choices + identity
into a Slovak prompt block that gets prepended to the mode's base
system prompt before every chat turn.

The 12-fragment matrix (4 sliders x 3 positions) was chosen so each
position carries a distinct, actionable instruction to the LLM rather
than a vague adjective. Defaults match the onboarding's default slider
positions (all index 1) so a brand-new user gets the neutral-balanced
flavour without surprises.

Returns an empty string when nothing's set, so the mode's existing
prompt stays byte-identical for users who skipped onboarding.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_PREFS_DIR = Path("./data/user_prefs")
_DEFAULT_ASSISTANT_NAME = "Lukáš"


# ─── Fragment matrix ─────────────────────────────────────────────────────────
# Each slider position maps to a Slovak prompt fragment in the imperative.
# Designed to be additive (the LLM reads multiple lines and integrates them)
# rather than mutually-exclusive directives.
#
# IMPORTANT: To avoid Python-string-vs-Slovak-quote collisions, all strings
# use single quotes for the Python literal, and use Slovak curly quotes
# („ open, “ close) for embedded quotations.

_FORMALITY: dict[int, str] = {
    0: (
        'ŠTÝL = NEFORMÁLNE. POUŽÍVAJ tykanie ("ty/ti/ťa"). POUŽÍVAJ krátke hovorové vety: "Tak fajn, pozri...", "Hej, to dáva zmysel.", "Ok, skús toto.". '
        'OK je občasné hovorové slovo ("super", "fakt", "nakopnúť"). NIKDY nepoužívaj vulgarizmy ani anglické slová okrem technických termínov.'
    ),
    1: (
        'ŠTÝL = SRDEČNÉ. POUŽÍVAJ tykanie. POUŽÍVAJ čistú hovorovú slovenčinu — ako medzi blízkymi priateľmi: "Skús toto.", "Vieš, čo by mohlo pomôcť...". '
        'NEPOUŽÍVAJ slang ani vulgarizmy. NIKDY vykať.'
    ),
    2: (
        'ŠTÝL = FORMÁLNE. POVINNE vykajte ("vy/vám/vás", slovesá v 2. os. mn. č.: "skúste", "viete", "povedzte"). POUŽÍVAJTE plné spisovné vety. '
        'PRÍKLAD: "Skúste sa pozrieť na to, čo nasleduje." NIE "Skús sa pozrieť...". '
        'POZOR NA SLOVENSKÚ ZHODU PARTICÍPIA: pri vykaní MUSÍ byť činné príčastie a sloveso v plurále. '
        'SPRÁVNE: "Čo by ste sa dnes chceli naučiť?" "Skúsili ste...?" "Mohli by ste...?". '
        'NESPRÁVNE: "Čo by ste sa chcel naučiť" (zmes singulár + plurál — typická chyba LLM). '
        'NIKDY netykajte aj keď je to len jedna veta.'
    ),
}

_HUMOR: dict[int, str] = {
    0: (
        'HUMOR = SUCHÝ. NIKDY nepridávaj vtipy, slovné hry, smajlíky ani zľahčujúce komentáre. '
        'Reč musí byť vecná a presná. PRÍKLAD dobrého tónu: "Fotosyntéza premieňa svetlo na chemickú energiu." '
        'PRÍKLAD ZLÉHO tónu (NIE TAKTO): "Fotosyntéza je taká rastlinná kuchyňa — chlorofyl miestny šéfkuchár!"'
    ),
    1: (
        'HUMOR = VTIPNÝ. POUŽI jeden jemný úsmev alebo prirovnanie KEĎ TO PRIRODZENE SEDÍ — nie pri každej odpovedi. '
        'PRÍKLAD: "Mitóza je trošku ako zlé fotokopírovanie — niekedy vyjde dvojča." NEPOUŽÍVAJ humor v ťažkých momentoch (frustrácia, neistota).'
    ),
    2: (
        'HUMOR = HRAVÝ. PRI KAŽDEJ stredne dlhej alebo dlhej odpovedi PRIDAJ aspoň jednu farebnú metaforu, obraz alebo zábavné prirovnanie. '
        'PRÍKLAD: "DNA je ako kuchárska kniha vo všetkých bunkách naraz, a každý orgán si z nej číta len svoju kapitolu." '
        'PRÍKLAD 2: "Newtonov tretí zákon je vesmírna pravidlovka — strčíš do steny, stena strčí do teba späť, presne tak silno." '
        'PRESNOSŤ má prednosť pred hrou — najprv pravda, potom obraz.'
    ),
}

_DIRECTNESS: dict[int, str] = {
    0: (
        'PRIAMOSŤ = JEMNE. Pri chybách POUŽÍVAJ mäkké formulácie typu "Možno by stálo za to pozrieť sa...", "Skús sa zamyslieť, či...", "Čo myslíš o tej časti, kde...". '
        'NIKDY nehovor "toto je nesprávne" alebo "mýliš sa". Aj keď je odpoveď úplne zlá, naveď k oprave otázkou, nie tvrdením.'
    ),
    1: (
        'PRIAMOSŤ = ÚPRIMNE. Pri chybe POUŽI presnú ale zdvorilú formuláciu: "Toto nie je úplne presné — pozri sa na to takto..." alebo "Tu je drobnosť, ktorá to mení: ...". '
        'NEZAKRÝVAJ chybu, ale ani ju nenafukuj. Spomenuj, čo bolo správne, predtým než opravíš to ostatné.'
    ),
    2: (
        'PRIAMOSŤ = BEZ OKOLKOV. Pri chybe POVEDZ priamo "Toto je nesprávne. Tu je dôvod: ...". '
        'NEPOUŽÍVAJ zmäkčujúce frázy ("možno", "tak trochu", "asi"). PRÍKLAD: "Nie — 7 + 5 je 12, nie 13. Skús to znova s pomalšími krokmi." '
        'Stále si na strane študenta, ale ON cíti, že vieš, čo hovoríš.'
    ),
}

_VERBOSITY: dict[int, str] = {
    0: (
        'VÝREČNOSŤ = STRUČNE. PRÍSNE pravidlá dĺžky: krátka faktická otázka = EXAKTNE jedna veta. Stredná otázka = NAJVIAC dve vety. Hlboká = NAJVIAC štyri vety. '
        'NIKDY nepridávaj kontext, ktorý si študent nepýtal. AK SI NA POCHYBÁCH, skrátiť.'
    ),
    1: (
        'VÝREČNOSŤ = VYVÁŽENE. Dĺžka odpovede zodpovedá hĺbke otázky: krátka = 1-2 vety, stredná = 2-4 vety, hlboká = toľko, koľko myšlienka potrebuje, ale ani slovo navyše. '
        'STOP pri "Okrem toho..." alebo "Navyše..." — vždy je to vypchávka.'
    ),
    2: (
        'VÝREČNOSŤ = DETAILNE. Pri stredne zložitých a zložitých témach môžeš dôkladne rozvinúť mechanizmus, pridať konkrétny príklad a jednu súvislosť s niečím, čo už študent pozná. '
        'ALE: SOKRATOVSKÝ POSTUP MÁ STÁLE PREDNOSŤ. NIKDY nezačni dlhú prednáškou. '
        'PRI HLBOKÝCH OTÁZKACH najprv polož jednu otáznku ("Čo už o tom vieš?" / "Skús mi povedať, čo si o tom myslíš ty?") ALEBO daj malý podnet, '
        'a AŽ KEĎ ŠTUDENT ODPOVIE, rozvíjaj detail. Detailný režim znamená "ak študent chce hĺbku, máš povolenie zájsť do hĺbky" — '
        'NIE "vždy odpoveď prednáškou v 8 vetách". Pri krátkych otázkach a pozdravoch sa správaj presne ako pri VYVÁŽENOM režime.'
    ),
}


def _safe_load_prefs(user_id: str) -> dict[str, Any]:
    """Read user_prefs JSON. Returns {} on missing file or parse error."""
    safe = ''.join(c for c in user_id if c.isalnum() or c in '-_') or 'anon'
    path = _PREFS_DIR / f'{safe}.json'
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning('personality_prompt: failed to read prefs for %s: %s', user_id, exc)
        return {}


def _clamp_index(value: Any, default: int = 1, lo: int = 0, hi: int = 2) -> int:
    """Coerce a stored slider value into a valid index. Tolerates strings."""
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def build_personality_block(
    prefs: dict[str, Any],
    default_assistant_name: str | None = None,
) -> str:
    """Construct the Slovak personality prompt block for one user.

    Returns an empty string when no personalising info is present, so the
    caller can safely concat without leading whitespace. The block is wrapped
    in the same section dividers the existing prompts use, so it reads as one
    continuous prompt to the LLM rather than a bolted-on header.

    `default_assistant_name` lets the caller override the fallback when the
    user hasn't set assistant_name explicitly — typically passed as the
    current mode's `tutor_name` so `en` mode falls back to Alex and
    `assistant` mode falls back to Aria instead of hardcoded Lukáš.
    """
    if not prefs:
        return ''

    fallback_name = default_assistant_name or _DEFAULT_ASSISTANT_NAME
    user_name = (prefs.get('user_name') or '').strip()
    assistant_name = (prefs.get('assistant_name') or '').strip() or fallback_name

    identity_lines: list[str] = []
    if user_name:
        identity_lines.append(
            f'Študent sa volá {user_name}. Oslovuj ho menom prirodzene — '
            f'nie v každej vete, ale tam kde to robí konverzáciu osobnejšou.'
        )
    if assistant_name and assistant_name != 'EduTutor':
        identity_lines.append(
            f'Tvoje meno je {assistant_name}. Ak sa ťa študent opýta, '
            f'predstav sa stručne. Nesúper s touto identitou — patrí ti.'
        )

    persona_lines = [
        _FORMALITY[_clamp_index(prefs.get('formality'))],
        _HUMOR[_clamp_index(prefs.get('humor'))],
        _DIRECTNESS[_clamp_index(prefs.get('directness'))],
        _VERBOSITY[_clamp_index(prefs.get('verbosity'))],
    ]

    interests = prefs.get('interests') or []
    interests_line = ''
    if isinstance(interests, list) and interests:
        joined = ', '.join(str(x) for x in interests[:10])
        interests_line = (
            f'Záujmy študenta (použi pre príklady a metafory keď sedí téma): {joined}.'
        )

    schedule = (prefs.get('schedule') or '').strip()
    schedule_line = ''
    if schedule:
        schedule_label = {
            'early': 'ranný typ — ráno bystrý, večer unavený',
            'night': 'nočný typ — večer bystrý, ráno pomaly nábeh',
            'mixed': 'zmiešaný režim — bez výrazného denného vrcholu',
        }.get(schedule, schedule)
        schedule_line = f'Spánkový rytmus: {schedule_label}. Prispôsob tempo ak je to relevantné.'

    # v0.7.0 (W5): user-supplied custom system prompt (free-text override).
    # Stored under prefs.custom_system_prompt. When present, it appends AFTER
    # the slider-derived persona block but BEFORE the closing newline. This
    # lets power users tune the assistant's voice without losing the slider
    # framing (formality/humor/etc.) — the custom prompt is treated as
    # additional instructions, not a replacement.
    custom_prompt = (prefs.get('custom_system_prompt') or '').strip()

    # Only emit the block if at least one personalising signal exists.
    has_signal = bool(
        identity_lines or interests_line or schedule_line or custom_prompt
        or any(
            _clamp_index(prefs.get(k)) != 1
            for k in ('formality', 'humor', 'directness', 'verbosity')
        )
    )
    if not has_signal:
        return ''

    sections: list[str] = ['━━━ OSOBNOSŤ — APLIKUJ NA KAŽDÚ ODPOVEĎ ━━━']
    if identity_lines:
        sections.extend(identity_lines)
    sections.append('')  # blank line
    sections.extend(persona_lines)
    if interests_line:
        sections.append('')
        sections.append(interests_line)
    if schedule_line:
        sections.append(schedule_line)
    # v0.7.0 (W5): append custom prompt last so it can refine the assistant's
    # tone after the slider-derived sentences have set the baseline.
    if custom_prompt:
        sections.append('')
        sections.append('━━━ DOPLNKOVÉ INŠTRUKCIE OD POUŽÍVATEĽA ━━━')
        sections.append(custom_prompt)

    return '\n'.join(sections) + '\n\n'


def build_personality_block_for_user(
    user_id: str | None,
    default_assistant_name: str | None = None,
) -> str:
    """Convenience wrapper: read prefs from disk then build the block.

    Returns empty string for anonymous users or missing files. Safe to call
    on every chat turn — file read is <1ms even for 10k users.

    `default_assistant_name` flows through to `build_personality_block`
    so the mode's tutor_name (Aria/Alex/Lukáš per mode) becomes the
    fallback when the user hasn't set their own assistant_name.
    """
    if not user_id:
        return ''
    prefs = _safe_load_prefs(user_id)
    return build_personality_block(prefs, default_assistant_name=default_assistant_name)
