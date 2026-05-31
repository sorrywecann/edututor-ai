"""
EduTutor.AI — Knowledge Base API Full CRUD Tests

Covers every endpoint in knowledge_bases.py:
  - POST /knowledge-bases               (create)
  - GET  /knowledge-bases               (list)
  - GET  /knowledge-bases/{name}        (get one)
  - DELETE /knowledge-bases/{name}      (delete KB)
  - POST /knowledge-bases/{name}/documents   (upload)
  - GET  /knowledge-bases/{name}/documents   (list docs)
  - GET  /knowledge-bases/{name}/documents/{id}  (get doc)
  - DELETE /knowledge-bases/{name}/documents/{id} (delete doc)
  - GET  /knowledge-bases/{name}/query   (semantic search)
  - POST /knowledge-bases/{name}/query   (semantic search POST)

Each test generates a unique KB name so re-runs don't collide on shared SQLite.
"""
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("VECTOR_DB_BACKEND", "chroma")
os.environ.setdefault("STT_PROVIDER", "mock")

# CRUD tests run against SQLite alone and need no embedding model.
# Query/search tests embed via sentence_transformers, which (≥ v5) eagerly
# imports torchcodec → libtorchcodec_core (FFmpeg-bound). Mark only the
# embedding-dependent tests so the CRUD coverage stays green on machines
# without system FFmpeg.
def _embeddings_unavailable_reason() -> str | None:
    try:
        import sentence_transformers  # noqa: F401
        return None
    except (ImportError, OSError, RuntimeError) as err:
        return f"sentence-transformers stack unavailable ({err.__class__.__name__})"


_skip_without_embeddings = pytest.mark.skipif(
    _embeddings_unavailable_reason() is not None,
    reason=_embeddings_unavailable_reason() or "embeddings ok",
)


def _uid(prefix: str = "kb") -> str:
    """Unique KB name — avoids conflicts across test runs on shared SQLite."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _txt_file(content: str = "Test document content about topics.") -> bytes:
    return content.encode("utf-8")


# ---------------------------------------------------------------------------
# Knowledge base CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_kb_success():
    from app.main import app
    name = _uid("kb-crud")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post("/api/v1/knowledge-bases", json={
            "name": name,
            "description": "Created by test",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == name
    assert data["description"] == "Created by test"
    assert "id" in data
    assert data["document_count"] == 0


@pytest.mark.asyncio
async def test_create_duplicate_kb_returns_400():
    from app.main import app
    name = _uid("kb-dup")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.post("/api/v1/knowledge-bases", json={"name": name})
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_kb_success():
    from app.main import app
    name = _uid("kb-get")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.get(f"/api/v1/knowledge-bases/{name}")
    assert resp.status_code == 200
    assert resp.json()["name"] == name


@pytest.mark.asyncio
async def test_get_nonexistent_kb_returns_404():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/knowledge-bases/kb-does-not-exist-xyz-never")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_kbs_includes_created():
    from app.main import app
    name = _uid("kb-list")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.get("/api/v1/knowledge-bases")
    assert resp.status_code == 200
    names = [kb["name"] for kb in resp.json()]
    assert name in names


@pytest.mark.asyncio
async def test_delete_kb_success():
    from app.main import app
    name = _uid("kb-del")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.delete(f"/api/v1/knowledge-bases/{name}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.asyncio
async def test_delete_kb_then_get_returns_404():
    from app.main import app
    name = _uid("kb-del-check")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        await c.delete(f"/api/v1/knowledge-bases/{name}")
        resp = await c.get(f"/api/v1/knowledge-bases/{name}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Document upload
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_txt_document_accepted():
    from app.main import app
    name = _uid("kb-upload")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("test_doc.txt", _txt_file(), "text/plain")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "document_id" in data
    assert data["filename"] == "test_doc.txt"
    assert data["file_type"] == "txt"
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_upload_creates_kb_if_not_exists():
    """Auto-create KB if it doesn't exist on upload."""
    from app.main import app
    name = _uid("kb-autocreate")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("doc.txt", _txt_file(), "text/plain")},
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_upload_unsupported_type_returns_400():
    from app.main import app
    name = _uid("kb-badtype")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("doc.exe", b"binary content", "application/octet-stream")},
        )
    assert resp.status_code == 400
    assert "Unsupported" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_by_extension_when_content_type_generic():
    """If content-type is generic but extension is txt, should be accepted."""
    from app.main import app
    name = _uid("kb-ext")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("notes.txt", _txt_file(), "application/octet-stream")},
        )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_upload_md_file_accepted():
    from app.main import app
    name = _uid("kb-md")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("readme.md", b"# Title\nContent here.", "text/markdown")},
        )
    assert resp.status_code == 200
    assert resp.json()["file_type"] == "md"


# ---------------------------------------------------------------------------
# Document listing and retrieval
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_documents_in_kb():
    from app.main import app
    name = _uid("kb-listdocs")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("a.txt", _txt_file("doc A"), "text/plain")},
        )
        await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("b.txt", _txt_file("doc B"), "text/plain")},
        )
        resp = await c.get(f"/api/v1/knowledge-bases/{name}/documents")

    assert resp.status_code == 200
    docs = resp.json()
    assert isinstance(docs, list)
    assert len(docs) >= 2
    filenames = [d["filename"] for d in docs]
    assert "a.txt" in filenames
    assert "b.txt" in filenames


