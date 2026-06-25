"use client"

import { useCallback, useMemo, useState } from "react"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import type { Appearance } from "@stripe/stripe-js"
import { CreditCard, Loader2, Lock, Settings, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { getStripePromise } from "@/lib/stripe-client"

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const appearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1a1a1a",
    fontFamily: "inherit",
    borderRadius: "10px",
  },
}

interface ManageCardProps {
  customerId: string
  subscriptionId: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: number | null
  paymentMethod: { type: string | null; brand: string | null; last4: string | null; email: string | null } | null
  onRefresh: () => void
}

export function MembershipManageCard({
  customerId,
  subscriptionId,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  paymentMethod,
  onRefresh,
}: ManageCardProps) {
  const stripePromise = useMemo(() => getStripePromise(), [])

  // Card-update flow state.
  const [editingCard, setEditingCard] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [startingCard, setStartingCard] = useState(false)

  // Cancel / resume flow state.
  const [cancelling, setCancelling] = useState(false)
  const [resuming, setResuming] = useState(false)

  const startCardUpdate = useCallback(async () => {
    if (!stripePromise) {
      toast.error("Card updates are unavailable in demo mode.")
      return
    }
    setStartingCard(true)
    try {
      const res = await fetch("/api/membership/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) {
        toast.error(data.error ?? "Unable to start card update.")
        return
      }
      setClientSecret(data.clientSecret)
      setEditingCard(true)
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setStartingCard(false)
    }
  }, [customerId, stripePromise])

  const closeCardEditor = useCallback(() => {
    setEditingCard(false)
    setClientSecret(null)
  }, [])

  const onCardSaved = useCallback(() => {
    closeCardEditor()
    toast.success("Your payment method has been updated.")
    onRefresh()
  }, [closeCardEditor, onRefresh])

  const handleCancel = useCallback(async () => {
    if (!subscriptionId) return
    setCancelling(true)
    try {
      const res = await fetch("/api/membership/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Unable to cancel your membership.")
        return
      }
      toast.success("Auto-renew turned off. You keep access until your term ends.")
      onRefresh()
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setCancelling(false)
    }
  }, [subscriptionId, onRefresh])

  const handleResume = useCallback(async () => {
    if (!subscriptionId) return
    setResuming(true)
    try {
      const res = await fetch("/api/membership/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, resume: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Unable to resume your membership.")
        return
      }
      toast.success("Membership resumed — auto-renew is back on.")
      onRefresh()
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setResuming(false)
    }
  }, [subscriptionId, onRefresh])

  // Paying with Link saves a Link wallet (type "link") which has no card
  // brand/last4 — show it as "Link" with the account email rather than the
  // misleading "No card on file".
  const isLink = paymentMethod?.type === "link"
  const cardLabel = paymentMethod?.last4
    ? `${(paymentMethod.brand ?? "card").toUpperCase()} •••• ${paymentMethod.last4}`
    : isLink
      ? "Link"
      : "No card on file"
  const cardSublabel =
    isLink && paymentMethod?.email ? `Link wallet · ${paymentMethod.email}` : "Used for membership renewals"

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/40 p-5">
      <div className="flex items-start gap-3">
        <Settings className="mt-0.5 h-5 w-5 shrink-0 text-linen" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Manage your membership</p>
          <p className="text-xs text-muted-foreground">
            Update your saved card or stop auto-renew. No Stripe redirect needed.
          </p>
        </div>
      </div>

      {/* Payment method row */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linen/15 text-linen">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="mr-auto">
          <p className="text-sm font-medium text-foreground">{cardLabel}</p>
          <p className="text-xs text-muted-foreground">{cardSublabel}</p>
        </div>
        {!editingCard && (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={startCardUpdate}
            disabled={startingCard}
          >
            {startingCard ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                Loading…
              </>
            ) : (
              "Update card"
            )}
          </Button>
        )}
      </div>

      {/* Inline Payment Element for the new card */}
      {editingCard && clientSecret && stripePromise && (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Add a new card</p>
            <button
              type="button"
              onClick={closeCardEditor}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </button>
          </div>
          <Elements stripe={stripePromise} options={{ clientSecret, appearance }} key={clientSecret}>
            <UpdateCardForm customerId={customerId} subscriptionId={subscriptionId} onSaved={onCardSaved} />
          </Elements>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Secure card update
          </div>
        </div>
      )}

      {/* Cancel / resume row */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="mr-auto text-xs text-muted-foreground">
          {cancelAtPeriodEnd
            ? `Auto-renew is off. You keep full access${
                currentPeriodEnd ? ` until ${formatDate(currentPeriodEnd)}` : ""
              }.`
            : "Cancelling stops auto-renew at the end of your term. Memberships are non-refundable."}
        </p>
        {cancelAtPeriodEnd ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={handleResume}
            disabled={resuming || !subscriptionId}
          >
            {resuming ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                Resuming…
              </>
            ) : (
              "Resume membership"
            )}
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="rounded-full text-destructive hover:text-destructive"
                disabled={cancelling || !subscriptionId}
              >
                {cancelling ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                    Cancelling…
                  </>
                ) : (
                  "Cancel membership"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop auto-renew?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your Edit Club membership will stay active
                  {currentPeriodEnd ? ` until ${formatDate(currentPeriodEnd)}` : " until the end of your current term"},
                  then it won&apos;t renew. You won&apos;t be charged again and this term is non-refundable. You can
                  resume any time before it ends.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep membership</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel}>Turn off auto-renew</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}

// Renders the Stripe Payment Element for a SetupIntent and confirms it inline,
// then asks the server to set the saved card as the default for renewals.
function UpdateCardForm({
  customerId,
  subscriptionId,
  onSaved,
}: {
  customerId: string
  subscriptionId: string | null
  onSaved: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!stripe || !elements) return
    setError(null)
    setSaving(true)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? "Please check your card details.")
      setSaving(false)
      return
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    })

    if (confirmError) {
      setError(confirmError.message ?? "Your card couldn't be saved.")
      setSaving(false)
      return
    }

    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError("Your card needs another step to finish. Please try again.")
      setSaving(false)
      return
    }

    try {
      const res = await fetch("/api/membership/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent.id, customerId, subscriptionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Unable to save the new card.")
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setError("Something went wrong saving your card. Please try again.")
      setSaving(false)
    }
  }

  return (
    <div>
      <PaymentElement options={{ layout: "tabs" }} onReady={() => setReady(true)} />
      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
      )}
      <Button
        onClick={handleSave}
        disabled={!stripe || !ready || saving}
        className="mt-4 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          "Save new card"
        )}
      </Button>
    </div>
  )
}
