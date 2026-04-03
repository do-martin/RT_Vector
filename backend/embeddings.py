import torch
from sentence_transformers import SentenceTransformer, CrossEncoder

MODEL_NAME = "intfloat/multilingual-e5-large"
EMBEDDING_DIMS = 1024
RERANKER_MODEL = "BAAI/bge-reranker-base"

_model: SentenceTransformer | None = None
_reranker: CrossEncoder | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading embedding model '{MODEL_NAME}' on device='{device}'...")
        _model = SentenceTransformer(MODEL_NAME, device=device)
        print("Embedding model ready.")
    return _model


def get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        print(f"Loading reranker model '{RERANKER_MODEL}'...")
        _reranker = CrossEncoder(RERANKER_MODEL, max_length=512)
        print("Reranker ready.")
    return _reranker


def rerank(query: str, chunks: list[dict], top_k: int) -> list[dict]:
    """Score each chunk against the query and return the top_k by relevance."""
    model = get_reranker()
    pairs = [(query, chunk["content"]) for chunk in chunks]
    scores = model.predict(pairs, show_progress_bar=False)
    ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in ranked[:top_k]]


def encode_passages(texts: list[str]) -> list[list[float]]:
    """Encode document chunks. multilingual-e5 requires 'passage: ' prefix."""
    model = get_model()
    prefixed = [f"passage: {t}" for t in texts]
    return model.encode(prefixed, normalize_embeddings=True, show_progress_bar=False).tolist()


def encode_query(text: str) -> list[float]:
    """Encode a search query. multilingual-e5 requires 'query: ' prefix."""
    model = get_model()
    return model.encode(f"query: {text}", normalize_embeddings=True, show_progress_bar=False).tolist()
