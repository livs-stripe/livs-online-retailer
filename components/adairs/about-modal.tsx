"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Sparkles, Globe, CreditCard, ExternalLink } from "lucide-react"

interface AboutModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const points = [
  {
    icon: Sparkles,
    title: "What is ACS?",
    body: "Stripe's Agentic Commerce Suite lets AI agents and assistants facilitate real purchases inline — no redirects, no hand-offs.",
  },
  {
    icon: CreditCard,
    title: "How AFICI works",
    body: "Agent-Facilitated Inline Commerce Interface embeds Stripe Checkout directly in the experience, so the buyer never leaves the page.",
  },
  {
    icon: Globe,
    title: "Why USD / US account",
    body: "The ACS Preview is currently available to US-based Stripe accounts and transacts in USD, so this demo uses USD line items.",
  },
]

export function AboutModal({ open, onOpenChange }: AboutModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">About this demo</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            A bespoke Adairs experience showcasing Stripe&apos;s Agentic Commerce Suite.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-4">
          {points.map((p) => (
            <div key={p.title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15">
                <p.icon className="h-4 w-4 text-accent" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-foreground">{p.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        <a
          href="https://docs.stripe.com/agentic-commerce"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Read the Stripe ACS docs
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </DialogContent>
    </Dialog>
  )
}
