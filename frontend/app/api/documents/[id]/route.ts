import { NextRequest } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:8000"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/documents/${id}`, { method: "DELETE" })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch {
    return Response.json({ error: "Backend nicht erreichbar." }, { status: 503 })
  }
}
