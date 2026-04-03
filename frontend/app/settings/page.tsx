"use client"

import { useState, useEffect } from "react"
import { Eye, EyeOff, Check, X, Loader2, Bot, Sparkles, Brain, Cloud, Server, type LucideIcon } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type Provider = "openai" | "gemini" | "claude" | "azure" | "ollama"

// What we show in the form (never contains actual API key once saved)
interface FormConfig {
  openai: { apiKey: string; model: string }
  gemini: { apiKey: string; model: string }
  claude: { apiKey: string; model: string }
  azure: { apiKey: string; endpoint: string; deploymentName: string; apiVersion: string }
  ollama: { baseUrl: string; modelName: string }
}

// What the backend returns (apiKey replaced by apiKeySet bool)
interface BackendConfig {
  provider: string
  config: Record<string, Record<string, string | boolean>>
  configured: boolean
}

type ValidationState =
  | { status: "idle" }
  | { status: "loading" }   // initial load
  | { status: "validating" }
  | { status: "valid" }
  | { status: "invalid"; error: string }

const emptyForm: FormConfig = {
  openai: { apiKey: "", model: "gpt-4o" },
  gemini: { apiKey: "", model: "gemini-2.0-flash" },
  claude: { apiKey: "", model: "claude-sonnet-4-6" },
  azure: { apiKey: "", endpoint: "", deploymentName: "", apiVersion: "2024-02-01" },
  ollama: { baseUrl: "http://localhost:11434", modelName: "" },
}

const providers: { id: Provider; name: string; description: string; Icon: LucideIcon }[] = [
  { id: "openai",  name: "OpenAI",           description: "GPT-4o, GPT-4 Turbo u.a.",  Icon: Bot },
  { id: "gemini",  name: "Google Gemini",    description: "Gemini 2.0 Flash u.a.",     Icon: Sparkles },
  { id: "claude",  name: "Anthropic Claude", description: "Opus, Sonnet, Haiku u.a.",  Icon: Brain },
  { id: "azure",   name: "Azure OpenAI",     description: "Eigener Azure-Endpunkt",    Icon: Cloud },
  { id: "ollama",  name: "Ollama",           description: "Lokal, ohne API-Key",       Icon: Server },
]

