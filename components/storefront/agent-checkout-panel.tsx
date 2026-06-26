"use client"

import { useEffect, useMemo, useState } from "react"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import type { Appearance } from "@stripe/stripe-js"
import { Sparkles, Check, Loader2, Lock, Truck, Store, ChevronLeft, ShieldCheck, BadgePercent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatUsd } from "@/lib/format"
import { computeAgentPrice, isValidLinenNumber, STANDARD_SHIPPING, FREE_SHIP_THRESHOLD_MEMBER } from "@/lib/shipping"
import { LS_CUSTOMER_ID } from "@/lib/membership"
import { DEMO_MEMBERSHIP } from "@/lib/demo-membership"
import { getStripePromise } from "@/lib/stripe-client"
import type { AgentOrder, Product } from "@/lib/types"

interface AgentCheckoutPanelProps {
  products: Product[]
  budget: number | null
  onBack: () => void
  onComplete: (order: AgentOrder) => void
}

type Fulfillment = "delivery" | "pickup"

const AGENT = "aster_hem_stylist"

// In-chat checkout rendered INLINE inside the Stylist chat panel. The buyer pays
// with real Stripe payment methods (Link, Apple/Google Pay or card) via the
// Stripe Payment Element — no Shared Payment Token indirection. The "agent" touch
// is kept light: the Stylist curates the look, the buyer pays for it directly.
export function AgentCheckoutPanel({ products, budget, onBack, onComplete }: AgentCheckoutPanelProps) {
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [initializing, setInitializing] = useState(true)
  // Locks fulfilment + actions while a payment is in flight.
  const [paying, setPaying] = useState(false)
  // Edit Club membership: the typed value, the validated/applied number, and
  // any inline validation error.
  const [linenInput, setLinenInput] = useState("")
  const [appliedLinen, setAppliedLinen] = useState<string | null>(null)
  const [linenError, setLinenError] = useState<string | null>(null)
  // Auto-detected membership for a logged-in member (from their Stripe customer).
  // When set, the discount applies automatically and the manual entry is hidden.
  const [autoMemberId, setAutoMemberId] = useState<string | null>(null)
  // Gates PaymentIntent creation until membership detection finishes so the
  // displayed price and the charged amount agree on the very first render.
  const [memberResolved, setMemberResolved] = useState(false)
  // Customer session secret that lets the Payment Element show saved methods.
  const [customerSessionSecret, setCustomerSessionSecret] = useState<string | null>(null)

  const isMember = appliedLinen !== null

  // Price the order client-side with the SAME helper the server uses, so the
  // breakdown shown always matches the amount charged.
  const priceItems = useMemo(
    () => products.map((p) => ({ price: p.price, quantity: 1, onSale: false })),
    [products],
  )
  const { subtotal, memberDiscount, shipping, total, freeShipThreshold } = computeAgentPrice({
    items: priceItems,
    fulfillment,
    isMember,
  })

  function applyLinen() {
    const value = linenInput.trim()
    if (!isValidLinenNumber(value)) {
      setLinenError("Enter a valid Edit Club number (e.g. LL-123).")
      return
    }
    setLinenError(null)
    setAppliedLinen(value)
  }

  function removeLinen() {
    setAppliedLinen(null)
    setLinenInput("")
    setLinenError(null)
  }

  const stripePromise = useMemo(() => getStripePromise(), [])

  // Auto-apply Amy's Edit Club membership on mount with a brief delay
  // so the user sees it populate (makes it feel like a real lookup).
  useEffect(() => {
    const timer = setTimeout(() => {
      setAutoMemberId(DEMO_MEMBERSHIP.memberId)
      setAppliedLinen(DEMO_MEMBERSHIP.memberId)
      setMemberResolved(true)
    }, 600)
    return () => clearTimeout(timer)
  }, [])

  // Create the PaymentIntent (and refresh its amount when fulfilment changes).
  // Gated on membership detection so the first intent uses the correct pricing.
  // The server prices the order — we never send an amount.
  useEffect(() => {
    if (!memberResolved) return
    let cancelled = false
    async function sync() {
      try {
        const res = await fetch("/api/agent/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cartItems: products.map((p) => ({ productId: p.id, quantity: 1 })),
            fulfillment,
            linenNumber: appliedLinen ?? undefined,
            paymentIntentId: paymentIntentId ?? undefined,
            // Attach the logged-in member's customer so the order lands in their
            // purchase history and powers personalised Stylist recommendations.
            customerId: typeof window !== "undefined" ? localStorage.getItem(LS_CUSTOMER_ID) : null,
          }),
        })
        const data = await res.json()
        if (cancelled) return
        setDemoMode(Boolean(data.demoMode))
        if (data.clientSecret) setClientSecret(data.clientSecret)
        if (data.paymentIntentId) setPaymentIntentId(data.paymentIntentId)
        if (data.customerSessionClientSecret) setCustomerSessionSecret(data.customerSessionClientSecret)
      } catch {
        if (!cancelled) setDemoMode(true)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }
    sync()
    return () => {
      cancelled = true
    }
    // Re-run when fulfilment or membership changes; paymentIntentId is
    // intentionally omitted so the effect updates the existing intent rather than
    // looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, appliedLinen, memberResolved])

  function buildOrder(live: boolean, intentId: string | null, methodLabel: string): AgentOrder {
    return {
      id: intentId ?? `acs_order_${Date.now().toString(36)}`,
      status: "authorized",
      amount: total,
      currency: "usd",
      sharedPaymentToken: "",
      paymentMethodLabel: methodLabel,
      itemCount: products.length,
      live,
      agent: AGENT,
      paymentIntentId: intentId,
      spendCap: total,
      singleUse: false,
    }
  }

  // Demo fallback (no Stripe keys) — simulate a successful payment so the chat
  // experience still completes in the preview.
  async function payDemo() {
    setPaying(true)
    await new Promise((r) => setTimeout(r, 1100))
    onComplete(buildOrder(false, null, "Visa •••• 4242"))
  }

  const appearance: Appearance = {
    theme: "stripe",
    variables: {
      colorPrimary: "#8a6d4b",
      fontFamily: "inherit",
      borderRadius: "12px",
      fontSizeBase: "15px",
    },
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          disabled={paying}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-secondary disabled:opacity-40"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4 text-foreground" aria-hidden="true" />
        </button>
        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">Stylist Checkout</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Look summary — light agent touch */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">
              {products.length === 1 ? products[0].name : "Your curated look"}
            </p>
            <p className="text-xs text-muted-foreground">
              {products.length === 1 ? "single piece" : `${products.length} pieces`} · your Stylist&apos;s pick
              {budget !== null && total <= budget ? ` · within your ${formatUsd(budget)} budget` : ""}
            </p>
          </div>
          <span className="shrink-0 font-serif text-xl text-foreground">{formatUsd(total)}</span>
        </div>

        {/* Fulfilment: deliver or collect in store */}
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Fulfilment</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { id: "delivery" as const, label: "Delivery", icon: Truck },
                { id: "pickup" as const, label: "Pick up in store", icon: Store },
              ]
            ).map(({ id, label, icon: Icon }) => {
              const active = fulfillment === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFulfillment(id)}
                  aria-pressed={active}
                  disabled={paying}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                    active ? "border-accent bg-accent/5" : "border-border bg-background hover:bg-secondary",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {id === "pickup"
                      ? "Free · ready today"
                      : subtotal >= freeShipThreshold
                        ? "Free standard"
                        : `${formatUsd(STANDARD_SHIPPING)} standard`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Edit Club membership */}
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">The Edit Club</p>
          {isMember ? (
            <div className="mt-2 rounded-xl border border-[#C4714A]/30 bg-[#C4714A]/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C4714A] text-[10px] font-bold text-white">
                    G
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1C1C1C]">
                      {DEMO_MEMBERSHIP.memberName}
                    </p>
                    <p className="text-[11px] text-[#1C1C1C]/50">
                      {DEMO_MEMBERSHIP.tier} Member · {DEMO_MEMBERSHIP.memberId}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[#C4714A]">
                    {DEMO_MEMBERSHIP.pointsBalance} pts
                  </p>
                  <p className="text-[10px] text-[#1C1C1C]/40">
                    Edit Club Points
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-[#C4714A]/10 px-2 py-0.5 text-[10px] text-[#C4714A]">
                  10% off applied
                </span>
                <span className="rounded-full bg-[#C4714A]/10 px-2 py-0.5 text-[10px] text-[#C4714A]">
                  Free delivery
                </span>
                <span className="rounded-full bg-[#C4714A]/10 px-2 py-0.5 text-[10px] text-[#C4714A]">
                  Early access
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={linenInput}
                readOnly
                placeholder="Edit Club number"
                aria-label="Edit Club number"
                disabled
                className="h-10 flex-1 rounded-xl opacity-60"
              />
              <Button
                type="button"
                variant="outline"
                disabled
                className="h-10 rounded-xl px-4 opacity-60"
              >
                Applying…
              </Button>
            </div>
          )}
        </div>

        {/* Price breakdown */}
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-foreground">
              {memberDiscount > 0 ? (
                <span>
                  <span className="mr-1 text-xs text-[#1C1C1C]/30 line-through">{formatUsd(subtotal)}</span>
                  {formatUsd(subtotal - memberDiscount)}
                </span>
              ) : (
                formatUsd(subtotal)
              )}
            </dd>
          </div>
          {memberDiscount > 0 && (
            <div className="flex items-center justify-between text-xs text-[#C4714A]">
              <dt>Edit Club 10% saving</dt>
              <dd>−{formatUsd(memberDiscount)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{fulfillment === "pickup" ? "Pick up in store" : "Delivery"}</dt>
            <dd className={isMember && shipping === 0 ? "font-medium text-[#C4714A]" : "text-foreground"}>
              {shipping === 0 ? (isMember ? "Free · Gold member" : "Free") : formatUsd(shipping)}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1.5 font-medium">
            <dt className="text-foreground">Total</dt>
            <dd className="font-serif text-base text-foreground">{formatUsd(total)}</dd>
          </div>
        </dl>

        {/* Payment */}
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Payment</p>
          <div className="mt-2">
            {initializing ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading secure payment…
              </div>
            ) : clientSecret && stripePromise && !demoMode ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  ...(customerSessionSecret ? { customerSessionClientSecret: customerSessionSecret } : {}),
                  appearance,
                }}
                // Remount only if the intent itself changes (it won't for amount
                // updates, which keep the same clientSecret).
                key={clientSecret}
              >
                <PaymentForm
                  total={total}
                  disabled={paying}
                  onPaying={setPaying}
                  onPaid={(intentId, label) => onComplete(buildOrder(true, intentId, label))}
                />
              </Elements>
            ) : (
              <DemoPayment total={total} paying={paying} onPay={payDemo} />
            )}
          </div>
        </div>
      </div>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Secured by Stripe · Link, Apple Pay, Google Pay &amp; card
      </div>
    </div>
  )
}

