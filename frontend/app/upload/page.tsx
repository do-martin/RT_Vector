"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Upload, FileText, CheckCircle, AlertCircle, X, Loader2, Trash2, Eye } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIngest, type ChunkingConfig } from "@/lib/ingest-context"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: number
  filename: string
  uploaded_at: string
  chunk_count: number
}

interface PreviewChunk {
  index: number
  text: string
  char_start: number  // -1 when unavailable
  char_end: number
}

interface MethodResult {
  method_label: string
  chunk_count: number
  full_text: string
  chunks: PreviewChunk[]
  error?: string
}

interface PreviewResult {
  filename: string
  results: Record<string, MethodResult>
}

const ACCEPTED = [".pdf", ".docx", ".doc", ".txt", ".md"]

const CHUNKING_METHODS = [
  // ── Built-in ────────────────────────────────────────────────────────────────
  { value: "hybrid",        label: "Hybrid (Docling)",         description: "Strukturbewusst - empfohlen für PDFs/DOCX" },
  { value: "fixed",         label: "Feste Größe",              description: "Feste Zeichenanzahl mit Überlapp" },
  { value: "sentence",      label: "Satzbasiert (Regex)",      description: "Einfache Satztrennung per Regex" },
  { value: "paragraph",     label: "Absatzbasiert",            description: "Gruppiert Absätze zu Chunks" },
  { value: "sliding",       label: "Gleitendes Fenster",       description: "Überlappende Fenster fixer Größe" },
  // ── LangChain ───────────────────────────────────────────────────────────────
  { value: "recursive",     label: "Recursive Character",      description: "Standard - trennt an Absatz → Satz → Wort → Zeichen" },
  { value: "token",         label: "Token Splitter",           description: "Nach echten LLM-Tokens (tiktoken)" },
  { value: "markdown",      label: "Markdown Header",          description: "Teilt an # / ## / ### Überschriften" },
  { value: "sentence_nltk", label: "Satzbasiert (NLTK)",       description: "Präzise Satzgrenzen via NLTK" },
]

const DEFAULT_CONFIG: ChunkingConfig = {
  method: "hybrid",
  chunkSize: 1000,
  chunkOverlap: 150,
  sentencesPerChunk: 5,
  paragraphsPerChunk: 3,
  windowSize: 800,
  stepSize: 400,
  tokenSize: 256,
  tokenOverlap: 32,
}

function sizeEstimate(bytes: number): string {
  const mb = bytes / 1024 / 1024
  if (mb < 0.1) return "~5 Sek."
  if (mb < 0.5) return "~15 Sek."
  if (mb < 2)   return "~30 Sek."
  if (mb < 5)   return "~60 Sek."
  return "~2+ Min."
}

const PIPELINE_STAGES = [
  { key: "received",   label: "Datei empfangen" },
  { key: "converting", label: "Dokument analysieren" },
  { key: "chunking",   label: "Text aufteilen" },
  { key: "embedding",  label: "Embeddings berechnen" },
  { key: "storing",    label: "In Datenbank speichern" },
  { key: "done",       label: "Abgeschlossen" },
]
const STAGE_ORDER = PIPELINE_STAGES.map((s) => s.key)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function requestPreview(file: File, cfg: ChunkingConfig): Promise<PreviewResult> {
  const form = new FormData()
  form.append("file", file)
  form.append("chunk_size",           String(cfg.chunkSize))
  form.append("chunk_overlap",        String(cfg.chunkOverlap))
  form.append("sentences_per_chunk",  String(cfg.sentencesPerChunk))
  form.append("paragraphs_per_chunk", String(cfg.paragraphsPerChunk))
  form.append("window_size",          String(cfg.windowSize))
  form.append("step_size",            String(cfg.stepSize))
  form.append("token_size",           String(cfg.tokenSize))
  form.append("token_overlap",        String(cfg.tokenOverlap))
  const res = await fetch("/api/chunk-preview", { method: "POST", body: form })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data as PreviewResult
}

