"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import {
  Send, Loader2, AlertCircle, FileText, ChevronDown, ChevronUp,
  Bot, User, Activity, Copy, Check, Plus, Trash2, MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Source {
  filename: string
  chunk_index: number
  similarity: number
  content: string
}

interface PipelineStep {
  stage: string
  message: string
  queries?: string[]
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: Source[]
  pipeline?: PipelineStep[]
  isStreaming?: boolean
  statusMessage?: string
}

interface Conversation {
  id: number
  title: string
  updated_at: string
  message_count: number
}

type PreflightState =
  | { status: "checking" }
  | { status: "no_settings" }
  | { status: "invalid_credentials"; error: string }
  | { status: "no_documents" }
  | { status: "ready" }

// ── Pre-flight check ──────────────────────────────────────────────────────────

async function runPreflight(): Promise<PreflightState> {
  const [settingsRes, statusRes] = await Promise.all([
    fetch("/api/settings").then((r) => r.json()).catch(() => ({ configured: false })),
    fetch("/api/status").then((r) => r.json()).catch(() => ({ document_count: 0 })),
  ])
  if (!settingsRes.configured) return { status: "no_settings" }
  if ((statusRes.document_count ?? 0) === 0) return { status: "no_documents" }
  return { status: "ready" }
}

// ── Copy-able code block ───────────────────────────────────────────────────────

function CopyCodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    const text = preRef.current?.querySelector("code")?.innerText ?? ""
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <div className="relative group">
      <pre ref={preRef} {...props}>{children}</pre>
      <button
        onClick={copy}
        title={copied ? "Kopiert!" : "Kopieren"}
        className={cn(
          "absolute top-2 right-2 rounded px-1.5 py-0.5 text-xs transition-all",
          "bg-muted text-muted-foreground hover:text-foreground",
          "opacity-0 group-hover:opacity-100",
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [preflight, setPreflight] = useState<PreflightState>({ status: "checking" })
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [loadingConv, setLoadingConv] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { runPreflight().then(setPreflight) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const retry = () => { setPreflight({ status: "checking" }); runPreflight().then(setPreflight) }

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetch("/api/conversations").then((r) => r.json())
      setConversations(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  const selectConversation = useCallback(async (conv: Conversation) => {
    if (isStreaming) return
    setLoadingConv(conv.id)
    try {
      const msgs: Array<{
        id: number; role: string; content: string
        sources: Source[] | null; pipeline: PipelineStep[] | null; created_at: string
      }> = await fetch(`/api/conversations/${conv.id}/messages`).then((r) => r.json())
      setMessages(msgs.map((m) => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        content: m.content,
        sources: m.sources ?? undefined,
        pipeline: m.pipeline ?? undefined,
      })))
      setActiveConvId(conv.id)
    } catch { /* ignore */ }
    finally { setLoadingConv(null) }
  }, [isStreaming])

  const startNewConversation = useCallback(() => {
    if (isStreaming) return
    setMessages([])
    setActiveConvId(null)
    setInput("")
    textareaRef.current?.focus()
  }, [isStreaming])

  const deleteConversation = useCallback(async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" })
    if (activeConvId === conv.id) {
      setMessages([])
      setActiveConvId(null)
    }
    setConversations((prev) => prev.filter((c) => c.id !== conv.id))
  }, [activeConvId])

  const sendMessage = useCallback(async () => {
    const question = input.trim()
    if (!question || isStreaming) return

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: question }
    const assistantId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", isStreaming: true, pipeline: [] },
    ])
    setInput("")
    setIsStreaming(true)

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, conversation_id: activeConvId ?? undefined }),
      })

      if (!res.body) throw new Error("Keine Antwort vom Server.")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const patch = (fn: (m: Message) => Message) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "conversation_id") {
              setActiveConvId(event.conversation_id)
            } else if (event.type === "token") {
              patch((m) => ({ ...m, content: m.content + event.token, statusMessage: undefined }))
            } else if (event.type === "status") {
              patch((m) => ({
                ...m,
                statusMessage: event.message,
                pipeline: [...(m.pipeline ?? []), { stage: event.stage, message: event.message }],
              }))
            } else if (event.type === "routing") {
              const label = event.route === "simple" ? "Einfach" : "Komplex"
              const detail = event.route === "simple"
                ? `top_k=${event.top_k}`
                : `${event.num_queries} Sub-Queries · top_k=${event.top_k}`
              patch((m) => ({
                ...m,
                statusMessage: event.route === "simple"
                  ? "Einfache Anfrage erkannt — direkte Suche…"
                  : "Komplexe Anfrage erkannt — erweiterte Suche…",
                pipeline: [...(m.pipeline ?? []), {
                  stage: "routing",
                  message: `${label}: ${event.reason} · ${detail}`,
                }],
              }))
            } else if (event.type === "queries") {
              patch((m) => ({
                ...m,
                statusMessage: `${event.queries.length} Suchanfragen generiert…`,
                pipeline: [...(m.pipeline ?? []), { stage: "queries", message: `${event.queries.length} Suchanfragen`, queries: event.queries }],
              }))
            } else if (event.type === "sources") {
              patch((m) => ({ ...m, sources: event.sources }))
            } else if (event.type === "done") {
              patch((m) => ({ ...m, isStreaming: false, statusMessage: undefined }))
              loadConversations()
            } else if (event.type === "error") {
              patch((m) => ({ ...m, content: `Fehler: ${event.error}`, isStreaming: false, statusMessage: undefined }))
            }
          } catch { /* ignore malformed */ }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`, isStreaming: false }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, messages, activeConvId, loadConversations])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Conversation sidebar ─────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r flex flex-col bg-muted/20">
        <div className="p-3 border-b">
          <Button
            onClick={startNewConversation}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={isStreaming}
          >
            <Plus className="size-3.5" />
            Neue Unterhaltung
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Noch keine Unterhaltungen</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                disabled={loadingConv === conv.id}
                className={cn(
                  "w-full text-left rounded-md px-2.5 py-2 text-xs group flex items-start gap-2 transition-colors",
                  activeConvId === conv.id
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <MessageSquare className="size-3 shrink-0 mt-0.5" />
                <span className="flex-1 truncate leading-snug">{conv.title}</span>
                <span
                  onClick={(e) => deleteConversation(conv, e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && deleteConversation(conv, e as unknown as React.MouseEvent)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                >
                  <Trash2 className="size-3" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main chat area ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
      {preflight.status === "checking" && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Verbindung wird geprüft…</span>
          </div>
        </div>
      )}

      {preflight.status !== "checking" && preflight.status !== "ready" && (
        <PreflightError state={preflight} onRetry={retry} />
      )}

      {preflight.status === "ready" && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-6">
              {messages.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-16">
                  <Bot className="size-8 mx-auto mb-3 text-muted-foreground/40" />
                  <p>Stelle eine Frage zu deinen Dokumenten.</p>
                </div>
              )}
              {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t bg-background px-4 py-3">
            <div className="mx-auto max-w-2xl flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Nachricht eingeben… (Enter zum Senden, Shift+Enter für Zeilenumbruch)"
                disabled={isStreaming}
                className={cn(
                  "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-ring disabled:opacity-50 max-h-40 overflow-y-auto"
                )}
                style={{ height: "auto" }}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = "auto"
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`
                }}
              />
              <Button onClick={sendMessage} disabled={!input.trim() || isStreaming} size="icon" className="shrink-0">
                {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  routing:    "Routing",
  planning:   "Planung",
  queries:    "Suchanfragen",
  searching:  "Hybridsuche",
  reranking:  "Reranking",
  evaluating: "Kontextprüfung",
  iterating:  "Verfeinerte Suche",
  generating: "Generierung",
}

const MD_COMPONENTS = {
  pre: CopyCodeBlock,
}

