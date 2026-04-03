import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from docling.chunking import HybridChunker
from docling.document_converter import DocumentConverter

import nltk

import db
import embeddings
from api.v1 import agent, chat, chunk_preview, conversations, documents, ingest, settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("rt_vector")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("RT-Vector: Starting up...")

    logger.info("Connecting to PostgreSQL...")
    pool = await db.open_pool()
    await db.create_tables(pool)
    app.state.db_pool = pool
    logger.info("Database ready.")

    logger.info("Loading Docling DocumentConverter...")
    app.state.converter = DocumentConverter()
    app.state.chunker = HybridChunker()
    logger.info("Docling ready.")

    logger.info("Loading embedding model (first run downloads ~2.5 GB)...")
    embeddings.get_model()
    logger.info("Embedding model ready.")

    logger.info("Loading reranker model (~280 MB)...")
    embeddings.get_reranker()
    logger.info("Reranker ready.")

    logger.info("Downloading NLTK sentence tokenizer data...")
    nltk.download("punkt_tab", quiet=True)
    logger.info("NLTK ready.")

    logger.info("Backend fully ready.")
    yield

    logger.info("Shutting down...")
    await db.close_pool(pool)


app = FastAPI(title="RT-Vector Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    start = time.monotonic()
    response = await call_next(request)
    elapsed = time.monotonic() - start
    logger.info(
        "[%s] %s %s → %d (%.3fs)",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response


@app.get("/")
async def root():
    return {"message": "RT-Vector Backend is running."}


app.include_router(agent.router,         prefix="/api/v1")
app.include_router(chat.router,          prefix="/api/v1")
app.include_router(chunk_preview.router, prefix="/api/v1")
app.include_router(conversations.router, prefix="/api/v1")
app.include_router(documents.router,     prefix="/api/v1")
app.include_router(ingest.router,        prefix="/api/v1")
app.include_router(settings.router,      prefix="/api/v1")
