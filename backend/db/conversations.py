import json

import psycopg_pool


async def create_conversation(pool: psycopg_pool.AsyncConnectionPool) -> int:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "INSERT INTO conversations DEFAULT VALUES RETURNING id"
        )
        row = await cur.fetchone()
        await conn.commit()
    return row[0]


async def update_conversation_title(
    pool: psycopg_pool.AsyncConnectionPool, conversation_id: int, title: str
) -> None:
    async with pool.connection() as conn:
        await conn.execute(
            "UPDATE conversations SET title = %s, updated_at = NOW() WHERE id = %s",
            (title[:80], conversation_id),
        )
        await conn.commit()


async def list_conversations(pool: psycopg_pool.AsyncConnectionPool) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT c.id, c.title, c.updated_at,
                   COUNT(m.id) AS message_count
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            GROUP BY c.id, c.title, c.updated_at
            ORDER BY c.updated_at DESC
            LIMIT 100
            """
        )
        rows = await cur.fetchall()
    return [
        {"id": r[0], "title": r[1], "updated_at": r[2].isoformat(), "message_count": r[3]}
        for r in rows
    ]


async def get_conversation_messages(
    pool: psycopg_pool.AsyncConnectionPool, conversation_id: int
) -> list[dict]:
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT id, role, content, sources, pipeline, created_at
            FROM messages
            WHERE conversation_id = %s
            ORDER BY created_at ASC
            """,
            (conversation_id,),
        )
        rows = await cur.fetchall()
    return [
        {
            "id": r[0],
            "role": r[1],
            "content": r[2],
            "sources": r[3],
            "pipeline": r[4],
            "created_at": r[5].isoformat(),
        }
        for r in rows
    ]


async def save_message(
    pool: psycopg_pool.AsyncConnectionPool,
    conversation_id: int,
    role: str,
    content: str,
    sources: list | None = None,
    pipeline: list | None = None,
) -> int:
    async with pool.connection() as conn:
        cur = await conn.execute(
            """
            INSERT INTO messages (conversation_id, role, content, sources, pipeline)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                conversation_id, role, content,
                json.dumps(sources) if sources is not None else None,
                json.dumps(pipeline) if pipeline is not None else None,
            ),
        )
        row = await cur.fetchone()
        await conn.execute(
            "UPDATE conversations SET updated_at = NOW() WHERE id = %s",
            (conversation_id,),
        )
        await conn.commit()
    return row[0]


async def delete_conversation(
    pool: psycopg_pool.AsyncConnectionPool, conversation_id: int
) -> bool:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "DELETE FROM conversations WHERE id = %s", (conversation_id,)
        )
        await conn.commit()
    return cur.rowcount > 0
