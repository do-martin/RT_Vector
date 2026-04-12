# RT-Vector Backend

FastAPI-Backend für das RT-Vector RAG-System. Übernimmt Dokumenten-Ingestion, Chunking, Embedding-Generierung, Vektorsuche und LLM-Streaming.

## Technischer Stack

| Komponente | Technologie |
|---|---|
| Web-Framework | FastAPI + uvicorn |
| Dokumenten-Parser | Docling |
| Embedding-Modell | `intfloat/multilingual-e5-large` (1024 Dim.) |
| Reranker | `BAAI/bge-reranker-base` |
| Vektordatenbank | PostgreSQL + pgvector |
| Paketmanager | uv (Python 3.12) |

## Projektstruktur

```
backend/
├── main.py                  # FastAPI App, Lifespan (DB, Modelle laden)
├── chunkers.py              # Alle Chunking-Strategien
├── embeddings.py            # Embedding- und Reranker-Modell
├── llm.py                   # LLM-Streaming (OpenAI, Claude, Gemini, Azure, Ollama)
├── agent.py                 # Agentic RAG (Planer + Tool-Loop)
├── crypto.py                # Verschlüsselung für gespeicherte API Keys
├── api/v1/
│   ├── ingest.py            # POST /ingest — Dokument hochladen & verarbeiten
│   ├── chat.py              # POST /chat — RAG-Chat (SSE-Stream)
│   ├── agent.py             # POST /agent — Agenten-Chat (SSE-Stream)
│   ├── chunk_preview.py     # POST /chunk-preview — Chunking-Vorschau
│   ├── documents.py         # GET/DELETE /documents
│   ├── conversations.py     # GET/DELETE /conversations
│   └── settings.py          # GET/POST /settings — LLM-Provider konfigurieren
└── db/
    ├── pool.py              # Datenbankverbindungs-Pool
    ├── documents.py         # CRUD für Dokumente und Chunks
    ├── conversations.py     # CRUD für Gesprächsverläufe
    ├── search.py            # Vektor- und Hybridsuche
    └── settings.py          # LLM-Einstellungen persistieren
```

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/v1/ingest` | Dokument hochladen, chunken und indizieren (SSE-Progress) |
| `POST` | `/api/v1/chat` | RAG-Chat-Anfrage (SSE-Stream) |
| `POST` | `/api/v1/agent` | Agenten-Chat mit Tool-Loop (SSE-Stream) |
| `POST` | `/api/v1/chunk-preview` | Chunking-Vorschau ohne Speicherung |
| `GET` | `/api/v1/documents` | Alle indizierten Dokumente auflisten |
| `DELETE` | `/api/v1/documents/{id}` | Dokument löschen |
| `GET` | `/api/v1/conversations` | Gesprächsverläufe auflisten |
| `DELETE` | `/api/v1/conversations/{id}` | Gespräch löschen |
| `GET/POST` | `/api/v1/settings` | LLM-Provider-Konfiguration lesen/schreiben |

## Unterstützte Chunking-Methoden

| Methode | Beschreibung |
|---|---|
| `hybrid` | Docling HybridChunker — strukturbewusst, tokenbasiert |
| `fixed` | Feste Zeichenanzahl mit Overlap |
| `sentence` | Satzbasiert via Regex |
| `paragraph` | Absatzbasiert |
| `sliding` | Gleitendes Fenster mit Overlap |
| `recursive` | LangChain RecursiveCharacterTextSplitter |
| `token` | LangChain TokenTextSplitter (cl100k_base) |
| `markdown` | LangChain MarkdownHeaderTextSplitter |
| `sentence_nltk` | LangChain NLTKTextSplitter |

## Unterstützte LLM-Provider

| Provider | Konfiguration |
|---|---|
| OpenAI | API Key + Modell (z. B. `gpt-4o`) |
| Anthropic Claude | API Key + Modell (z. B. `claude-sonnet-4-6`) |
| Google Gemini | API Key + Modell (z. B. `gemini-2.0-flash`) |
| Azure OpenAI | Endpoint + API Key + API Version + Deployment Name |
| Ollama | Base URL + Modellname (lokal) |

## Entwicklung

### Mit Docker (empfohlen)

Das Backend läuft als Teil des Root-`docker-compose.yml`:

```bash
# Im Projektstamm ausführen
docker compose up
```

Das Backend ist erreichbar unter `http://localhost:8000`.  
uvicorn läuft mit `--reload` — Codeänderungen werden sofort übernommen.

### Lokal ohne Docker

**Voraussetzungen:** Python 3.12, [uv](https://docs.astral.sh/uv/)

```bash
cd backend

# Abhängigkeiten installieren
uv sync

# Backend starten (Datenbank muss laufen)
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/rt_vector \
uv run uvicorn main:app --reload --port 8000
```

### Umgebungsvariablen

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL-Verbindungs-URL |
| `SENTENCE_TRANSFORMERS_HOME` | — | Cache-Pfad für Modell-Downloads |
| `ENCRYPTION_KEY` | — | Fernet-Key zur Verschlüsselung der API Keys |

## Modelle

Beim ersten Start werden folgende Modelle automatisch heruntergeladen:

| Modell | Größe | Zweck |
|---|---|---|
| `intfloat/multilingual-e5-large` | ~2,5 GB | Embeddings für Dokument-Chunks und Suchanfragen |
| `BAAI/bge-reranker-base` | ~280 MB | Reranking der Suchergebnisse nach Relevanz |

Im Docker-Setup werden die Modelle im Volume `models_cache` gespeichert und müssen nur einmal heruntergeladen werden.

## Evaluierung

Unter [`notebook_evaluation/`](notebook_evaluation/README.md) befindet sich eine vollständige Evaluierungs-Pipeline, die verschiedene Chunking-Strategien anhand des Open RAGBench Datensatzes mit RAGAS-Metriken vergleicht.
