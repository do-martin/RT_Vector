import * as http from "node:http"
import { NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8000"

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
])

const MAX_BYTES = 50 * 1024 * 1024

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file")

  if (!(file instanceof File))
    return Response.json({ error: "Keine Datei übermittelt." }, { status: 400 })
  if (file.size > MAX_BYTES)
    return Response.json({ error: "Datei überschreitet 50 MB." }, { status: 400 })
  if (!ALLOWED_MIME_TYPES.has(file.type))
    return Response.json({ error: `Dateityp '${file.type}' wird nicht unterstützt.` }, { status: 400 })

  const fileBytes = Buffer.from(await file.arrayBuffer())
  const safeName = file.name.replace(/[\r\n"]/g, "_")
  const boundary = "----FormBoundary" + Date.now().toString(36)

  // Build multipart body with file + all text fields
  const parts: Buffer[] = []

  // File part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
    `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
  ))
  parts.push(fileBytes)
  parts.push(Buffer.from("\r\n"))

  // Text fields forwarded from formData
  const textFields = [
    "method", "chunk_size", "chunk_overlap",
    "sentences_per_chunk", "paragraphs_per_chunk",
    "window_size", "step_size",
    "token_size", "token_overlap",
  ]
  for (const name of textFields) {
    const val = formData.get(name)
    if (val !== null) {
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${val}\r\n`
      ))
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`))
  const body = Buffer.concat(parts)

  const parsed = new URL(BACKEND_URL)

  return new Promise<Response>((resolve) => {
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || "8000",
      path: "/api/v1/chunk-preview",
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    }

    const backendReq = http.request(options, (backendRes) => {
      let raw = ""
      backendRes.setEncoding("utf8")
      backendRes.on("data", (chunk: string) => { raw += chunk })
      backendRes.on("end", () => {
        try {
          const data = JSON.parse(raw)
          resolve(Response.json(data, { status: backendRes.statusCode ?? 200 }))
        } catch {
          resolve(Response.json({ error: "Ungültige Antwort vom Backend." }, { status: 502 }))
        }
      })
      backendRes.on("error", () =>
        resolve(Response.json({ error: "Fehler beim Lesen der Backend-Antwort." }, { status: 502 }))
      )
    })

    backendReq.on("error", () =>
      resolve(Response.json({ error: "Backend nicht erreichbar." }, { status: 502 }))
    )
    backendReq.write(body)
    backendReq.end()
  })
}
