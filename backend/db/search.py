import psycopg_pool


async def search_chunks(
    pool: psycopg_pool.AsyncConnectionPool,
    query_embedding: list[float],
    top_k: int = 5,
) -> list[dict]:
    """Pure vector search (used as fallback)."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT c.content, d.filename, c.chunk_index,
                   1 - (c.embedding <=> %s::vector) AS similarity
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
            """,
            (query_embedding, query_embedding, top_k),
        )
        rows = await cur.fetchall()
    return [
        {
            "content": r[0],
            "filename": r[1],
            "chunk_index": r[2],
            "similarity": float(r[3]),
        }
        for r in rows
    ]


async def search_chunks_hybrid(
    pool: psycopg_pool.AsyncConnectionPool,
    query_embedding: list[float],
    query_text: str,
    top_k: int = 20,
) -> list[dict]:
    """
    Hybrid search: vector similarity + BM25 full-text, combined via Reciprocal Rank Fusion (RRF).
    Returns up to top_k results sorted by RRF score.
    """

    k = 60  # RRF constant
    limit = max(top_k * 2, 40)

    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT c.content, d.filename, c.chunk_index,
                   1 - (c.embedding <=> %s::vector) AS similarity,
                   ROW_NUMBER() OVER (ORDER BY c.embedding <=> %s::vector) AS rank
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
            """,
            (query_embedding, query_embedding, query_embedding, limit),
        )
        vector_rows = await cur.fetchall()

        try:
            cur = await conn.execute(
                """
                SELECT c.content, d.filename, c.chunk_index,
                       ts_rank(c.search_vector, websearch_to_tsquery('simple', %s)) AS similarity,
                       ROW_NUMBER() OVER (
                           ORDER BY ts_rank(c.search_vector, websearch_to_tsquery('simple', %s)) DESC
                       ) AS rank
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.search_vector IS NOT NULL
                  AND c.search_vector @@ websearch_to_tsquery('simple', %s)
                ORDER BY ts_rank(c.search_vector, websearch_to_tsquery('simple', %s)) DESC
                LIMIT %s
                """,
                (query_text, query_text, query_text, query_text, limit),
            )
            text_rows = await cur.fetchall()
        except Exception:
            text_rows = []

    # Build lookup dicts keyed by (filename, chunk_index)
    vector_map: dict[tuple, dict] = {}
    for r in vector_rows:
        key = (r[1], r[2])
        vector_map[key] = {
            "content": r[0],
            "filename": r[1],
            "chunk_index": r[2],
            "similarity": float(r[3]),
            "vector_rank": int(r[4]),
        }

    text_map: dict[tuple, dict] = {}
    for r in text_rows:
        key = (r[1], r[2])
        text_map[key] = {
            "content": r[0],
            "filename": r[1],
            "chunk_index": r[2],
            "similarity": float(r[3]),
            "text_rank": int(r[4]),
        }

    # RRF score: sum of 1/(k + rank) for each list the chunk appears in
    all_keys = set(vector_map) | set(text_map)
    scored: list[tuple[float, dict]] = []
    for key in all_keys:
        rrf = 0.0
        v = vector_map.get(key)
        t = text_map.get(key)
        if v:
            rrf += 1.0 / (k + v["vector_rank"])
        if t:
            rrf += 1.0 / (k + t["text_rank"])
        base = v or t
        scored.append(
            (
                rrf,
                {
                    "content": base["content"],  # type: ignore[index]
                    "filename": base["filename"],  # type: ignore[index]
                    "chunk_index": base["chunk_index"],  # type: ignore[index]
                    "similarity": v["similarity"] if v else 0.0,
                },
            )
        )

    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k]]