export default function SettingsPage() {
  const [provider, setProvider] = useState<Provider>("openai")
  const [form, setForm] = useState<FormConfig>(emptyForm)
  // Track which providers already have an API key stored on the server
  const [apiKeySet, setApiKeySet] = useState<Partial<Record<Provider, boolean>>>({})
  const [showApiKey, setShowApiKey] = useState(false)
  const [validation, setValidation] = useState<ValidationState>({ status: "loading" })

  // Load current settings from backend on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: BackendConfig) => {
        if (data.provider) setProvider(data.provider as Provider)
        // Populate non-sensitive fields (model, endpoint, etc.) from backend
        const newForm = { ...emptyForm }
        const newApiKeySet: Partial<Record<Provider, boolean>> = {}
        for (const [p, cfg] of Object.entries(data.config ?? {})) {
          const prov = p as Provider
          newApiKeySet[prov] = cfg.apiKeySet as boolean
          // Merge non-apiKey fields into form
          const existing = newForm[prov] as Record<string, string>
          for (const [k, v] of Object.entries(cfg)) {
            if (k !== "apiKeySet" && k !== "apiKey") existing[k] = v as string
          }
        }
        setApiKeySet(newApiKeySet)
        setForm(newForm)
        setValidation({ status: "idle" })
      })
      .catch(() => setValidation({ status: "idle" }))
  }, [])

  const updateField = (field: string, value: string) => {
    setValidation({ status: "idle" })
    setForm((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value },
    }))
  }

  const handleSave = async () => {
    setValidation({ status: "validating" })
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, config: form }),
      })
      const data = await res.json()
      if (data.valid) {
        // Mark API key as set for the active provider if a key was entered
        const enteredKey = (form[provider] as Record<string, string>)["apiKey"]
        if (enteredKey?.trim()) {
          setApiKeySet((prev) => ({ ...prev, [provider]: true }))
          // Clear the key from the form so we never hold it in memory longer than needed
          setForm((prev) => ({
            ...prev,
            [provider]: { ...prev[provider], apiKey: "" },
          }))
        }
        setValidation({ status: "valid" })
      } else {
        setValidation({ status: "invalid", error: data.error ?? "Überprüfung fehlgeschlagen." })
      }
    } catch {
      setValidation({ status: "invalid", error: "Verbindung zum Server fehlgeschlagen." })
    }
  }

  const currentConfig = form[provider] as Record<string, string>
  const hasStoredKey = apiKeySet[provider] ?? false

  if (validation.status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Wählen Sie einen KI-Provider und konfigurieren Sie die Zugangsdaten.
          API-Keys werden ausschließlich auf dem Server gespeichert.
        </p>
      </div>

      <Separator />

      {/* Provider Selection */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-medium">KI-Provider</h2>
          <p className="text-sm text-muted-foreground">
            Der gewählte Provider wird für alle Chat-Anfragen verwendet.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {providers.map(({ id, name, description, Icon }) => (
            <button
              key={id}
              onClick={() => { setProvider(id); setShowApiKey(false); setValidation({ status: "idle" }) }}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                provider === id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card"
              )}
            >
              <Icon className={cn("size-5", provider === id ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className={cn("text-sm font-medium", provider === id && "text-primary")}>{name}</p>
                <p className="text-xs text-muted-foreground leading-tight">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Provider Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {providers.find((p) => p.id === provider)?.name} konfigurieren
          </CardTitle>
          <CardDescription>
            {provider === "ollama"
              ? "Kein API-Key erforderlich. Stellen Sie sicher, dass Ollama lokal läuft."
              : "API-Keys werden sicher auf dem Server gespeichert und nie an den Browser zurückgegeben."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* OpenAI */}
          {provider === "openai" && (
            <>
              <ApiKeyField
                value={currentConfig.apiKey ?? ""}
                isAlreadySet={hasStoredKey}
                show={showApiKey}
                onToggle={() => setShowApiKey((v) => !v)}
                onChange={(v) => updateField("apiKey", v)}
              />
              <ModelField id="openai-model" placeholder="gpt-4o" value={currentConfig.model ?? ""} onChange={(v) => updateField("model", v)} />
            </>
          )}

          {/* Gemini */}
          {provider === "gemini" && (
            <>
              <ApiKeyField
                value={currentConfig.apiKey ?? ""}
                isAlreadySet={hasStoredKey}
                show={showApiKey}
                onToggle={() => setShowApiKey((v) => !v)}
                onChange={(v) => updateField("apiKey", v)}
              />
              <ModelField id="gemini-model" placeholder="gemini-2.0-flash" value={currentConfig.model ?? ""} onChange={(v) => updateField("model", v)} />
            </>
          )}

          {/* Claude */}
          {provider === "claude" && (
            <>
              <ApiKeyField
                value={currentConfig.apiKey ?? ""}
                isAlreadySet={hasStoredKey}
                show={showApiKey}
                onToggle={() => setShowApiKey((v) => !v)}
                onChange={(v) => updateField("apiKey", v)}
              />
              <ModelField id="claude-model" placeholder="claude-sonnet-4-6" value={currentConfig.model ?? ""} onChange={(v) => updateField("model", v)} />
            </>
          )}

          {/* Azure */}
          {provider === "azure" && (
            <>
              <ApiKeyField
                value={currentConfig.apiKey ?? ""}
                isAlreadySet={hasStoredKey}
                show={showApiKey}
                onToggle={() => setShowApiKey((v) => !v)}
                onChange={(v) => updateField("apiKey", v)}
              />
              <div className="space-y-1.5">
                <Label htmlFor="azure-endpoint">Endpoint URL</Label>
                <Input
                  id="azure-endpoint"
                  placeholder="https://your-resource.openai.azure.com/"
                  value={currentConfig.endpoint ?? ""}
                  onChange={(e) => updateField("endpoint", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="azure-deployment">Deployment Name</Label>
                  <Input
                    id="azure-deployment"
                    placeholder="gpt-4o"
                    value={currentConfig.deploymentName ?? ""}
                    onChange={(e) => updateField("deploymentName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="azure-api-version">API Version</Label>
                  <Input
                    id="azure-api-version"
                    placeholder="2024-02-01"
                    value={currentConfig.apiVersion ?? ""}
                    onChange={(e) => updateField("apiVersion", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Ollama */}
          {provider === "ollama" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ollama-url">Base URL</Label>
                <Input
                  id="ollama-url"
                  placeholder="http://localhost:11434"
                  value={currentConfig.baseUrl ?? ""}
                  onChange={(e) => updateField("baseUrl", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ollama-model">Modellname</Label>
                <Input
                  id="ollama-model"
                  placeholder="llama3.2, mistral, phi4, ..."
                  value={currentConfig.modelName ?? ""}
                  onChange={(e) => updateField("modelName", e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Validation feedback */}
      {validation.status !== "idle" && (
        <div className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
          validation.status === "validating" && "border-border bg-muted/40 text-muted-foreground",
          validation.status === "valid" && "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
          validation.status === "invalid" && "border-destructive/40 bg-destructive/5 text-destructive",
        )}>
          {validation.status === "validating" && <Loader2 className="size-4 mt-0.5 shrink-0 animate-spin" />}
          {validation.status === "valid"      && <Check className="size-4 mt-0.5 shrink-0" />}
          {validation.status === "invalid"    && <X className="size-4 mt-0.5 shrink-0" />}
          <span>
            {validation.status === "validating" && "Verbindung wird überprüft…"}
            {validation.status === "valid"      && "Verbindung erfolgreich. Einstellungen gespeichert."}
            {validation.status === "invalid"    && validation.error}
          </span>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={validation.status === "validating"}
          className="min-w-44"
        >
          {validation.status === "validating" ? (
            <><Loader2 className="size-4 animate-spin" /> Wird überprüft…</>
          ) : (
            "Speichern & überprüfen"
          )}
        </Button>
      </div>
    </div>
  )
}

function ApiKeyField({
  value, isAlreadySet, show, onToggle, onChange,
}: {
  value: string
  isAlreadySet: boolean
  show: boolean
  onToggle: () => void
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="api-key">API Key</Label>
      <div className="relative">
        <Input
          id="api-key"
          type={show ? "text" : "password"}
          placeholder={isAlreadySet ? "Bereits gesetzt — neu eingeben zum Ändern" : "sk-..."}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-9"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {isAlreadySet && !value && (
        <p className="text-xs text-muted-foreground">API Key ist gesetzt. Feld leer lassen, um ihn beizubehalten.</p>
      )}
    </div>
  )
}

function ModelField({ id, placeholder, value, onChange }: {
  id: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Modell</Label>
      <Input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
