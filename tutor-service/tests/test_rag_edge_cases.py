"""
EduTutor.AI — RAG Edge Case Tests

Covers edge cases not in the main pipeline tests:
  - Multi-document KB: both docs searchable, correct source metadata
  - Duplicate upsert: same doc_id, updated content replaces old
  - Similarity threshold filtering: 0.0 vs 1.0 vs mid-range
  - Large document with many chunks
  - Slovak diacritics and special chars in documents
  - KB name sanitization edge cases
  - _safe_name: spaces, long names, special chars, short names
"""
import os
import pytest
import pytest_asyncio
from pathlib import Path

pytest.importorskip("chromadb", reason="chromadb not installed — skipping RAG edge case tests")
# sentence_transformers ≥ 5 eagerly imports torchcodec which requires
# libtorchcodec_core (FFmpeg-bound). Skip on machines lacking system FFmpeg.
try:
    import sentence_transformers  # noqa: F401
except (ImportError, OSError, RuntimeError) as _st_err:
    pytest.skip(
        f"sentence-transformers stack unavailable ({_st_err.__class__.__name__}): {_st_err}",
        allow_module_level=True,
    )

FIXTURES = Path(__file__).parent / "fixtures"


@pytest_asyncio.fixture(scope="module")
async def rag(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("chroma_edge_test")
    os.environ["CHROMA_PERSIST_PATH"] = str(tmp)

    import importlib
    import app.services.chroma_rag_service as m
    importlib.reload(m)

    svc = m.ChromaRAGService()
    await svc.initialize()
    yield svc
    await svc.close()


# ---------------------------------------------------------------------------
# _safe_name validation
# ---------------------------------------------------------------------------

def test_safe_name_normal():
    from app.services.chroma_rag_service import _safe_name
    assert _safe_name("my-kb") == "my-kb"


def test_safe_name_spaces_replaced():
    from app.services.chroma_rag_service import _safe_name
    result = _safe_name("my knowledge base")
    assert " " not in result


def test_safe_name_special_chars_replaced():
    from app.services.chroma_rag_service import _safe_name
    result = _safe_name("KB/Test!@#$")
    assert all(c.isalnum() or c in "-_" for c in result)


def test_safe_name_truncated_to_63():
    from app.services.chroma_rag_service import _safe_name
    long_name = "a" * 100
    assert len(_safe_name(long_name)) <= 63


def test_safe_name_minimum_3_chars():
    from app.services.chroma_rag_service import _safe_name
    assert len(_safe_name("ab")) >= 3
    assert len(_safe_name("a")) >= 3
    assert len(_safe_name("")) >= 3


def test_safe_name_starts_with_alphanumeric():
    from app.services.chroma_rag_service import _safe_name
    result = _safe_name("_leading-underscore")
    assert result[0].isalnum()


def test_safe_name_slovak_name():
    from app.services.chroma_rag_service import _safe_name
    result = _safe_name("slovenčina-test")  # č is not alphanumeric
    assert all(c.isalnum() or c in "-_" for c in result)


# ---------------------------------------------------------------------------
# Multi-document KB
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_two_documents_both_searchable(rag):
    """Two documents in same KB — queries retrieve from both."""
    kb = "multi-doc-test"

    await rag.process_document(
        content=b"Albert Einstein formuloval teoriu relativity v roku 1905.",
        filename="einstein.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-einstein",
    )
    await rag.process_document(
        content=b"Isaac Newton objavil gravitaciu v 17. storoci.",
        filename="newton.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-newton",
    )

    results_e = await rag.search("Einstein relativita", kb, top_k=5, similarity_threshold=0.0)
    results_n = await rag.search("Newton gravitacia", kb, top_k=5, similarity_threshold=0.0)

    sources_e = [r["metadata"]["source"] for r in results_e]
    sources_n = [r["metadata"]["source"] for r in results_n]

    assert any("einstein" in s for s in sources_e), "Einstein doc not found in einstein query"
    assert any("newton" in s for s in sources_n), "Newton doc not found in newton query"


@pytest.mark.asyncio
async def test_source_metadata_matches_filename(rag):
    kb = "source-meta-test"
    await rag.process_document(
        content="Pythagorova veta: a² + b² = c²".encode("utf-8"),
        filename="pytagoras.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-pyth",
    )
    results = await rag.search("Pythagorova veta", kb, top_k=1, similarity_threshold=0.0)
    assert results
    assert results[0]["metadata"]["source"] == "pytagoras.txt"


@pytest.mark.asyncio
async def test_document_id_in_metadata(rag):
    kb = "docid-test"
    await rag.process_document(
        content=b"Molekulova biologia skuma strukturu DNA.",
        filename="bio.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-bio-001",
    )
    results = await rag.search("DNA struktura", kb, top_k=1, similarity_threshold=0.0)
    assert results
    assert results[0]["metadata"]["document_id"] == "doc-bio-001"


# ---------------------------------------------------------------------------
# Duplicate upsert — same doc_id, content replaced
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_duplicate_upsert_replaces_content(rag):
    kb = "upsert-test"

    # First version
    await rag.process_document(
        content=b"Original: Zem je tretia planeta od Slnka.",
        filename="planets.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-planet-001",
    )
    r1 = await rag.search("tretia planeta", kb, top_k=1, similarity_threshold=0.0)
    assert r1

    # Replace with new content same doc_id
    await rag.process_document(
        content="Updated: Mars je štvrtá planeta od Slnka.".encode("utf-8"),
        filename="planets.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-planet-001",
    )
    r2 = await rag.search("Mars štvrtá planeta", kb, top_k=1, similarity_threshold=0.0)
    assert r2
    assert "Mars" in r2[0]["content"]


# ---------------------------------------------------------------------------
# Similarity threshold edge cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_threshold_zero_always_returns_results(rag):
    kb = "threshold-test"
    await rag.process_document(
        content="Kyslík je chemický prvok so symbolom O a atómovým číslom 8.".encode("utf-8"),
        filename="chem.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-chem-001",
    )
    # threshold=0.0 should always return something if collection is non-empty
    results = await rag.search("čokoľvek hocičo", kb, top_k=5, similarity_threshold=0.0)
    assert len(results) > 0


@pytest.mark.asyncio
async def test_threshold_one_returns_nothing(rag):
    kb = "threshold-test"
    # threshold=1.0 = only perfect cosine match (practically impossible)
    results = await rag.search("Kyslík", kb, top_k=5, similarity_threshold=1.0)
    assert results == []


@pytest.mark.asyncio
async def test_threshold_filters_low_score_results(rag):
    kb = "threshold-test"
    low = await rag.search("kyslík", kb, top_k=5, similarity_threshold=0.0)
    high = await rag.search("kyslík", kb, top_k=5, similarity_threshold=0.8)
    # High threshold should return fewer or equal results
    assert len(high) <= len(low)
    for r in high:
        assert r["score"] >= 0.8


# ---------------------------------------------------------------------------
# Slovak diacritics in documents
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_slovak_diacritics_in_document_and_query(rag):
    kb = "diacritics-test"
    content = (
        "Ľudovít Štúr kodifikoval spisovnú slovenčinu v roku 1843. "
        "Napísal dielo Náuka reči slovenskej. "
        "Štúrova generácia zahŕňa básnikov ako Janko Kráľ."
    ).encode("utf-8")

    await rag.process_document(
        content=content, filename="stur.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-stur",
    )
    results = await rag.search("Ľudovít Štúr slovenčina", kb, top_k=3, similarity_threshold=0.0)
    assert results
    combined = " ".join(r["content"] for r in results)
    assert "Štúr" in combined or "slovenčin" in combined.lower()


# ---------------------------------------------------------------------------
# Large document
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_large_document_all_chunks_indexed(rag):
    kb = "large-doc-test"

    # Generate a ~50KB text document (enough for many chunks at 500-token chunk size)
    section = (
        "Matematika je veda, ktorá sa zaoberá číslami, množinami, štruktúrami a zmenami. "
        "Základné oblasti matematiky zahŕňajú aritmetiku, algebru, geometriu a analýzu. "
    )
    large_content = (section * 300).encode("utf-8")

    result = await rag.process_document(
        content=large_content, filename="large_math.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-large-001",
    )
    # Should have created multiple chunks
    assert result["chunk_count"] > 1
    assert result["token_count"] > 100

    # Should be searchable
    results = await rag.search("matematika čísla algebra", kb, top_k=3, similarity_threshold=0.0)
    assert results


# ---------------------------------------------------------------------------
# Score values
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scores_always_between_0_and_1(rag):
    kb = "score-range-test"
    await rag.process_document(
        content=b"Fyzika je prirodna veda. Studiuje hmotu, energiu a ich vztahy.",
        filename="fyzika.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-fyz",
    )
    results = await rag.search("fyzika hmota energia", kb, top_k=5, similarity_threshold=0.0)
    for r in results:
        assert 0.0 <= r["score"] <= 1.0, f"Score out of range: {r['score']}"


@pytest.mark.asyncio
async def test_relevant_query_scores_higher_than_irrelevant(rag):
    kb = "relevance-test"
    await rag.process_document(
        content=b"Fotosynteza je biochemicky proces v rastlinach. Premena svetla na energiu.",
        filename="bio.txt", file_type="txt",
        knowledge_base=kb, document_id="doc-foto",
    )
    relevant = await rag.search("fotosynteza rastliny svetlo", kb, top_k=1, similarity_threshold=0.0)
    irrelevant = await rag.search("stredoveke zamky", kb, top_k=1, similarity_threshold=0.0)

    if relevant and irrelevant:
        assert relevant[0]["score"] > irrelevant[0]["score"]
