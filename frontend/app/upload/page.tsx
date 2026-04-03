"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Upload, FileText, CheckCircle, AlertCircle, X, Loader2, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useIngest } from "@/lib/ingest-context"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: number
  filename: string
  uploaded_at: string
  chunk_count: number
}

const ACCEPTED = [".pdf", ".docx", ".doc", ".txt", ".md"]

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
                          <Button
                            size="icon-sm"
                            variant="destructive"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                          >
                            {deletingId === doc.id
                              ? <Loader2 className="size-3 animate-spin" />
                              : <CheckCircle className="size-3" />}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setConfirmId(null)}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmId(doc.id)}
                          disabled={deletingId === doc.id}
                        >
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

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
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

  // Refresh list after successful upload
  useEffect(() => {
    if (status === "success") fetchDocs()
  }, [status, fetchDocs])

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
    startUpload(pendingFile)
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
                  "flex flex-col items-center justify-center gap-4 rounded-xl p-10 text-center transition-colors",
                  !displayFile && !isProcessing && "cursor-pointer",
                  dragging
                    ? "border-2 border-dashed border-primary bg-primary/5"
                    : "border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <input ref={inputRef} type="file" accept={ACCEPTED.join(",")} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) selectFile(f) }} />

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
            </CardContent>
          </Card>

          {/* Upload button */}
          {pendingFile && status !== "uploading" && (
            <Button onClick={handleUpload} className="w-full">
              <Upload className="size-4" />
              Hochladen &amp; verarbeiten
            </Button>
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
    </div>
  )
}
