import { NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8000"

function sseError(error: string): Response {
  const event = `data: ${JSON.stringify({ type: "error", error })}\n\n`
  return new Response(event, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return sseError("Ungültige Anfrage.")
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    })
  } catch {
    return sseError("Backend nicht erreichbar.")
  }
}
