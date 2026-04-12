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
├── agent.py                 # Modular RAG Pipeline (Routing, Planung, HyDE, Evaluation, iteratives Retrieval)
├── crypto.py                # Verschlüsselung für gespeicherte API Keys
├── api/v1/
│   ├── ingest.py            # POST /ingest — Dokument hochladen & verarbeiten
│   ├── chat.py              # POST /chat — RAG-Chat (SSE-Stream)
│   ├── agent.py             # POST /agent — Modular RAG Chat (SSE-Stream)
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
| `POST` | `/api/v1/agent` | Modular RAG Chat — dynamisches Routing, Planung, HyDE, Evaluation (SSE-Stream) |
| `POST` | `/api/v1/chunk-preview` | Chunking-Vorschau ohne Speicherung |
| `GET` | `/api/v1/documents` | Alle indizierten Dokumente auflisten |
| `DELETE` | `/api/v1/documents/{id}` | Dokument löschen |
| `GET` | `/api/v1/conversations` | Gesprächsverläufe auflisten |
| `DELETE` | `/api/v1/conversations/{id}` | Gespräch löschen |
| `GET/POST` | `/api/v1/settings` | LLM-Provider-Konfiguration lesen/schreiben |

## Modular RAG Pipeline

Der `/api/v1/agent`-Endpunkt führt eine mehrstufige Modular RAG Pipeline aus. Alle Parameter werden vom LLM dynamisch pro Anfrage bestimmt — keine fixen Werte.

| Stufe | Modul | Beschreibung |
|---|---|---|
| 0 | **Query Router** | LLM klassifiziert Anfrage (`simple`/`complex`) und bestimmt `num_queries` und `top_k` vollständig selbst |
| 1a | **Query Planner** | LLM generiert N diverse Sub-Queries (nur `complex`, timeout: 15s) |
| 1b | **HyDE** | LLM generiert hypothetischen Dokumentenabschnitt als Vektor-Anker (nur `complex`, timeout: 8s) |
| 2 | **Hybridsuche** | Vektor + BM25 Volltext parallel für alle Queries, RRF-Fusion |
| 3 | **Reranking** | Cross-Encoder (`bge-reranker-base`) bewertet alle Kandidaten, Top-k |
| 4 | **Retrieval Evaluator** | LLM prüft ob Kontext ausreicht (timeout: 10s, max. 2 Iterationen) |
| 4b | **Iteratives Retrieval** | Bei unzureichendem Kontext: verfeinerte Query + erneute Suche + Merge |
| 5 | **Synthese** | LLM streamt Antwort in Markdown-Formatierung mit Prompt-Injection-Schutz |

**Simple path** (direkte Fragen): Stufen 1a/1b/4/4b entfallen — eine direkte Hybridsuche + Reranking.  
**Complex path** (Analyse, Vergleich, Multi-Fragen): Alle Stufen aktiv, `num_queries` und `top_k` vom Router bestimmt.

Der `/api/v1/chat`-Endpunkt ist eine schlankere Variante: feste Hybridsuche + Reranking ohne Routing und Evaluation.

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
