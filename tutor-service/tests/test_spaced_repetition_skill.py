"""Pin SpacedRepetitionSkill's 3-tool public shape — add_card, review_card,
due_cards. FSRS scheduling correctness + SQLite persistence are pinned in
Task 10's regression tests; this test file pins ONLY the public surface
the LLM sees in the tool-use addendum.

Historical context: Phase 7 ships the second concrete Skill (alongside
WebSearchSkill) to prove the platform spine handles BOTH stateless network
skills and stateful DB-backed skills. The same Phase 6 tool-call loop
dispatches both — no per-skill special casing in chat.py.
"""
import pytest
from app.skills.base import Skill, ToolDef


def test_skill_metadata():
    """name + description visible to the LLM and to LearningMode.enabled_skills.
    Name must be stable — it's how tutor_practice mode opts in."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()
    assert isinstance(skill, Skill)
    assert skill.name == "spaced_repetition"
    assert skill.description


def test_three_tools_exposed():
    """Phase 7 ships exactly 3 tools — add_card (create), review_card (rate
    after answering), due_cards (fetch ready-for-review). Decks/categories/
    import-export are deliberately Phase 8."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    tools = SpacedRepetitionSkill().tools()
    names = {t.name for t in tools}
    assert names == {"add_card", "review_card", "due_cards"}


def test_add_card_schema():
    """add_card requires front + back strings (the flashcard contents).
    Both required because an empty side defeats the purpose of retrieval practice."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    tools = {t.name: t for t in SpacedRepetitionSkill().tools()}
    add = tools["add_card"]
    props = add.parameters["properties"]
    assert "front" in props and props["front"]["type"] == "string"
    assert "back" in props and props["back"]["type"] == "string"
    assert set(add.parameters["required"]) == {"front", "back"}


def test_review_card_schema():
    """review_card requires card_id (int) + rating (one of again/hard/good/easy
    — the four FSRS rating levels). Other rating strings are rejected by the
    handler and returned as recoverable error strings, not exceptions."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    tools = {t.name: t for t in SpacedRepetitionSkill().tools()}
    rev = tools["review_card"]
    props = rev.parameters["properties"]
    assert props["card_id"]["type"] == "integer"
    assert props["rating"]["type"] == "string"
    assert set(props["rating"]["enum"]) == {"again", "hard", "good", "easy"}
    assert set(rev.parameters["required"]) == {"card_id", "rating"}


def test_due_cards_schema():
    """due_cards has only an optional limit param; required is empty so the
    LLM can call due_cards() with no arguments to get the default page size."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    tools = {t.name: t for t in SpacedRepetitionSkill().tools()}
    due = tools["due_cards"]
    props = due.parameters["properties"]
    assert props["limit"]["type"] == "integer"
    assert due.parameters.get("required", []) == []


import pytest_asyncio


@pytest_asyncio.fixture
async def isolated_db():
    """Reuses the project's AsyncSessionLocal but truncates the flashcards
    table around each test so rows don't leak between cases.

    Re-importing app.database against a temp SQLite path doesn't work because
    SQLAlchemy's Base.metadata is a process-singleton — Flashcard registers
    itself on the first import and re-registration raises InvalidRequestError.
    Truncate-and-yield is the simpler isolation guarantee here, and matches
    what the rest of the test suite does for the existing tables.
    """
    from app.database import create_tables, AsyncSessionLocal
    from app.models.flashcard import Flashcard
    from sqlalchemy import delete

    await create_tables()

    async with AsyncSessionLocal() as session:
        await session.execute(delete(Flashcard))
        await session.commit()

    yield

    async with AsyncSessionLocal() as session:
        await session.execute(delete(Flashcard))
        await session.commit()


@pytest.mark.asyncio
async def test_add_card_persists_and_returns_id(isolated_db):
    """add_card writes a Flashcard row and returns a human-parseable id token
    in the response string ('Card #N added...'). The LLM uses the id for
    follow-up review_card calls."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()
    result = await skill._handle_add(front="mačka", back="cat")
    assert "added" in result.lower()
    assert "#" in result


@pytest.mark.asyncio
async def test_review_good_advances_due_date(isolated_db):
    """Good rating MUST move card.due into the future. Pins the FSRS contract:
    a freshly-created Card has due=now; a Good review pushes due to a later
    timestamp. If this test fails, FSRS isn't actually scheduling — it's just
    a no-op DB update."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    from app.skills.spaced_repetition import store
    skill = SpacedRepetitionSkill()

    add_msg = await skill._handle_add(front="dom", back="house")
    card_id = int(add_msg.split("#")[1].split(" ")[0])

    before = await store.get_card(user_id="default", card_id=card_id)
    assert before is not None
    rev_msg = await skill._handle_review(card_id=card_id, rating="good")
    after = await store.get_card(user_id="default", card_id=card_id)

    assert "Next due" in rev_msg
    assert after is not None
    assert after.due_at > before.due_at, (
        f"due_at not advanced: before={before.due_at}, after={after.due_at}"
    )


@pytest.mark.asyncio
async def test_review_again_response_contains_next_due(isolated_db):
    """Again rating runs the FSRS scheduler — response must include the new
    due timestamp so the LLM can mention it to the learner."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()

    add_msg = await skill._handle_add(front="x", back="y")
    card_id = int(add_msg.split("#")[1].split(" ")[0])
    rev_msg = await skill._handle_review(card_id=card_id, rating="again")
    assert "Next due" in rev_msg


@pytest.mark.asyncio
async def test_due_cards_returns_immediately_due_card(isolated_db):
    """A freshly-added card is immediately due — due_cards must list it.
    Pins the LLM-visible contract: 'add a card and the very next due_cards
    call shows it' is the canonical first-session flow."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()
    await skill._handle_add(front="kniha", back="book")
    result = await skill._handle_due(limit=10)
    assert "kniha" in result
    assert "book" in result


@pytest.mark.asyncio
async def test_review_unknown_card_id_returns_error(isolated_db):
    """Unknown card_id MUST NOT raise — handler returns a string the LLM can
    react to (e.g. apologize, ask the learner to re-add the card). Raising
    would crash chat handler and surface a 500 to the user."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()
    result = await skill._handle_review(card_id=99999, rating="good")
    assert "not found" in result.lower() or "error" in result.lower()


@pytest.mark.asyncio
async def test_review_invalid_rating_returns_error(isolated_db):
    """Invalid rating MUST NOT raise — handler returns a string explaining
    the four valid values. Even though the JSON schema enum SHOULD prevent
    this, LLMs occasionally violate the schema."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()
    add_msg = await skill._handle_add(front="x", back="y")
    card_id = int(add_msg.split("#")[1].split(" ")[0])
    result = await skill._handle_review(card_id=card_id, rating="invalid")
    assert "invalid" in result.lower()


@pytest.mark.asyncio
async def test_due_cards_empty_message_when_no_due(isolated_db):
    """Empty deck → friendly 'no cards due' message rather than empty string.
    LLM uses this to congratulate the learner instead of looking confused."""
    from app.skills.spaced_repetition.skill import SpacedRepetitionSkill
    skill = SpacedRepetitionSkill()
    result = await skill._handle_due(limit=10)
    assert "no cards" in result.lower() or "due" in result.lower()