@pytest.mark.asyncio
async def test_get_document_returns_status():
    from app.main import app
    name = _uid("kb-getdoc")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        upload = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("check.txt", _txt_file(), "text/plain")},
        )
        doc_id = upload.json()["document_id"]
        resp = await c.get(f"/api/v1/knowledge-bases/{name}/documents/{doc_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == doc_id
    assert data["filename"] == "check.txt"
    assert data["status"] in ("pending", "processing", "completed", "failed")


@pytest.mark.asyncio
async def test_get_nonexistent_document_returns_404():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/knowledge-bases/kb-any/documents/doc-does-not-exist-xyz")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_document():
    from app.main import app
    name = _uid("kb-deldoc")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        upload = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("todel.txt", _txt_file(), "text/plain")},
        )
        doc_id = upload.json()["document_id"]
        resp = await c.delete(f"/api/v1/knowledge-bases/{name}/documents/{doc_id}")

    assert resp.status_code == 200
    assert resp.json()["document_id"] == doc_id


# ---------------------------------------------------------------------------
# Query endpoint (GET and POST)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_nonexistent_kb_returns_404():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        resp = await c.get("/api/v1/knowledge-bases/kb-no-exist-never-xyz/query?q=test")
    assert resp.status_code == 404


@pytest.mark.asyncio
@pytest.mark.skipif(not __import__("importlib").util.find_spec("chromadb"), reason="chromadb not installed")
@_skip_without_embeddings
async def test_query_existing_kb_returns_search_response():
    from app.main import app
    name = _uid("kb-query")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.get(
            f"/api/v1/knowledge-bases/{name}/query",
            params={"q": "test query", "top_k": 3, "threshold": 0.0},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert "query" in data
    assert "total_results" in data
    assert "search_time_ms" in data
    assert data["query"] == "test query"


@pytest.mark.asyncio
@pytest.mark.skipif(not __import__("importlib").util.find_spec("chromadb"), reason="chromadb not installed")
@_skip_without_embeddings
async def test_query_post_endpoint():
    from app.main import app
    name = _uid("kb-qpost")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        resp = await c.post(
            f"/api/v1/knowledge-bases/{name}/query",
            json={"query": "search this", "top_k": 5, "similarity_threshold": 0.3},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "search this"


@pytest.mark.asyncio
@pytest.mark.skipif(not __import__("importlib").util.find_spec("chromadb"), reason="chromadb not installed")
@_skip_without_embeddings
async def test_query_result_fields():
    """Each result must have content, score, metadata when content exists."""
    import asyncio
    from app.main import app
    name = _uid("kb-qfields")
    content = b"Chemia je veda o latke a jej vlastnostiach. Prvky su usporiadane v periodicke."
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("chem.txt", content, "text/plain")},
        )
        await asyncio.sleep(0.3)  # let background task process

        resp = await c.get(
            f"/api/v1/knowledge-bases/{name}/query",
            params={"q": "chemia prvky", "top_k": 3, "threshold": 0.0},
        )

    assert resp.status_code == 200
    results = resp.json()["results"]
    for r in results:
        assert "content" in r
        assert "score" in r
        assert "metadata" in r
        assert 0.0 <= r["score"] <= 1.0


@pytest.mark.asyncio
async def test_patch_document_context_mode_updates_document():
    from app.main import app

    name = _uid("kb-contextmode")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        await c.post("/api/v1/knowledge-bases", json={"name": name})
        upload = await c.post(
            f"/api/v1/knowledge-bases/{name}/documents",
            files={"file": ("mode.txt", _txt_file(), "text/plain")},
        )
        doc_id = upload.json()["document_id"]

        patch_resp = await c.patch(
            f"/api/v1/documents/{doc_id}",
            json={"context_mode": "off"},
        )
        get_resp = await c.get(f"/api/v1/knowledge-bases/{name}/documents/{doc_id}")

    assert patch_resp.status_code == 200
    assert patch_resp.json()["context_mode"] == "off"
    assert get_resp.status_code == 200
    assert get_resp.json()["context_mode"] == "off"


@pytest.mark.asyncio
@_skip_without_embeddings
async def test_chat_context_mode_filter_excludes_off_documents():
    from app.main import app

    name = _uid("kb-chatfilter")
    captured_document_ids = []

    mock_llm = MagicMock()
    mock_llm.provider = "mock"
    mock_llm.get_system_prompt.return_value = "System prompt"
    mock_llm.generate = AsyncMock(return_value="Filtrovaná odpoveď")

    async def capture_search_with_metadata(**kwargs):
        captured_document_ids.append(kwargs.get("document_ids"))
        return []

    mock_rag = MagicMock()
    mock_rag.is_ready.return_value = True
    mock_rag.search_with_metadata = AsyncMock(side_effect=capture_search_with_metadata)

    with patch("app.api.chat.get_llm_service", new=AsyncMock(return_value=mock_llm)), \
         patch("app.api.chat.get_rag_service", new=AsyncMock(return_value=mock_rag)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            await c.post("/api/v1/knowledge-bases", json={"name": name})
            first_upload = await c.post(
                f"/api/v1/knowledge-bases/{name}/documents",
                files={"file": ("one.txt", _txt_file("doc one"), "text/plain")},
            )
            second_upload = await c.post(
                f"/api/v1/knowledge-bases/{name}/documents",
                files={"file": ("two.txt", _txt_file("doc two"), "text/plain")},
            )

            first_doc_id = first_upload.json()["document_id"]
            second_doc_id = second_upload.json()["document_id"]

            await c.patch(
                f"/api/v1/documents/{second_doc_id}",
                json={"context_mode": "off"},
            )

            resp = await c.post(
                "/api/v1/chat",
                json={
                    "message": "Použi iba aktívne dokumenty",
                    "knowledge_base": name,
                },
            )

    assert resp.status_code == 200
    assert captured_document_ids
    assert captured_document_ids[0] == [first_doc_id]
