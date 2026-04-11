-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding dimension: 1024 for multilingual-e5-large

-- Docling hybrid chunking
CREATE TABLE IF NOT EXISTS chunks_docling_hybrid (
    id            SERIAL PRIMARY KEY,
    doc_id        TEXT        NOT NULL,
    chunk_index   INT         NOT NULL,
    content       TEXT        NOT NULL,
    token_count   INT,
    metadata      JSONB       DEFAULT '{}',
    embedding     vector(1024),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chunks_docling_hybrid_embedding_idx
    ON chunks_docling_hybrid
    USING hnsw (embedding vector_cosine_ops);

-- Docling hierarchical chunking
CREATE TABLE IF NOT EXISTS chunks_docling_hierarchical (
    id            SERIAL PRIMARY KEY,
    doc_id        TEXT        NOT NULL,
    chunk_index   INT         NOT NULL,
    content       TEXT        NOT NULL,
    token_count   INT,
    metadata      JSONB       DEFAULT '{}',
    embedding     vector(1024),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chunks_docling_hierarchical_embedding_idx
    ON chunks_docling_hierarchical
    USING hnsw (embedding vector_cosine_ops);

-- LangChain recursive chunking
CREATE TABLE IF NOT EXISTS chunks_langchain_recursive (
    id            SERIAL PRIMARY KEY,
    doc_id        TEXT        NOT NULL,
    chunk_index   INT         NOT NULL,
    content       TEXT        NOT NULL,
    token_count   INT,
    metadata      JSONB       DEFAULT '{}',
    embedding     vector(1024),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chunks_langchain_recursive_embedding_idx
    ON chunks_langchain_recursive
    USING hnsw (embedding vector_cosine_ops);

-- LangChain Markdown-header chunking
CREATE TABLE IF NOT EXISTS chunks_langchain_mdheader (
    id            SERIAL PRIMARY KEY,
    doc_id        TEXT        NOT NULL,
    chunk_index   INT         NOT NULL,
    content       TEXT        NOT NULL,
    token_count   INT,
    metadata      JSONB       DEFAULT '{}',
    embedding     vector(1024),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chunks_langchain_mdheader_embedding_idx
    ON chunks_langchain_mdheader
    USING hnsw (embedding vector_cosine_ops);
