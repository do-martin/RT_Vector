import asyncio
import hashlib
import json
import os
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import StreamingResponse

import db
import embeddings

router = APIRouter()

_OVERLAP_CHARS = 150  # chars from each neighbour used as contextual prefix/suffix


def _sse(stage: str, message: str, progress: int, elapsed: float, **extra) -> str:
    data = {
        "stage": stage,
        "message": message,
        "progress": progress,
        "elapsed": round(elapsed, 1),
        **extra,
    }
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _contextual_texts(chunk_texts: list[str]) -> list[str]:
    """
    Build embedding texts with neighbour overlap.
    For each chunk, prepend the last _OVERLAP_CHARS of the previous chunk and
    append the first _OVERLAP_CHARS of the next chunk. The original text is
    stored in the DB; only these augmented texts are embedded.
    """
    out = []
    for i, text in enumerate(chunk_texts):
        prefix = chunk_texts[i - 1][-_OVERLAP_CHARS:] + "\n" if i > 0 else ""
        suffix = "\n" + chunk_texts[i + 1][:_OVERLAP_CHARS] if i < len(chunk_texts) - 1 else ""
        out.append(prefix + text + suffix)
    return out


@router.post("/ingest")
async def ingest_doc(request: Request, file: UploadFile = File(...)):
    contents = await file.read()
    filename = file.filename or "unknown"
    content_hash = hashlib.md5(contents).hexdigest()
    size_mb = len(contents) / 1024 / 1024
    suffix = Path(filename).suffix or ".pdf"

    converter = request.app.state.converter
    chunker = request.app.state.chunker
    pool = request.app.state.db_pool

    async def generate():
        start = time.monotonic()

        def elapsed() -> float:
            return time.monotonic() - start

        tmp_path: str | None = None
        try:
            # ── Duplicate check ────────────────────────────────────────────────
            existing = await db.document_exists_by_hash(pool, content_hash)
            if existing:
                yield _sse(
                    "done",
                    f"Dokument bereits vorhanden (hochgeladen am {existing['uploaded_at'][:10]}).",
                    100,
                    elapsed(),
                    result={
                        "filename": existing["filename"],
                        "document_id": existing["id"],
                        "duplicate": True,
                    },
                )
                return

            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(contents)
                tmp_path = tmp.name

            yield _sse("received", f"Datei empfangen ({size_mb:.1f} MB)", 5, elapsed())

            # ── Convert ────────────────────────────────────────────────────────
            yield _sse("converting", "Dokument wird analysiert…", 10, elapsed())
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, converter.convert, tmp_path)

            if result is None or result.document is None:
                yield _sse("error", "Dokument konnte nicht verarbeitet werden.", 0, elapsed(), error=True)
                return

            # ── Chunk ──────────────────────────────────────────────────────────
            yield _sse("chunking", "Text wird in Abschnitte aufgeteilt…", 60, elapsed())
            doc_chunks = list(chunker.chunk(result.document))

            if not doc_chunks:
                yield _sse("error", "Dokument enthält keine verarbeitbaren Inhalte.", 0, elapsed(), error=True)
                return

            chunk_texts = [chunk.text for chunk in doc_chunks]

            # ── Embed (with contextual overlap) ────────────────────────────────
            yield _sse(
                "embedding",
                f"Embeddings werden berechnet ({len(doc_chunks)} Chunks, mit Kontext-Overlap)…",
                70,
                elapsed(),
            )
            ctx_texts = _contextual_texts(chunk_texts)
            chunk_embeddings = await loop.run_in_executor(
                None, embeddings.encode_passages, ctx_texts
            )

            # ── Store ──────────────────────────────────────────────────────────
            yield _sse("storing", "Wird in Datenbank gespeichert…", 95, elapsed())
            document_id = await db.insert_document(pool, filename=filename, content_hash=content_hash)
            chunk_records = [
                {"content": text, "embedding": emb, "embedding_model": embeddings.MODEL_NAME}
                for text, emb in zip(chunk_texts, chunk_embeddings)
            ]
            chunk_count = await db.insert_chunks(pool, document_id, chunk_records)

            yield _sse(
                "done",
                "Verarbeitung abgeschlossen.",
                100,
                elapsed(),
                result={
                    "filename": filename,
                    "document_id": document_id,
                    "chunk_count": chunk_count,
                    "model": embeddings.MODEL_NAME,
                },
            )

        except Exception as exc:
            yield _sse("error", str(exc), 0, elapsed(), error=True)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
