"""
Chunking strategies for document text.

Each chunk dict has: {"index": int, "text": str, "char_start": int, "char_end": int}
char_start/char_end are byte positions in full_text (-1 when unavailable).
The frontend uses these for exact highlighting without indexOf guessing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ChunkingConfig:
    method: str = "hybrid"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    token_size: int = 256
    token_overlap: int = 32
    sentences_per_chunk: int = 5
    paragraphs_per_chunk: int = 3
    window_size: int = 800
    step_size: int = 400


METHODS: dict[str, str] = {
    "hybrid": "Hybrid (Docling) - strukturbewusst",
    "fixed": "Feste Größe - nach Zeichenanzahl",
    "sentence": "Satzbasiert - einfach (Regex)",
    "paragraph": "Absatzbasiert - nach Absätzen",
    "sliding": "Gleitendes Fenster - mit Überlapp",
    "recursive": "Recursive Character - Standard (LangChain)",
    "token": "Token Splitter - nach Tokens (LangChain)",
    "markdown": "Markdown Header - nach Überschriften (LangChain)",
    "sentence_nltk": "Satzbasiert NLTK - präzise Satzgrenzen (LangChain)",
}


def _chunk(index: int, text: str, start: int = -1) -> dict[str, Any]:
    return {
        "index": index,
        "text": text,
        "char_start": start,
        "char_end": start + len(text) if start >= 0 else -1,
    }


def _make(texts: list[str]) -> list[dict[str, Any]]:
    """No position info — used for hybrid where positions aren't available."""
    return [_chunk(i, t) for i, t in enumerate(texts) if t.strip()]


def _make_positioned(slices: list[tuple[str, int]]) -> list[dict[str, Any]]:
    """Exact positions known at split time."""
    result, idx = [], 0
    for text, start in slices:
        if text.strip():
            result.append(_chunk(idx, text, start))
            idx += 1
    return result


def _find_positions(chunks_text: list[str], full_text: str) -> list[dict[str, Any]]:
    """Post-hoc position search — for methods that strip/join text."""
    result, idx, pos = [], 0, 0
    for text in chunks_text:
        if not text.strip():
            continue
        needle = text.strip()
        found = full_text.find(needle, pos)
        if found != -1:
            result.append(_chunk(idx, needle, found))
            pos = found  # don't advance past — overlapping is fine
        else:
            result.append(_chunk(idx, needle))  # no position
        idx += 1
    return result


# ── Built-in methods ──────────────────────────────────────────────────────────


def chunk_hybrid(document, chunker) -> list[dict[str, Any]]:
    return _make([c.text for c in chunker.chunk(document)])


def chunk_fixed(
    text: str, chunk_size: int = 1000, overlap: int = 150
) -> list[dict[str, Any]]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    overlap = max(0, min(overlap, chunk_size - 1))
    step = chunk_size - overlap
    slices: list[tuple[str, int]] = []
    start = 0
    while start < len(text):
        slices.append((text[start : start + chunk_size], start))
        start += step
    return _make_positioned(slices)


_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def chunk_sentence(text: str, sentences_per_chunk: int = 5) -> list[dict[str, Any]]:
    sentences = [s.strip() for s in _SENT_SPLIT.split(text.strip()) if s.strip()]
    n = max(1, sentences_per_chunk)
    groups = [" ".join(sentences[i : i + n]) for i in range(0, len(sentences), n)]
    return _find_positions(groups, text)


def chunk_paragraph(text: str, paragraphs_per_chunk: int = 3) -> list[dict[str, Any]]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    n = max(1, paragraphs_per_chunk)
    groups = ["\n\n".join(paras[i : i + n]) for i in range(0, len(paras), n)]
    return _find_positions(groups, text)


def chunk_sliding(
    text: str, window_size: int = 800, step_size: int = 400
) -> list[dict[str, Any]]:
    if window_size <= 0 or step_size <= 0:
        raise ValueError("window_size and step_size must be > 0")
    slices: list[tuple[str, int]] = []
    start = 0
    while start < len(text):
        slices.append((text[start : start + window_size], start))
        if start + window_size >= len(text):
            break
        start += step_size
    return _make_positioned(slices)


