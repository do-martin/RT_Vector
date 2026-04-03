import { NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8000"

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/documents`)
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json([], { status: 503 })
  }
}
