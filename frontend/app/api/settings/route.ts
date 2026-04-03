import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8000"

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/settings`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { provider: "openai", config: {}, configured: false },
      { status: 503 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/api/v1/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { valid: false, error: "Backend nicht erreichbar." },
      { status: 503 }
    )
  }
}