// Real Stripe payment form — renders the Payment Element (Link, wallets, card)
// and confirms the PaymentIntent inline without leaving the chat.
function PaymentForm({
  total,
  disabled,
  onPaying,
  onPaid,
}: {
  total: number
  disabled: boolean
  onPaying: (v: boolean) => void
  onPaid: (intentId: string | null, methodLabel: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setError(null)
    onPaying(true)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? "Please check your payment details.")
      onPaying(false)
      return
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation`,
      },
      // Keep the buyer in the chat for card/Link; only redirect if a method
      // strictly requires it.
      redirect: "if_required",
    })

    if (confirmError) {
      setError(confirmError.message ?? "Your payment couldn't be completed.")
      onPaying(false)
      return
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      const label =
        typeof paymentIntent.payment_method === "string" ? "your payment method" : "Link / card"
      onPaid(paymentIntent.id, label)
      return
    }

    setError("Your payment needs another step to finish. Please try again.")
    onPaying(false)
  }

  return (
    <div>
      {/* Pure inline card form. No LinkAuthenticationElement: a known Link email
          would trigger Link's hosted verification window, which can't render in
          our cross-origin iframe and gets pushed out to a new tab. Card details
          are entered directly in chat instead. */}
      <PaymentElement
        options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }}
        onReady={() => setReady(true)}
      />
      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
      )}
      <Button
        onClick={handlePay}
        disabled={!stripe || !ready || disabled}
        className="mt-4 h-12 w-full rounded-xl bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90"
      >
        {disabled ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Processing…
          </>
        ) : (
          <>Pay {formatUsd(total)}</>
        )}
      </Button>
    </div>
  )
}

// Shown when Stripe keys aren't configured — a faithful stand-in so the in-chat
// checkout still completes in the preview.
function DemoPayment({ total, paying, onPay }: { total: number; paying: boolean; onPay: () => void }) {
  return (
    <div>
      <div className="rounded-xl border border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
          Demo payment
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Add your Stripe keys to accept Link, Apple Pay, Google Pay and cards here. For now this completes a simulated
          order so you can see the full flow.
        </p>
      </div>
      <Button
        onClick={onPay}
        disabled={paying}
        className="mt-4 h-12 w-full rounded-xl bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90"
      >
        {paying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Processing…
          </>
        ) : (
          <>Pay {formatUsd(total)}</>
        )}
      </Button>
    </div>
  )
}
