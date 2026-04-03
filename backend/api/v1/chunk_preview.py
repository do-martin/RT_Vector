"""
POST /api/v1/chunk-preview

Converts the document once via Docling, then applies ALL chunking methods
in one pass and returns every result. The frontend can switch between methods
instantly without re-uploading the file.
"""

import asyncio
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

import chunkers

router = APIRouter()


def _build_all_results(document, docling_chunker, cfg: chunkers.ChunkingConfig) -> dict:
    """
    Run all chunking methods against the already-converted document.
    Returns a dict keyed by method name. Each entry has full_text + chunks.
    Docling conversion already happened — this is pure CPU text splitting.

    Text exports are computed once and reused:
      plain_text    — used by all non-hybrid, non-markdown methods
      markdown_text — used by the markdown splitter
    """
    plain_text    = document.export_to_text()
    markdown_text = document.export_to_markdown()

    results = {}
    for method in chunkers.METHODS:
        try:
            if method == "hybrid":
                chunk_list, full_text = chunkers.apply_chunker(
                    method, document, docling_chunker, cfg
                )
            elif method == "markdown":
                chunk_list = chunkers.apply_chunker_text(method, markdown_text, cfg)
                full_text  = "\n\n".join(c["text"] for c in chunk_list)
            else:
                chunk_list = chunkers.apply_chunker_text(method, plain_text, cfg)
                # Use exact positions when available; otherwise rebuild from chunks
                # so the left panel always shows all chunks completely.
                has_all_positions = all(c.get("char_start", -1) >= 0 for c in chunk_list)
                full_text = plain_text if has_all_positions else "\n\n".join(c["text"] for c in chunk_list)

            results[method] = {
                "method_label": chunkers.METHODS[method],
                "chunk_count": len(chunk_list),
                "full_text": full_text,
                "chunks": chunk_list,
            }
        except Exception as exc:
            results[method] = {"error": str(exc)}

    return results


@router.post("/chunk-preview")
async def chunk_preview(
    request: Request,
    file: UploadFile = File(...),
    # Chunking params forwarded so each method uses the user's configured values
    chunk_size: int = Form(1000),
    chunk_overlap: int = Form(150),
    sentences_per_chunk: int = Form(5),
    paragraphs_per_chunk: int = Form(3),
    window_size: int = Form(800),
    step_size: int = Form(400),
    token_size: int = Form(256),
    token_overlap: int = Form(32),
):
    contents = await file.read()
    filename = file.filename or "unknown"
    suffix = Path(filename).suffix or ".pdf"

    converter = request.app.state.converter
    docling_chunker = request.app.state.chunker

    cfg = chunkers.ChunkingConfig(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        sentences_per_chunk=sentences_per_chunk,
        paragraphs_per_chunk=paragraphs_per_chunk,
        window_size=window_size,
        step_size=step_size,
        token_size=token_size,
        token_overlap=token_overlap,
    )

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        loop = asyncio.get_running_loop()

        # ── Single Docling conversion ──────────────────────────────────────────
        result = await loop.run_in_executor(None, converter.convert, tmp_path)

        if result is None or result.document is None:
            return JSONResponse(
                status_code=422,
                content={"error": "Dokument konnte nicht verarbeitet werden."},
            )

        # ── All chunking methods in one pass (no extra Docling calls) ──────────
        all_results = await loop.run_in_executor(
            None, _build_all_results, result.document, docling_chunker, cfg
        )

        return {"filename": filename, "results": all_results}

    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
