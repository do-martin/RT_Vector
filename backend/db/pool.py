import os

import psycopg
import psycopg_pool
from pgvector.psycopg import register_vector_async

_DATABASE_URL = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)

# ── DDL ───────────────────────────────────────────────────────────────────────

_CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS vector;"

_CREATE_DOCUMENTS = """
CREATE TABLE IF NOT EXISTS documents (
    id           BIGSERIAL PRIMARY KEY,
    filename     TEXT NOT NULL,
    content_hash TEXT,
    uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_CHUNKS = """
CREATE TABLE IF NOT EXISTS chunks (
    id               BIGSERIAL PRIMARY KEY,
    document_id      BIGINT REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index      INTEGER NOT NULL,
    content          TEXT NOT NULL,
    embedding        VECTOR(1024),
    embedding_model  TEXT NOT NULL,
    search_vector    TSVECTOR,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_INDEX_HNSW = """
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING hnsw (embedding vector_cosine_ops);
"""

_CREATE_INDEX_GIN = """
CREATE INDEX IF NOT EXISTS chunks_search_vector_idx
    ON chunks USING GIN (search_vector);
"""

_MIGRATE_SEARCH_VECTOR = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chunks' AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE chunks ADD COLUMN search_vector TSVECTOR;
    END IF;
END $$;
"""

_BACKFILL_SEARCH_VECTOR = """
UPDATE chunks SET search_vector = to_tsvector('simple', content)
WHERE search_vector IS NULL;
"""

_CREATE_APP_SETTINGS = """
CREATE TABLE IF NOT EXISTS app_settings (
    id   INTEGER PRIMARY KEY DEFAULT 1,
    data JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT single_row CHECK (id = 1)
);
"""

_CREATE_CONVERSATIONS = """
CREATE TABLE IF NOT EXISTS conversations (
    id         BIGSERIAL PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'Neue Unterhaltung',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_MESSAGES = """
CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    sources         JSONB,
    pipeline        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_INDEX_MESSAGES = """
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id);
"""


# ── Pool ──────────────────────────────────────────────────────────────────────

async def _configure(conn: psycopg.AsyncConnection) -> None:
    await register_vector_async(conn)


async def open_pool() -> psycopg_pool.AsyncConnectionPool:
    async with await psycopg.AsyncConnection.connect(_DATABASE_URL, autocommit=True) as conn:
        await conn.execute(_CREATE_EXTENSION)

    pool = psycopg_pool.AsyncConnectionPool(
        conninfo=_DATABASE_URL,
        open=False,
        configure=_configure,
    )
    await pool.open()
    return pool


async def close_pool(pool: psycopg_pool.AsyncConnectionPool) -> None:
    await pool.close()


async def create_tables(pool: psycopg_pool.AsyncConnectionPool) -> None:
    async with pool.connection() as conn:
        await conn.execute(_CREATE_DOCUMENTS)
        await conn.execute(_CREATE_CHUNKS)
        await conn.execute(_CREATE_INDEX_HNSW)
        await conn.execute(_MIGRATE_SEARCH_VECTOR)
        await conn.execute(_CREATE_INDEX_GIN)
        await conn.execute(_BACKFILL_SEARCH_VECTOR)
        await conn.execute(_CREATE_APP_SETTINGS)
        await conn.execute(_CREATE_CONVERSATIONS)
        await conn.execute(_CREATE_MESSAGES)
        await conn.execute(_CREATE_INDEX_MESSAGES)
        await conn.commit()
