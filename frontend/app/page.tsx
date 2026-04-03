import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MessageSquare, Upload, Settings } from "lucide-react"

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl space-y-6">
        {/* Hero */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge>Beta</Badge>
              <span className="text-xs text-muted-foreground">RT-Vector v0.1</span>
            </div>
            <CardTitle className="text-2xl">Willkommen beim RAG System</CardTitle>
            <CardDescription>
              Laden Sie Dokumente hoch und stellen Sie Fragen — das System findet die
              relevanten Passagen und antwortet präzise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
              <MessageSquare className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Chat-Bereich kommt bald</p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="transition-colors hover:border-primary/40">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Upload className="size-4 text-primary" />
                <CardTitle className="text-base">Dokumente hochladen</CardTitle>
              </div>
              <CardDescription>PDFs, Word-Dateien und mehr indizieren</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/upload">Zum Upload</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/40">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-primary" />
                <CardTitle className="text-base">Einstellungen</CardTitle>
              </div>
              <CardDescription>KI-Provider und API-Keys konfigurieren</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/settings">Konfigurieren</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