# ── LangChain methods ─────────────────────────────────────────────────────────


def chunk_recursive(
    text: str, chunk_size: int = 1000, overlap: int = 150
) -> list[dict[str, Any]]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", " ", ""],
        add_start_index=True,
    )
    result, idx = [], 0
    for doc in splitter.create_documents([text]):
        if doc.page_content.strip():
            start = doc.metadata.get("start_index", -1)
            result.append(_chunk(idx, doc.page_content, start))
            idx += 1
    return result


def chunk_token(
    text: str, chunk_size: int = 256, overlap: int = 32
) -> list[dict[str, Any]]:
    from langchain_text_splitters import TokenTextSplitter

    splitter = TokenTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        encoding_name="cl100k_base",
        add_start_index=True,
    )
    result, idx = [], 0
    for doc in splitter.create_documents([text]):
        if doc.page_content.strip():
            start = doc.metadata.get("start_index", -1)
            result.append(_chunk(idx, doc.page_content, start))
            idx += 1
    return result


def chunk_markdown(text: str) -> list[dict[str, Any]]:
    """Splits at # / ## / ### headers. full_text is rebuilt from chunks."""
    from langchain_text_splitters import MarkdownHeaderTextSplitter

    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")],
        strip_headers=False,
    )
    texts = [
        doc.page_content.strip()
        for doc in splitter.split_text(text)
        if doc.page_content.strip()
    ]
    # Positions are not reliable for markdown (headers get injected) — use -1
    return [_chunk(i, t) for i, t in enumerate(texts)]


def chunk_sentence_nltk(
    text: str, chunk_size: int = 1000, overlap: int = 100
) -> list[dict[str, Any]]:
    from langchain_text_splitters import NLTKTextSplitter

    splitter = NLTKTextSplitter(
        chunk_size=chunk_size, chunk_overlap=overlap, add_start_index=True
    )
    result, idx = [], 0
    for doc in splitter.create_documents([text]):
        if doc.page_content.strip():
            start = doc.metadata.get("start_index", -1)
            result.append(_chunk(idx, doc.page_content, start))
            idx += 1
    return result


# ── Dispatchers ───────────────────────────────────────────────────────────────


def apply_chunker(
    method: str,
    document,
    chunker,
    cfg: ChunkingConfig,
) -> tuple[list[dict[str, Any]], str]:
    if method == "hybrid":
        chunks = chunk_hybrid(document, chunker)
        full_text = "\n\n".join(c["text"] for c in chunks)
        return chunks, full_text

    if method == "markdown":
        md_text = document.export_to_markdown()
        chunks = chunk_markdown(md_text)
        # Rebuild full_text from chunks so left panel matches exactly
        full_text = "\n\n".join(c["text"] for c in chunks)
        return chunks, full_text

    full_text = document.export_to_text()
    return apply_chunker_text(method, full_text, cfg), full_text


def apply_chunker_text(
    method: str,
    text: str,
    cfg: ChunkingConfig,
) -> list[dict[str, Any]]:
    if method == "fixed":
        return chunk_fixed(text, cfg.chunk_size, cfg.chunk_overlap)
    if method == "sentence":
        return chunk_sentence(text, cfg.sentences_per_chunk)
    if method == "paragraph":
        return chunk_paragraph(text, cfg.paragraphs_per_chunk)
    if method == "sliding":
        return chunk_sliding(text, cfg.window_size, cfg.step_size)
    if method == "recursive":
        return chunk_recursive(text, cfg.chunk_size, cfg.chunk_overlap)
    if method == "token":
        return chunk_token(text, cfg.token_size, cfg.token_overlap)
    if method == "markdown":
        chunks = chunk_markdown(text)
        return chunks
    if method == "sentence_nltk":
        return chunk_sentence_nltk(text, cfg.chunk_size, cfg.chunk_overlap)
    raise ValueError(f"Unknown chunking method: {method!r}")