function MessageBubble({ message }: { message: Message }) {
  const [showSources, setShowSources] = useState(false)
  const [showPipeline, setShowPipeline] = useState(false)
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5 text-muted-foreground" />}
      </div>

      <div className={cn("max-w-[80%] space-y-2", isUser && "items-end flex flex-col")}>
        {/* Message content */}
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        )}>
          {message.content ? (
            isUser ? (
              <span className="whitespace-pre-wrap">{message.content}</span>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-p:my-1 prose-headings:mt-3 prose-headings:mb-1
                prose-ul:my-1 prose-ol:my-1 prose-li:my-0
                prose-pre:bg-black/10 prose-pre:dark:bg-white/10 prose-pre:rounded prose-pre:p-3
                prose-code:bg-black/10 prose-code:dark:bg-white/10 prose-code:rounded prose-code:px-1 prose-code:text-xs
                prose-blockquote:border-l-2 prose-blockquote:border-muted-foreground/30 prose-blockquote:pl-3 prose-blockquote:text-muted-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={MD_COMPONENTS}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )
          ) : message.isStreaming ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <Loader2 className="size-3 animate-spin shrink-0" />
              {message.statusMessage ?? "Denkt nach…"}
            </span>
          ) : null}
          {message.isStreaming && message.content && (
            <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>

        {/* Pipeline steps — shown after streaming completes */}
        {!message.isStreaming && message.pipeline && message.pipeline.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => setShowPipeline((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Activity className="size-3" />
              Verarbeitungsschritte
              {showPipeline ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
            {showPipeline && (
              <div className="mt-1.5 rounded-lg border bg-background p-2.5 space-y-2">
                {message.pipeline.map((step, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
                        {STAGE_LABELS[step.stage] ?? step.stage}
                      </span>
                      <span className="text-muted-foreground">{step.message}</span>
                    </div>
                    {step.queries && (
                      <ul className="ml-2 space-y-0.5">
                        {step.queries.map((q, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <span className="mt-0.5 shrink-0 text-muted-foreground/50">›</span>
                            <span className="italic">{q}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="w-full">
            <button
              onClick={() => setShowSources((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileText className="size-3" />
              {message.sources.length} Quellen
              {showSources ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
            {showSources && (
              <div className="mt-1.5 space-y-1.5">
                {message.sources.map((src, i) => (
                  <div key={i} className="rounded-lg border bg-background p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{src.filename}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {Math.round(src.similarity * 100)}%
                      </Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{src.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pre-flight error screen ───────────────────────────────────────────────────

type ErrorState = Exclude<PreflightState, { status: "ready" } | { status: "checking" }>

const PREFLIGHT_CONFIG: Record<ErrorState["status"], {
  title: string
  description: (state: ErrorState) => string
  action: { label: string; href: string }
}> = {
  no_settings: {
    title: "Kein KI-Provider konfiguriert",
    description: () => "Bitte wähle einen Provider und gib die Zugangsdaten in den Einstellungen ein.",
    action: { label: "Zu den Einstellungen", href: "/settings" },
  },
  invalid_credentials: {
    title: "Ungültige Zugangsdaten",
    description: (s) => (s as { status: "invalid_credentials"; error: string }).error,
    action: { label: "Einstellungen prüfen", href: "/settings" },
  },
  no_documents: {
    title: "Keine Dokumente vorhanden",
    description: () => "Lade zuerst mindestens ein Dokument hoch, damit der Chat Inhalte durchsuchen kann.",
    action: { label: "Dokument hochladen", href: "/upload" },
  },
}

function PreflightError({ state, onRetry }: { state: ErrorState; onRetry: () => void }) {
  const { title, description, action } = PREFLIGHT_CONFIG[state.status]
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{description(state)}</p>
          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link href={action.href}>{action.label}</Link>
            </Button>
            <Button variant="outline" onClick={onRetry}>Erneut prüfen</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
