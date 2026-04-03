import psycopg_pool


async def document_exists_by_hash(
    pool: psycopg_pool.AsyncConnectionPool, content_hash: str
) -> dict | None:
    """Return the existing document dict if hash already ingested, else None."""
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, filename, uploaded_at FROM documents WHERE content_hash = %s LIMIT 1",
            (content_hash,),
        )
        row = await cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "filename": row[1], "uploaded_at": row[2].isoformat()}


async def list_documents(pool: psycopg_pool.AsyncConnectionPool) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT d.id, d.filename, d.uploaded_at, COUNT(c.id) AS chunk_count
            FROM documents d
            LEFT JOIN chunks c ON c.document_id = d.id
            GROUP BY d.id, d.filename, d.uploaded_at
            ORDER BY d.uploaded_at DESC
            """
        )
        rows = await cur.fetchall()
    return [
        {"id": r[0], "filename": r[1], "uploaded_at": r[2].isoformat(), "chunk_count": r[3]}
        for r in rows
    ]


async def delete_document(pool: psycopg_pool.AsyncConnectionPool, document_id: int) -> bool:
    async with pool.connection() as conn:
        cur = await conn.execute("DELETE FROM documents WHERE id = %s", (document_id,))
        await conn.commit()
    return cur.rowcount > 0


async def count_documents(pool: psycopg_pool.AsyncConnectionPool) -> int:
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT COUNT(*) FROM documents")
        row = await cur.fetchone()
    return row[0]


async def insert_document(
    pool: psycopg_pool.AsyncConnectionPool,
    filename: str,
    content_hash: str | None = None,
) -> int:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "INSERT INTO documents (filename, content_hash) VALUES (%s, %s) RETURNING id",
            (filename, content_hash),
        )
        row = await cur.fetchone()
        await conn.commit()
        return row[0]


async def insert_chunks(
    pool: psycopg_pool.AsyncConnectionPool,
    document_id: int,
    chunks: list[dict],
) -> int:
    """chunks: list of {content, embedding, embedding_model}"""
    async with pool.connection() as conn:
        for idx, chunk in enumerate(chunks):
            await conn.execute(
                """
                INSERT INTO chunks
                    (document_id, chunk_index, content, embedding, embedding_model, search_vector)
                VALUES (%s, %s, %s, %s, %s, to_tsvector('simple', %s))
                """,
                (
                    document_id, idx,
                    chunk["content"], chunk["embedding"], chunk["embedding_model"],
                    chunk["content"],
                ),
            )
        await conn.commit()
    return len(chunks)
