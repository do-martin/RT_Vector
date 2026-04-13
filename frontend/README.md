# RT-Vector Frontend

Next.js-Frontend für das RT-Vector RAG-System. Bietet eine deutschsprachige Oberfläche zum Hochladen von Dokumenten, Konfigurieren von LLM-Providern und Chatten mit den indizierten Inhalten.

## Technischer Stack

| Komponente | Technologie |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| Sprache | TypeScript |
| UI-Bibliothek | shadcn/ui + Radix UI |
| Styling | Tailwind CSS v4 |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm + rehype-highlight |

## Seiten

| Route | Beschreibung |
|---|---|
| `/` | Startseite mit Navigation zu Chat, Upload und Einstellungen |
| `/chat` | RAG-Chat mit Gesprächsverlauf-Sidebar |
| `/upload` | Dokumente hochladen und verwalten |
| `/settings` | LLM-Provider konfigurieren |

## Funktionen

### Chat (`/chat`)
- RAG-Chat mit SSE-Streaming
- Gesprächs-Sidebar: Unterhaltungen anlegen, wechseln und löschen
- Anzeige der Verarbeitungsschritte (Planung → Suchanfragen → Hybridsuche → Reranking → Generierung)
- Quellenangaben mit Ähnlichkeitswert und Chunk-Vorschau
- Markdown-Rendering mit Syntax-Highlighting und kopierbaren Code-Blöcken
- Pre-flight-Check: Prüft vor dem ersten Chat ob Provider und Dokumente vorhanden sind

### Upload (`/upload`)
- Drag-and-Drop oder Dateiauswahl (PDF, DOCX, DOC, TXT, MD — max. 50 MB)
- Wahl der Chunking-Methode mit passenden Parametern
- **Chunk-Vorschau:** Alle 9 Methoden werden auf einmal berechnet und können ohne weiteren Request verglichen werden. Chunks werden im Originaltext farblich hervorgehoben — Klick auf einen Chunk im Text scrollt zur Chunk-Liste und umgekehrt.
- Upload-Fortschritt mit Schritt-für-Schritt-Anzeige (Empfangen → Analysieren → Aufteilen → Embeddings → Speichern)
- Dokumententabelle mit Chunk-Anzahl, Upload-Datum und Löschfunktion

### Einstellungen (`/settings`)
- Auswahl zwischen 5 LLM-Providern: OpenAI, Google Gemini, Anthropic Claude, Azure OpenAI, Ollama
- Verbindungstest direkt aus der UI
- API Keys werden verschlüsselt im Backend gespeichert und nie zurück an den Client gesendet

## Projektstruktur

```
frontend/
├── app/
│   ├── layout.tsx           # Root-Layout mit Header
│   ├── page.tsx             # Startseite
│   ├── chat/page.tsx        # Chat-Seite
│   ├── upload/page.tsx      # Upload-Seite
│   └── settings/page.tsx    # Einstellungen
├── components/
│   ├── Header.tsx           # Globale Navigation
│   ├── IngestProgress.tsx   # Upload-Fortschrittsanzeige
│   └── ui/                  # shadcn/ui Komponenten
├── lib/
│   ├── ingest-context.tsx   # Globaler Upload-State (React Context)
│   └── utils.ts             # Hilfsfunktionen (cn)
└── public/                  # Statische Assets
```

## Entwicklung

### Mit Docker (empfohlen)

Das Frontend läuft als Teil des Root-`docker-compose.yml`:

```bash
# Im Projektstamm ausführen
docker compose up
```

Die App ist erreichbar unter `http://localhost:3000`.  
Webpack-Polling ist aktiviert — Codeänderungen werden sofort übernommen.

> **Hinweis:** Turbopack ist im Docker-Setup deaktiviert (`NEXT_DISABLE_TURBOPACK=1`), da es unter Windows/Docker kein Hot-Reload via Polling unterstützt.

### Lokal ohne Docker

**Voraussetzungen:** Node.js 20+

```bash
cd frontend

# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Die App ist erreichbar unter `http://localhost:3000`. Das Frontend erwartet das Backend unter `http://localhost:8000`.

## API-Proxy

Next.js leitet alle Anfragen unter `/api/*` an das Backend weiter. Im Docker-Setup geschieht das über die Umgebungsvariable `BACKEND_URL=http://backend:8000`, lokal direkt auf `http://localhost:8000`.