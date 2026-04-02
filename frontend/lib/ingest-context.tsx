"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type UploadStatus = "idle" | "uploading" | "success" | "error"
export type Stage = "received" | "converting" | "chunking" | "embedding" | "storing" | "done"

export interface ProgressEvent {
  stage: Stage | "error"
  message: string
  progress: number
  elapsed: number
  error?: boolean
  result?: IngestResult
}

export interface IngestResult {
  filename: string
  document_id: number
  chunk_count: number
  model: string
}

interface IngestContextType {
  status: UploadStatus
  file: File | null
  progress: ProgressEvent | null
  error: string | null
  elapsed: number
  startUpload: (file: File) => void
  reset: () => void
}

const IngestContext = createContext<IngestContextType | null>(null)

export function IngestProvider({ children }: { children: ReactNode }) {
  const [file, setFile]       = useState<File | null>(null)
  const [status, setStatus]   = useState<UploadStatus>("idle")
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const startRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status === "uploading") {
      startRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startRef.current) / 1000)
      }, 100)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  const reset = useCallback(() => {
    setFile(null); setStatus("idle"); setProgress(null); setError(null); setElapsed(0)
  }, [])

  const startUpload = useCallback((f: File) => {
    setFile(f); setStatus("uploading"); setError(null); setProgress(null)

    const form = new FormData()
    form.append("file", f)

    fetch("/api/ingest", { method: "POST", body: form })
      .then((res) => {
        if (!res.body) throw new Error("Keine Antwort vom Server.")

        const reader  = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer    = ""

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) return

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              try {
                const event: ProgressEvent = JSON.parse(line.slice(6))
                setProgress(event)
                if (event.error) { setError(event.message); setStatus("error"); return }
                if (event.stage === "done") setStatus("success")
              } catch { /* ignore malformed */ }
            }
            return pump()
          })

        return pump()
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
        setStatus("error")
      })
  }, [])

  return (
    <IngestContext.Provider value={{ status, file, progress, error, elapsed, startUpload, reset }}>
      {children}
    </IngestContext.Provider>
  )
}

export function useIngest() {
  const ctx = useContext(IngestContext)
  if (!ctx) throw new Error("useIngest must be used within IngestProvider")
  return ctx
}
