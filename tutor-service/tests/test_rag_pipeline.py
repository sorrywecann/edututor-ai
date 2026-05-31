"""
EduTutor.AI — RAG Pipeline Integration Tests

Tests the full ChromaDB RAG pipeline with real Slovak educational content:
  1. Document ingestion (text, multiple topics)
  2. Semantic search — Slovak queries return correct topic chunks
  3. Cross-topic isolation — physics query doesn't return history chunks
  4. Similarity scoring and threshold filtering
  5. Document deletion and collection cleanup

Uses a temporary ChromaDB directory — does NOT touch ./data/chroma.
"""
import os
import pytest
import pytest_asyncio
import tempfile
from pathlib import Path

pytest.importorskip("chromadb", reason="chromadb not installed — skipping RAG pipeline tests")
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


# ---------------------------------------------------------------------------
# Fixture: isolated ChromaDB for each test session
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="module")
async def rag(tmp_path_factory):
    """Spin up a fresh ChromaDB in a temp dir, yield initialized service."""
    tmp = tmp_path_factory.mktemp("chroma_test")
    os.environ["CHROMA_PERSIST_PATH"] = str(tmp)

    # Re-import after env override so CHROMA_PERSIST_PATH is picked up
    import importlib
    import app.services.chroma_rag_service as m
    importlib.reload(m)

    svc = m.ChromaRAGService()
    await svc.initialize()
    yield svc
    await svc.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def ingest_fixture(rag, filename: str, kb: str, doc_id: str):
    content = (FIXTURES / filename).read_bytes()
    return await rag.process_document(
        content=content,
        filename=filename,
        file_type="txt",
        knowledge_base=kb,
        document_id=doc_id,
    )


# ---------------------------------------------------------------------------
# Ingestion tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ingest_math_document(rag):
    result = await ingest_fixture(rag, "matematika_algebra.txt", "matematika", "math-001")
    assert result["chunk_count"] > 0
    assert result["token_count"] > 0


@pytest.mark.asyncio
async def test_ingest_history_document(rag):
    result = await ingest_fixture(rag, "historia_slovenska.txt", "historia", "hist-001")
    assert result["chunk_count"] > 0


@pytest.mark.asyncio
async def test_ingest_physics_document(rag):
    result = await ingest_fixture(rag, "fyzika_mechanika.txt", "fyzika", "phys-001")
    assert result["chunk_count"] > 0


# ---------------------------------------------------------------------------
# Semantic search — correct topic retrieval
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_math_quadratic_equation(rag):
    """Query about quadratic equations should return algebra content."""
    await ingest_fixture(rag, "matematika_algebra.txt", "matematika", "math-001")

    results = await rag.search(
        query="Ako riešiť kvadratickú rovnicu?",
        knowledge_base="matematika",
        top_k=3,
        similarity_threshold=0.0,  # low threshold — we care about ranking
    )
    assert results, "Expected at least one result"
    top = results[0]["content"]
    # The top result should mention quadratic formula or discriminant
    assert any(kw in top for kw in ["kvadrat", "diskriminant", "rovnic", "ax²", "x²"]), \
        f"Top result doesn't mention quadratic equations: {top[:200]}"


@pytest.mark.asyncio
async def test_search_history_velka_morava(rag):
    """Query about Veľká Morava should return history content."""
    await ingest_fixture(rag, "historia_slovenska.txt", "historia", "hist-001")

    results = await rag.search(
        query="Kto bol Cyril a Metod a čo priniesli na Slovensko?",
        knowledge_base="historia",
        top_k=3,
        similarity_threshold=0.0,
    )
    assert results, "Expected history results"
    combined = " ".join(r["content"] for r in results)
    assert "Cyril" in combined or "Metod" in combined or "hlaholik" in combined.lower(), \
        "Results don't mention Cyril/Metod"


