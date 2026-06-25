"use client"

import { useState } from "react"
import { HelpCircle, ChevronLeft } from "lucide-react"
import { AboutModal } from "./about-modal"

export function Header({ onHome }: { onHome?: () => void }) {
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {onHome && (
            <button
              type="button"
              onClick={onHome}
              className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              aria-label="Back to Aster & Hem home"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Shop</span>
            </button>
          )}
          <button
            type="button"
            onClick={onHome}
            className="flex items-center"
            aria-label="Aster & Hem home"
            disabled={!onHome}
          >
            <span className="font-serif text-[1.85rem] font-medium leading-none tracking-tight text-foreground">
              Aster &amp; Hem
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-block">
            Personal Stylist · ACS Demo
          </span>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
            aria-label="About this demo"
          >
            <HelpCircle className="h-4 w-4 text-accent" aria-hidden="true" />
            About
          </button>
        </div>
      </div>
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
    </header>
  )
}
