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

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function sseError(message: string): Response {
  const event = `data: ${JSON.stringify({ stage: "error", message, error: true, progress: 0, elapsed: 0 })}\n\n`
  return new Response(event, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  })
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) return sseError("Keine Datei übermittelt.")
  if (file.size > MAX_BYTES) return sseError("Datei überschreitet die maximale Größe von 50 MB.")
  if (!ALLOWED_MIME_TYPES.has(file.type)) return sseError(`Dateityp '${file.type}' wird nicht unterstützt.`)

  // Read file bytes once
  const fileBytes = Buffer.from(await file.arrayBuffer())
  // Sanitise filename to prevent header injection
  const safeName = file.name.replace(/[\r\n"]/g, "_")
  const boundary = "----FormBoundary" + Date.now().toString(36)

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
    `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
  )
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([header, fileBytes, footer])

  const parsed = new URL(BACKEND_URL)

  return new Promise<Response>((resolve) => {
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || "8000",
      path: "/api/v1/ingest",
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    }

    const backendReq = http.request(options, (backendRes) => {
      // Stream SSE response back to the browser with no timeout
      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          backendRes.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
          backendRes.on("end", () => controller.close())
          backendRes.on("error", (err) => controller.error(err))
        },
      })

      resolve(
        new Response(readable, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          },
        })
      )
    })

    backendReq.on("error", () => resolve(sseError("Backend nicht erreichbar.")))
    backendReq.write(body)
    backendReq.end()
  })
}
