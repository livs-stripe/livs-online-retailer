"use client"

import { useState } from "react"
import { Mail, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LS_CUSTOMER_ID } from "@/lib/membership"

interface MembershipJoinGateProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Called when the email is NOT already a member, so the caller can proceed
  // with the normal join checkout (optionally pre-filling the entered email).
  onProceed: (email: string) => void
}

// Shown before a shopper joins The Edit Club. We capture their email up front and
// check whether they're ALREADY a member. If they are, we sign them in to their
// existing membership rather than letting them buy a second one (no duplicate
// memberships). Otherwise we hand back control to start the normal join.
export function MembershipJoinGate({ open, onOpenChange, onProceed }: MembershipJoinGateProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setLoading(true)
    setError(null)
    // Never let the button spin forever — abort the check after 15s and let the
    // shopper retry or continue.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch("/api/membership/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Couldn't check that email. Please try again.")
        setLoading(false)
        return
      }

      if (data.isMember && data.customerId) {
        // Already an Edit Club member — sign them in to their existing membership
        // instead of creating a duplicate. A full navigation lets the My Linen
        // Lovers page load their dashboard (purchases + invoices) from the
        // stored customer id.
        localStorage.setItem(LS_CUSTOMER_ID, data.customerId)
        toast.success(
          `You're already an Edit Club member${data.name ? `, ${String(data.name).split(" ")[0]}` : ""} — signing you in.`,
        )
        window.location.assign("/edit-club/membership")
        return
      }

      // Not a member yet — proceed with the normal join.
      onProceed(value)
      onOpenChange(false)
      setEmail("")
    } catch (err) {
      clearTimeout(timeout)
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "That took too long. Please check your connection and try again."
          : "Couldn't check that email. Please try again.",
      )
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-linen/15 text-linen">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center font-serif text-2xl">Join The Edit Club</DialogTitle>
          <DialogDescription className="text-center text-pretty">
            Enter your email to get started. If you&apos;re already a member, we&apos;ll take you straight to your
            account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-3">
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              placeholder="you@example.com"
              aria-label="Your email"
              className="rounded-full pl-9"
            />
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full rounded-full bg-linen text-linen-foreground hover:bg-linen/90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
