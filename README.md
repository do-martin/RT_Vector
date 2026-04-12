# RT-Vector

Ein lokales RAG-System (Retrieval-Augmented Generation) zum Hochladen von Dokumenten und Chatten mit deren Inhalt. Dokumente werden mit Docling geparst, in Chunks aufgeteilt, als Vektoren in PostgreSQL gespeichert und über einen agenten-basierten RAG-Prozess mit einem konfigurierbaren LLM beantwortet.

## Architektur

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│              Next.js Frontend  :3000                    │
└────────────────────────┬────────────────────────────────┘
                         │ /api/* (Proxy)
┌────────────────────────▼────────────────────────────────┐
│              FastAPI Backend  :8000                      │
│                                                         │
│  Docling (PDF-Parser)   multilingual-e5-large           │
│  9 Chunking-Methoden    bge-reranker-base                │
│  5 LLM-Provider         Modular RAG                     │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│           PostgreSQL + pgvector  :5432                   │
│         Dokumente · Chunks · Embeddings                  │
│              Gesprächsverläufe                           │
└─────────────────────────────────────────────────────────┘
```

## Komponenten

| Komponente | Technologie | Beschreibung |
|---|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, shadcn/ui | Chat, Upload, Einstellungen |
| **Backend** | FastAPI, Python 3.12, uvicorn | REST-API, Ingestion, RAG-Pipeline |
| **Datenbank** | PostgreSQL 17 + pgvector | Vektor- und Hybridsuche |
| **Paketmanager** | uv (Backend), npm (Frontend) | |

## Features

- **Dokumenten-Ingestion:** PDF, DOCX, DOC, TXT, MD — geparst mit Docling (ML-basierte Layout-Analyse)
- **9 Chunking-Methoden:** Hybrid (Docling), Fixed, Sentence, Paragraph, Sliding Window, Recursive, Token, Markdown Header, NLTK Sentence
- **Chunk-Vorschau:** Alle Methoden werden verglichen und im Originaltext farblich hervorgehoben, bevor ein Dokument hochgeladen wird
- **Embeddings:** `intfloat/multilingual-e5-large` (1024 Dim.) mit Passage/Query-Präfix
- **Reranking:** `BAAI/bge-reranker-base` für präzisere Ergebnisse
- **5 LLM-Provider:** OpenAI, Anthropic Claude, Google Gemini, Azure OpenAI, Ollama
- **Modular RAG:** Dynamisches Routing, Query-Planung, HyDE, Hybridsuche, Reranking, Self-Evaluation und iteratives Retrieval
- **Gesprächsverläufe:** Unterhaltungen werden gespeichert und können fortgesetzt werden

## Schnellstart

**Voraussetzungen:** Docker Desktop

```bash
git clone <repo-url>
cd RT_Vector
docker compose up
```

Beim ersten Start werden die Modelle automatisch heruntergeladen (~2,8 GB):
- `intfloat/multilingual-e5-large` (~2,5 GB)
- `BAAI/bge-reranker-base` (~280 MB)

| Dienst | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

### Erste Schritte

1. **Einstellungen öffnen** → LLM-Provider auswählen und API-Key eingeben
2. **Dokument hochladen** → Datei per Drag & Drop, Chunking-Methode wählen, optional Vorschau
3. **Chat starten** → Fragen zu den hochgeladenen Dokumenten stellen

## Projektstruktur

```
RT_Vector/
├── docker-compose.yml          # Startet Frontend, Backend und PostgreSQL
├── frontend/                   # Next.js App (siehe frontend/README.md)
│   ├── app/
│   │   ├── chat/               # RAG-Chat mit Streaming
│   │   ├── upload/             # Dokument-Upload und -verwaltung
│   │   └── settings/           # LLM-Provider konfigurieren
│   └── components/
└── backend/                    # FastAPI App (siehe backend/README.md)
    ├── main.py                  # App-Einstiegspunkt
    ├── chunkers.py              # Alle Chunking-Strategien
    ├── embeddings.py            # Embedding- und Reranker-Modell
    ├── llm.py                   # LLM-Streaming je Provider
    ├── agent.py                 # Modular RAG Pipeline
    ├── api/v1/                  # REST-Endpunkte
    ├── db/                      # Datenbankzugriff
    └── notebook_evaluation/     # Chunking-Evaluierung (siehe notebook_evaluation/README.md)
```

## Entwicklung

Alle Dienste laufen mit Hot-Reload:

```bash
docker compose up
```

- **Backend:** uvicorn `--reload` — Änderungen in `backend/` werden sofort übernommen
- **Frontend:** Webpack-Polling — Änderungen in `frontend/` werden sofort übernommen

Einzelne Dienste neu starten:

```bash
docker compose restart backend
docker compose restart app
```

Logs eines Dienstes anzeigen:

```bash
docker compose logs -f backend
docker compose logs -f app
```

## Evaluierung

Unter [`backend/notebook_evaluation/`](backend/notebook_evaluation/README.md) befindet sich eine vollständige Evaluierungs-Pipeline, die vier Chunking-Strategien (Docling Hybrid, Docling Hierarchical, LangChain Recursive, LangChain Markdown Header) anhand des [Open RAGBench](https://huggingface.co/datasets/G4KMU/vectara_open_ragbench) Datensatzes mit RAGAS-Metriken vergleicht.

Die Pipeline kombiniert lokale Schritte mit Google Colab für die rechenintensive PDF-Konvertierung und Embedding-Generierung.