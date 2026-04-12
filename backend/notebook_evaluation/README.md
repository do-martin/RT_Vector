# RAG Chunking Evaluation

Dieses Verzeichnis enthält eine vollständige Evaluierungs-Pipeline zum Vergleich verschiedener **Chunking-Strategien** für ein RAG-System. Als Grundlage dient der [Open RAGBench](https://huggingface.co/datasets/G4KMU/vectara_open_ragbench) Datensatz mit arXiv-PDFs.

## Übersicht der Pipeline

```
[LOKAL]                    [GOOGLE COLAB]                        [LOKAL]
   │                              │                                  │
01_pdf_downloader   ──►  02_colab_docling          04_upload_to_db
   │                              │                        │
   │  PDFs auf Google Drive  03_colab_docling_    05_evaluation
   │  hochladen ──────────►  result_to_vector             │
                                  │               06_load_evaluation
                    Parquet lokal herunterladen ──►
```

## Warum Colab für Schritt 2 und 3?

Die Schritte 2 und 3 laufen in **Google Colab**, weil sie rechenintensiv sind und lokal deutlich länger dauern würden:

- **Docling PDF-Konvertierung** (Notebook 02) analysiert Layout, Tabellen und Struktur jedes PDFs mit einem ML-basierten Dokumentenmodell. Auf einer GPU läuft die Verarbeitung mehrfach schneller als auf einer lokalen CPU.
- **Embedding-Generierung** (Notebook 03) berechnet für hunderte Dokumente und tausende Chunks dichte Vektoren mit `intfloat/multilingual-e5-large` (1024 Dim.). Das Modell profitiert stark von GPU-Parallelisierung — lokal würde dieser Schritt ohne GPU Stunden dauern.

Google Drive dient dabei als Zwischenspeicher, da Colab-Sessions keinen persistenten Speicher haben.

## Notebooks

| # | Notebook | Umgebung | Beschreibung |
|---|---|---|---|
| 1 | `01_pdf_downloader.ipynb` | **Lokal** | Lädt arXiv-PDFs aus dem Open RAGBench Datensatz herunter → `pdfs/` |
| 2 | `02_colab_docling.ipynb` | **Google Colab** | Konvertiert PDFs via Docling zu Markdown & JSON, gespeichert auf Google Drive |
| 3 | `03_colab_docling_result_to_vector.ipynb` | **Google Colab** | Chunking (4 Methoden) + Embeddings → Parquet-Dateien auf Google Drive |
| 4 | `04_upload_to_db.ipynb` | **Lokal** | Lädt Parquet-Dateien in die pgvector-Datenbank |
| 5 | `05_evaluation.ipynb` | **Lokal** | RAGAS-Evaluierung der Chunking-Methoden mit Azure OpenAI |
| 6 | `06_load_evaluation.ipynb` | **Lokal** | Lädt und visualisiert die Evaluierungsergebnisse |

## Verglichene Chunking-Methoden

| Methode | Bibliothek | Beschreibung |
|---|---|---|
| `docling_hybrid` | Docling | Tokenbasiert, max. 512 Tokens pro Chunk |
| `docling_hierarchical` | Docling | Strukturbasiert nach Dokumenthierarchie |
| `langchain_mdheader` | LangChain | Split nach Markdown-Überschriften (H1/H2/H3) + Recursive |
| `langchain_recursive` | LangChain | Zeichenbasiert, chunk_size=1500, overlap=150 |

## Technischer Stack

- **Embedding-Modell:** `intfloat/multilingual-e5-large` (1024 Dimensionen)
- **Vektordatenbank:** PostgreSQL + pgvector (HNSW-Index, Cosine Similarity)
- **Evaluierungs-Framework:** [RAGAS](https://docs.ragas.io/)
- **LLM (Evaluation):** Azure OpenAI (Chat + Embeddings)
- **Datensatz:** `G4KMU/vectara_open_ragbench` — Split `text_tables`, 90 arXiv-Dokumente

## RAGAS Metriken

| Metrik | Was wird gemessen? |
|---|---|
| `context_precision` | Wie präzise sind die abgerufenen Chunks? |
| `context_recall` | Werden alle relevanten Informationen gefunden? |
| `context_entity_recall` | Werden relevante Entitäten im Kontext abgedeckt? |
| `faithfulness` | Ist die Antwort faktenbasiert auf den Kontext? |
| `answer_relevancy` | Beantwortet die Antwort die Frage? |
| `answer_correctness` | Ist die Antwort inhaltlich korrekt? |
| `answer_similarity` | Semantische Ähnlichkeit zur Ground Truth |

## Setup

### 1. Datenbank starten

```bash
docker compose up -d
```

Die pgvector-Instanz startet auf Port `59101`. Das Init-Script unter `init_sql/init.sql` erstellt automatisch alle vier Chunk-Tabellen mit HNSW-Index.

**Verbindungsparameter:**
```
host=localhost  port=59101
dbname=chunks_evaluation
user=admin  password=admin
```

### 2. Umgebungsvariablen (.env)

Für Notebook `05_evaluation.ipynb` wird eine `.env`-Datei im selben Verzeichnis benötigt:

```env
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_API_VERSION=<api-version>
AZURE_DEPLOYMENT_CHAT=<chat-deployment-name>
AZURE_DEPLOYMENT_EMBED=<embedding-deployment-name>
```

### 3. Pipeline ausführen

#### Schritt 1 — Lokal: PDFs herunterladen

`01_pdf_downloader.ipynb` lädt alle arXiv-PDFs aus dem Open RAGBench Datensatz herunter und speichert sie lokal unter `pdfs/`. ArXiv hat ein Rate-Limit, daher wartet das Notebook 3 Sekunden zwischen den Requests.

**Anschließend:** Den gesamten Ordner `pdfs/` auf Google Drive hochladen (z. B. nach `MyDrive/docling_pdfs/`).

---

#### Schritt 2 — Google Colab: PDF-Konvertierung mit Docling

`02_colab_docling.ipynb` in Google Colab öffnen und ausführen. Das Notebook:
- mountet Google Drive
- liest die hochgeladenen PDFs aus `MyDrive/docling_pdfs/`
- konvertiert jedes PDF mit **Docling** (ML-basierte Dokumentenanalyse) zu Markdown und JSON
- speichert die Ergebnisse in `MyDrive/docling_pdfs/markdown/` und `MyDrive/docling_pdfs/json/`

> **Hinweis:** GPU-Laufzeit in Colab aktivieren (`Laufzeit → Laufzeittyp ändern → T4 GPU`).

---

#### Schritt 3 — Google Colab: Chunking & Embeddings

`03_colab_docling_result_to_vector.ipynb` in Google Colab öffnen und ausführen. Das Notebook:
- liest die Docling-JSON-Dateien von Google Drive
- wendet alle 4 Chunking-Methoden an
- berechnet Embeddings mit `intfloat/multilingual-e5-large`
- speichert 4 Parquet-Dateien in `MyDrive/docling_pdfs/RAG_Export/`

**Anschließend:** Die 4 Parquet-Dateien von Google Drive lokal nach `parquet/multilingual-e5-large/` herunterladen.

---

#### Schritt 4 — Lokal: Datenbank befüllen

`04_upload_to_db.ipynb` liest die 4 Parquet-Dateien ein, filtert auf Dokumente die in **allen** Methoden vorhanden sind (90 Dokumente), und lädt die Chunks in die jeweiligen pgvector-Tabellen.

---

#### Schritt 5 — Lokal: RAGAS-Evaluierung

`05_evaluation.ipynb` zieht 200 zufällige Test-Queries aus dem gefilterten Datensatz, führt für jede Chunking-Methode eine Vektorsuche (top-3) durch, generiert via Azure OpenAI eine Antwort und bewertet mit RAGAS. Ergebnisse:
- `chunking_evaluation_results.csv` — aggregierte Scores je Methode
- `chunking_detailed_results.csv` — Scores je Query und Methode

---

#### Schritt 6 — Lokal: Ergebnisse analysieren

`06_load_evaluation.ipynb` lädt die CSV-Dateien und erstellt einen direkten Vergleich der Chunking-Methoden anhand aller RAGAS-Metriken.

## Verzeichnisstruktur

```
notebook_evaluation/
├── 01_pdf_downloader.ipynb
├── 02_colab_docling.ipynb
├── 03_colab_docling_result_to_vector.ipynb
├── 04_upload_to_db.ipynb
├── 05_evaluation.ipynb
├── 06_load_evaluation.ipynb
├── docker-compose.yaml
├── init_sql/
│   └── init.sql                          # DB-Schema mit HNSW-Indizes
├── json/                                 # Docling JSON-Output der PDFs
├── parquet/
│   └── multilingual-e5-large/            # Embeddings je Chunking-Methode
├── pdfs/                                 # Heruntergeladene arXiv-PDFs
├── chunking_evaluation_results.csv       # Aggregierte RAGAS-Scores
└── chunking_detailed_results.csv         # Detaillierte Ergebnisse je Query
```