// ── Chunking params (inline, no collapse) ────────────────────────────────────

function ChunkingParams({
  config,
  onChange,
}: {
  config: ChunkingConfig
  onChange: (c: ChunkingConfig) => void
}) {
  const set = (p: Partial<ChunkingConfig>) => onChange({ ...config, ...p })

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Chunking-Methode</Label>
        <Select value={config.method} onValueChange={(v) => set({ method: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHUNKING_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <span className="font-medium">{m.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{m.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Char-size methods: fixed, recursive, sentence_nltk */}
      {["fixed", "recursive", "sentence_nltk"].includes(config.method) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Chunk-Größe (Zeichen)</Label>
            <Input type="number" min={100} max={10000} className="h-8 text-sm"
              value={config.chunkSize} onChange={(e) => set({ chunkSize: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Überlappung (Zeichen)</Label>
            <Input type="number" min={0} max={2000} className="h-8 text-sm"
              value={config.chunkOverlap} onChange={(e) => set({ chunkOverlap: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {config.method === "sliding" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fenstergröße (Zeichen)</Label>
            <Input type="number" min={100} max={10000} className="h-8 text-sm"
              value={config.windowSize} onChange={(e) => set({ windowSize: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Schrittweite (Zeichen)</Label>
            <Input type="number" min={50} max={5000} className="h-8 text-sm"
              value={config.stepSize} onChange={(e) => set({ stepSize: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {config.method === "token" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Chunk-Größe (Tokens)</Label>
            <Input type="number" min={32} max={4096} className="h-8 text-sm"
              value={config.tokenSize} onChange={(e) => set({ tokenSize: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Überlappung (Tokens)</Label>
            <Input type="number" min={0} max={512} className="h-8 text-sm"
              value={config.tokenOverlap} onChange={(e) => set({ tokenOverlap: Number(e.target.value) })} />
          </div>
        </div>
      )}

      {config.method === "sentence" && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sätze pro Chunk</Label>
          <Input type="number" min={1} max={50} className="h-8 text-sm w-32"
            value={config.sentencesPerChunk} onChange={(e) => set({ sentencesPerChunk: Number(e.target.value) })} />
        </div>
      )}

      {config.method === "paragraph" && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Absätze pro Chunk</Label>
          <Input type="number" min={1} max={20} className="h-8 text-sm w-32"
            value={config.paragraphsPerChunk} onChange={(e) => set({ paragraphsPerChunk: Number(e.target.value) })} />
        </div>
      )}

      {["hybrid", "markdown"].includes(config.method) && (
        <p className="text-xs text-muted-foreground">
          {config.method === "hybrid"
            ? "Docling erkennt die Dokumentstruktur automatisch."
            : "Teilt an Markdown-Überschriften (# / ## / ###). Ideal für strukturierte Dokumente."}
        </p>
      )}
    </div>
  )
}

// ── Preview Dialog ────────────────────────────────────────────────────────────
// All methods are pre-computed — switching is instant, no extra requests.

function ChunkPreviewDialog({
  result,
  initialMethod,
  onClose,
}: {
  result: PreviewResult
  initialMethod: string
  onClose: () => void
}) {
  const [method, setMethod]     = useState(initialMethod)
  const [selected, setSelected] = useState<number | null>(null)
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([])

  const current = result.results[method]

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const selectChunk = (idx: number) => {
    setSelected(idx)
    chunkRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  const segments = current && !current.error
    ? buildSegments(current.full_text, current.chunks)
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-background border rounded-xl shadow-2xl flex flex-col w-full max-w-6xl h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium text-sm truncate min-w-0 flex-1">{result.filename}</span>

          {/* Method switcher — instant, no loading */}
          <Select value={method} onValueChange={(v) => { setMethod(v); setSelected(null) }}>
            <SelectTrigger className="h-7 text-xs w-52 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHUNKING_METHODS.map((m) => {
                const r = result.results[m.value]
                return (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    <span>{m.label}</span>
                    {r && !r.error && (
                      <span className="ml-2 text-muted-foreground">{r.chunk_count} Chunks</span>
                    )}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>

          {current && !current.error && (
            <Badge variant="outline" className="shrink-0 text-xs">{current.chunk_count} Chunks</Badge>
          )}

          <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0">
            <X className="size-4" />
          </Button>
        </div>

        {/* Body */}
        {!current || current.error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-destructive">
            {current?.error ?? "Keine Daten für diese Methode."}
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 divide-x">
            {/* Left: original text with highlights */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/20 shrink-0">
                Originaltext
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
                {segments.map((seg, i) =>
                  seg.chunkIndex !== null ? (
                    <mark
                      key={i}
                      onClick={() => selectChunk(seg.chunkIndex!)}
                      className={cn(
                        "cursor-pointer rounded-sm transition-colors",
                        seg.chunkIndex % 2 === 0
                          ? "bg-blue-500/10 hover:bg-blue-500/20"
                          : "bg-violet-500/10 hover:bg-violet-500/20",
                        selected === seg.chunkIndex && "ring-1 ring-primary bg-primary/25",
                      )}
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i} className="text-muted-foreground/50">{seg.text}</span>
                  )
                )}
              </div>
            </div>

            {/* Right: chunk list */}
            <div className="flex flex-col w-[380px] shrink-0">
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/20 shrink-0">
                Chunks ({current.chunk_count})
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {current.chunks.map((chunk) => (
                  <div
                    key={chunk.index}
                    ref={(el) => { chunkRefs.current[chunk.index] = el }}
                    onClick={() => setSelected(chunk.index === selected ? null : chunk.index)}
                    className={cn(
                      "rounded-lg border p-3 cursor-pointer transition-colors text-xs",
                      selected === chunk.index
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">#{chunk.index + 1}</Badge>
                      <span className="text-muted-foreground">{chunk.text.length} Zeichen</span>
                    </div>
                    <p className="text-foreground/80 line-clamp-4 leading-relaxed">{chunk.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Build highlighted segments from full_text + chunk list
interface Segment { text: string; chunkIndex: number | null }

function buildSegments(fullText: string, chunks: PreviewChunk[]): Segment[] {
  const segments: Segment[] = []

  // Use exact char positions when available (backend provides them)
  const positioned = chunks.filter(c => c.char_start >= 0)
  if (positioned.length === chunks.length && chunks.length > 0) {
    const sorted = [...chunks].sort((a, b) => a.char_start - b.char_start)
    let pos = 0
    for (const chunk of sorted) {
      if (chunk.char_start > pos)
        segments.push({ text: fullText.slice(pos, chunk.char_start), chunkIndex: null })
      segments.push({ text: fullText.slice(chunk.char_start, chunk.char_end), chunkIndex: chunk.index })
      pos = Math.max(pos, chunk.char_end)
    }
    if (pos < fullText.length)
      segments.push({ text: fullText.slice(pos), chunkIndex: null })
    return segments
  }

  // Fallback: indexOf for hybrid / markdown (no positions)
  let pos = 0
  for (const chunk of chunks) {
    const needle = chunk.text.trim()
    if (!needle) continue
    const idx = fullText.indexOf(needle, pos)
    if (idx === -1) {
      segments.push({ text: needle + " ", chunkIndex: chunk.index })
      continue
    }
    if (idx > pos) segments.push({ text: fullText.slice(pos, idx), chunkIndex: null })
    segments.push({ text: fullText.slice(idx, idx + needle.length), chunkIndex: chunk.index })
    pos = idx + needle.length
  }
  if (pos < fullText.length) segments.push({ text: fullText.slice(pos), chunkIndex: null })
  return segments
}

// ── Documents table ───────────────────────────────────────────────────────────

function DocumentsTable({
  docs,
  loading,
  onDelete,
}: {
  docs: Document[]
  loading: boolean
  onDelete: (id: number) => Promise<void>
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    setConfirmId(null)
    await onDelete(id)
    setDeletingId(null)
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Hochgeladene Dokumente</CardTitle>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <CardDescription>
          {docs.length === 0 ? "Noch keine Dokumente vorhanden." : `${docs.length} Dokument${docs.length !== 1 ? "e" : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        {docs.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-muted-foreground/60 text-center py-8">
            <FileText className="size-8 mx-auto mb-2 opacity-30" />
            Lade dein erstes Dokument hoch.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-6 py-2 font-medium text-muted-foreground">Dateiname</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Chunks</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Hochgeladen</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate max-w-45" title={doc.filename}>{doc.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Badge variant="outline" className="text-xs">{doc.chunk_count}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                      {formatDate(doc.uploaded_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirmId === doc.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-muted-foreground mr-1">Löschen?</span>
                          <Button size="icon-sm" variant="destructive" onClick={() => handleDelete(doc.id)} disabled={deletingId === doc.id}>
                            {deletingId === doc.id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => setConfirmId(null)}>
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmId(doc.id)} disabled={deletingId === doc.id}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Upload page ───────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { status, file: activeFile, progress, error, elapsed, startUpload, reset } = useIngest()

  const [pendingFile, setPendingFile]     = useState<File | null>(null)
  const [dragging, setDragging]           = useState(false)
  const [docs, setDocs]                   = useState<Document[]>([])
  const [docsLoading, setDocsLoading]     = useState(true)
  const [config, setConfig]               = useState<ChunkingConfig>(DEFAULT_CONFIG)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing]       = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchDocs = useCallback(async () => {
    setDocsLoading(true)
    try {
      const res = await fetch("/api/documents")
      if (res.ok) setDocs(await res.json())
    } finally {
      setDocsLoading(false)
    }
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])
  useEffect(() => { if (status === "success") fetchDocs() }, [status, fetchDocs])

  const selectFile = useCallback((f: File) => setPendingFile(f), [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) selectFile(f)
  }, [selectFile])

  const clearPending = () => {
    setPendingFile(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleUpload = () => {
    if (!pendingFile) return
    startUpload(pendingFile, config)
    setPendingFile(null)
  }

  const handleReset = () => { reset(); clearPending() }
  const handleDelete = async (id: number) => {
    await fetch(`/api/documents/${id}`, { method: "DELETE" })
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  const displayFile = pendingFile ?? (status !== "idle" ? activeFile : null)
  const isProcessing = status === "uploading"
  const currentIdx = progress ? STAGE_ORDER.indexOf(progress.stage as string) : -1

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dokumente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dokumente hochladen und verwalten · Unterstützte Formate: {ACCEPTED.join(", ")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── Left: Upload ── */}
        <div className="space-y-4">

          {/* Drop zone */}
          <Card>
            <CardContent className="p-0">
              <div
                onDragOver={(e) => { e.preventDefault(); if (!isProcessing) setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={!isProcessing ? onDrop : undefined}
                onClick={() => !displayFile && !isProcessing && inputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-4 rounded-t-xl p-10 text-center transition-colors",
                  !displayFile && !isProcessing && "cursor-pointer",
                  dragging
                    ? "border-2 border-dashed border-primary bg-primary/5"
                    : "border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <input ref={inputRef} type="file" accept={ACCEPTED.join(",")} className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f) }} />

                {!displayFile ? (
                  <>
                    <div className="rounded-full bg-muted p-4">
                      <Upload className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Datei hierher ziehen oder{" "}
                        <span className="text-primary underline underline-offset-2">auswählen</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Max. 50 MB</p>
                    </div>
                  </>
                ) : (
                  <div className="flex w-full items-center gap-3">
                    <div className="rounded-lg bg-muted p-2.5">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="truncate text-sm font-medium">{displayFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(displayFile.size / 1024 / 1024).toFixed(2)} MB
                        {!isProcessing && status === "idle" && (
                          <span className="ml-2 text-muted-foreground/60">· ca. {sizeEstimate(displayFile.size)}</span>
                        )}
                      </p>
                    </div>
                    {!isProcessing && (
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleReset() }} className="shrink-0 text-muted-foreground">
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Chunking config — always visible once file selected */}
              {pendingFile && !isProcessing && (
                <div className="px-5 py-4 border-t space-y-3">
                  <ChunkingParams config={config} onChange={setConfig} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          {pendingFile && !isProcessing && (
            <div className="flex gap-2">
              <Button variant="outline" disabled={previewing} onClick={async () => {
                setPreviewing(true)
                try {
                  const r = await requestPreview(pendingFile, config)
                  setPreviewResult(r)
                } catch (e) {
                  alert(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.")
                } finally {
                  setPreviewing(false)
                }
              }} className="flex-1">
                {previewing ? <><Loader2 className="size-4 animate-spin" /> Wird analysiert…</> : <><Eye className="size-4" /> Chunk-Vorschau</>}
              </Button>
              <Button onClick={handleUpload} className="flex-1">
                <Upload className="size-4" />
                Hochladen &amp; verarbeiten
              </Button>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Verarbeitung läuft…</CardTitle>
                  <span className="text-sm tabular-nums text-muted-foreground">{elapsed.toFixed(1)}s</span>
                </div>
                {progress && <CardDescription>{progress.message}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress?.progress ?? 0}%` }} />
                </div>
                <div className="space-y-2">
                  {PIPELINE_STAGES.map(({ key, label }, idx) => {
                    const done = currentIdx > idx, current = currentIdx === idx
                    return (
                      <div key={key} className="flex items-center gap-2.5">
                        <div className="size-4 shrink-0 flex items-center justify-center">
                          {done ? <CheckCircle className="size-4 text-green-500" />
                            : current ? <Loader2 className="size-4 text-primary animate-spin" />
                            : <span className="size-3 rounded-full border border-muted-foreground/30 block" />}
                        </div>
                        <span className={cn("text-sm", done && "text-muted-foreground/50 line-through", current && "font-medium", !done && !current && "text-muted-foreground/50")}>
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Sie können die Seite verlassen — die Verarbeitung läuft im Hintergrund weiter.</p>
              </CardContent>
            </Card>
          )}

          {/* Success */}
          {status === "success" && progress?.result && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="size-5 text-green-500" />
                  <CardTitle className="text-base text-green-600">Erfolgreich verarbeitet</CardTitle>
                </div>
                <CardDescription>{progress.result.filename} · {progress.elapsed.toFixed(1)}s</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">Dokument #{progress.result.document_id}</Badge>
                <Badge variant="outline">{progress.result.chunk_count} Chunks</Badge>
                <Badge variant="outline" className="font-mono text-xs">{progress.result.model}</Badge>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {status === "error" && error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-5 text-destructive" />
                  <CardTitle className="text-base text-destructive">Fehler beim Upload</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{error}</p>
              </CardContent>
            </Card>
          )}

          {(status === "success" || status === "error") && (
            <Button variant="outline" className="w-full" onClick={handleReset}>
              Weiteres Dokument hochladen
            </Button>
          )}
        </div>

        {/* ── Right: Documents table ── */}
        <DocumentsTable docs={docs} loading={docsLoading} onDelete={handleDelete} />
      </div>

      {/* Preview dialog */}
      {previewResult && (
        <ChunkPreviewDialog
          result={previewResult}
          initialMethod={config.method}
          onClose={() => setPreviewResult(null)}
        />
      )}
    </div>
  )
}
