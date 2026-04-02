"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Chat" },
  { href: "/upload", label: "Dokumente" },
  { href: "/settings", label: "Einstellungen" },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center shrink-0">
          <Image
            src="/informatik-logo.svg"
            alt="Informatik Logo"
            width={180}
            height={37}
            priority
          />
        </Link>
        <nav className="flex items-stretch h-full gap-0.5">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center px-4 text-sm font-medium transition-colors border-b-2",
                pathname === href
                  ? "border-primary text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
