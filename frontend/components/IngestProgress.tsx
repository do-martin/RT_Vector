"use client"

import { CheckCircle, AlertCircle, Loader2, X, FileText } from "lucide-react"
import { useIngest, type Stage } from "@/lib/ingest-context"
import { cn } from "@/lib/utils"

const STAGE_LABELS: Record<Stage, string> = {
  received:   "Datei empfangen",
  converting: "Dokument analysieren",
  chunking:   "Text aufteilen",
  embedding:  "Embeddings berechnen",
  storing:    "In Datenbank speichern",
  done:       "Abgeschlossen",
}

export function IngestProgress() {
  const { status, file, progress, error, elapsed, reset } = useIngest()

  if (status === "idle") return null

  const isDone  = status === "success"
  const isError = status === "error"

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <div className="rounded-md bg-muted p-1.5 shrink-0">
          <FileText className="size-3.5 text-muted-foreground" />
        </div>
        <p className="flex-1 truncate text-sm font-medium min-w-0">
          {file?.name ?? "Dokument"}
        </p>
        {(isDone || isError) && (
          <button
            onClick={reset}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-1 w-[calc(100%-2rem)] rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            isError ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${progress?.progress ?? (status === "uploading" ? 5 : 0)}%` }}
        />
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        {isDone && <CheckCircle className="size-4 shrink-0 text-green-500" />}
        {isError && <AlertCircle className="size-4 shrink-0 text-destructive" />}
        {status === "uploading" && <Loader2 className="size-4 shrink-0 text-primary animate-spin" />}

        <span className="flex-1 text-xs text-muted-foreground truncate">
          {isError
            ? error
            : progress
              ? (progress.stage === "done"
                  ? `Fertig in ${progress.elapsed.toFixed(1)}s`
                  : STAGE_LABELS[progress.stage as Stage] ?? progress.message)
              : "Wird gestartet…"}
        </span>

        {status === "uploading" && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {elapsed.toFixed(1)}s
          </span>
        )}

        {progress?.result && isDone && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {progress.result.chunk_count} Chunks
          </span>
        )}
      </div>
    </div>
  )
}