@pytest.mark.asyncio
async def test_search_history_stur(rag):
    """Query about Štúr should return relevant history chunk."""
    await ingest_fixture(rag, "historia_slovenska.txt", "historia", "hist-001")

    results = await rag.search(
        query="Kto kodifikoval spisovnú slovenčinu?",
        knowledge_base="historia",
        top_k=3,
        similarity_threshold=0.0,
    )
    combined = " ".join(r["content"] for r in results)
    assert "Štúr" in combined or "Bernolák" in combined or "slovenčin" in combined.lower()


@pytest.mark.asyncio
async def test_search_physics_newton_laws(rag):
    """Query about Newton's laws should return physics content."""
    await ingest_fixture(rag, "fyzika_mechanika.txt", "fyzika", "phys-001")

    results = await rag.search(
        query="Aké sú Newtonove pohybové zákony?",
        knowledge_base="fyzika",
        top_k=3,
        similarity_threshold=0.0,
    )
    assert results
    combined = " ".join(r["content"] for r in results)
    assert "Newton" in combined or "zákon" in combined.lower() or "sila" in combined.lower()


@pytest.mark.asyncio
async def test_search_physics_kinetic_energy(rag):
    """Query about energy should return the energy section."""
    await ingest_fixture(rag, "fyzika_mechanika.txt", "fyzika", "phys-001")

    results = await rag.search(
        query="Čo je kinetická energia a ako sa vypočíta?",
        knowledge_base="fyzika",
        top_k=3,
        similarity_threshold=0.0,
    )
    combined = " ".join(r["content"] for r in results)
    assert "kinetick" in combined.lower() or "energia" in combined.lower() or "½" in combined


# ---------------------------------------------------------------------------
# Cross-topic isolation — wrong KB returns nothing useful
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_physics_query_does_not_return_history(rag):
    """Searching physics KB for a history query should score low / below threshold."""
    await ingest_fixture(rag, "fyzika_mechanika.txt", "fyzika", "phys-001")

    results = await rag.search(
        query="Kto bol prvý prezident Československej republiky?",
        knowledge_base="fyzika",
        top_k=3,
        similarity_threshold=0.4,  # real threshold — low-relevance chunks filtered out
    )
    # Either empty or the content shouldn't mention Masaryk/Czechoslovakia
    for r in results:
        assert "Masaryk" not in r["content"]
        assert "Československ" not in r["content"]


# ---------------------------------------------------------------------------
# Result metadata
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_results_have_required_fields(rag):
    await ingest_fixture(rag, "matematika_algebra.txt", "matematika", "math-001")

    results = await rag.search("lineárna rovnica", "matematika", top_k=2, similarity_threshold=0.0)
    assert results
    for r in results:
        assert "content" in r
        assert "score" in r
        assert "metadata" in r
        assert "source" in r["metadata"]
        assert "document_id" in r["metadata"]
        assert 0.0 <= r["score"] <= 1.0


@pytest.mark.asyncio
async def test_scores_are_ordered_descending(rag):
    await ingest_fixture(rag, "matematika_algebra.txt", "matematika", "math-001")

    results = await rag.search("kvadratická rovnica diskriminant", "matematika",
                               top_k=5, similarity_threshold=0.0)
    if len(results) >= 2:
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True), "Results should be sorted by score descending"


# ---------------------------------------------------------------------------
# Empty collection edge case
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_empty_collection_returns_empty(rag):
    results = await rag.search("anything", "empty-kb-xyz", top_k=5, similarity_threshold=0.0)
    assert results == []


# ---------------------------------------------------------------------------
# Delete document
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_document_removes_its_chunks(rag):
    content = (FIXTURES / "fyzika_mechanika.txt").read_bytes()
    await rag.process_document(
        content=content, filename="fyzika_mechanika.txt", file_type="txt",
        knowledge_base="fyzika-del-test", document_id="phys-del-001",
    )

    # Should find results before delete
    before = await rag.search("Newton sila zrýchlenie", "fyzika-del-test",
                               top_k=3, similarity_threshold=0.0)
    assert before

    deleted = await rag.delete_document("phys-del-001", "fyzika-del-test")
    assert deleted > 0

    after = await rag.search("Newton sila zrýchlenie", "fyzika-del-test",
                              top_k=3, similarity_threshold=0.0)
    assert after == []
