import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { Header } from "@/components/Header"
import { IngestProvider } from "@/lib/ingest-context"
import { IngestProgress } from "@/components/IngestProgress"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "RT-Vector | RAG System",
  description: "Retrieval Augmented Generation — Dokumente hochladen und per Chat befragen",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <IngestProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <IngestProgress />
        </IngestProvider>
      </body>
    </html>
  )
}
