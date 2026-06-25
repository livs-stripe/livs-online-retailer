"use client"

import { useEffect, useMemo, useState } from "react"
import { Elements, PaymentElement, ExpressCheckoutElement, useElements, useStripe } from "@stripe/react-stripe-js"
import type { StripeExpressCheckoutElementReadyEvent } from "@stripe/stripe-js"
import type { Appearance, StripeElementsOptions } from "@stripe/stripe-js"
import { Loader2, Lock, ShieldCheck, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getStripePromise } from "@/lib/stripe-client"
import { formatAud } from "@/lib/format"
import type { CartItem } from "@/lib/types"

export interface ElementsCheckoutPayload {
  cartItems: CartItem[]
  shipping: number
  shippingLabel: string
  discountAmount: number
  discountLabel: string
  membershipFee: number
  customerId: string | null
  memberDiscountAmount: number
  // A redeemed Adairs gift card. The coupon (Coupons API) is created at the
  // review step; here it tells the PaymentIntent how much the card already covers.
  giftCardCouponId: string | null
  giftCardAmount: number
}

interface ElementsCheckoutProps {
  // Balance still payable by card after any gift card has been applied.
  total: number
  giftCardAmount: number
  payload: ElementsCheckoutPayload
  onPaid: () => void
}

// Storefront checkout built on the Stripe Payment Element (PaymentIntents API).
// When a gift card has been redeemed, its coupon value is subtracted server-side
// and this Payment Element only collects the remaining balance — the Coupons API
// and the PaymentIntents API settle the order together.
export function ElementsCheckout({ total, giftCardAmount, payload, onPaid }: ElementsCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [fullyCovered, setFullyCovered] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [paying, setPaying] = useState(false)

  const stripePromise = useMemo(() => getStripePromise(), [])

  useEffect(() => {
    let cancelled = false
    async function createIntent() {
      try {
        const res = await fetch("/api/checkout/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (cancelled) return
        setDemoMode(Boolean(data.demoMode))
        setFullyCovered(Boolean(data.fullyCovered))
        if (data.clientSecret) setClientSecret(data.clientSecret)
      } catch {
        if (!cancelled) setDemoMode(true)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }
    createIntent()
    return () => {
      cancelled = true
    }
    // Create the intent once when this checkout mounts; changing the cart sends
    // the shopper back to the review step, which remounts this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const appearance: Appearance = {
    theme: "stripe",
    variables: {
      colorPrimary: "#8a6d4b",
      fontFamily: "inherit",
      borderRadius: "12px",
      fontSizeBase: "15px",
    },
  }

  const options: StripeElementsOptions = clientSecret ? { clientSecret, appearance } : { appearance }

  async function payDemo() {
    setPaying(true)
    await new Promise((r) => setTimeout(r, 1000))
    onPaid()
  }

  if (initializing) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading secure payment…
      </div>
    )
  }

  // The gift card covered the entire order — no card payment is required.
  if (fullyCovered) {
    return <GiftCardOnly giftCardAmount={giftCardAmount} paying={paying} onPay={payDemo} />
  }

  if (!clientSecret || !stripePromise || demoMode) {
    return <DemoPayment total={total} paying={paying} onPay={payDemo} />
  }

  return (
    <div className="flex flex-col gap-4">
      {giftCardAmount > 0 && <GiftCardApiNote giftCardAmount={giftCardAmount} payable={total} />}
      <Elements stripe={stripePromise} options={options} key={clientSecret}>
        <ElementsPaymentForm total={total} paying={paying} onPaying={setPaying} onPaid={onPaid} />
      </Elements>
    </div>
  )
}

// Calls out that two Stripe APIs are co-operating on this single order.
function GiftCardApiNote({ giftCardAmount, payable }: { giftCardAmount: number; payable: number }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Gift className="h-4 w-4 text-accent" aria-hidden="true" />
        Split payment
      </p>
      <div className="mt-2 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            Gift card{" "}
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">Coupons API</span>
          </span>
          <span className="tabular-nums text-foreground">{`\u2212${formatAud(giftCardAmount)}`}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            Card{" "}
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">PaymentIntents API</span>
          </span>
          <span className="tabular-nums text-foreground">{formatAud(payable)}</span>
        </div>
      </div>
    </div>
  )
}

function ElementsPaymentForm({
  total,
  paying,
  onPaying,
  onPaid,
}: {
  total: number
  paying: boolean
  onPaying: (v: boolean) => void
  onPaid: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which express wallets (Apple Pay, Google Pay, Link) the browser/session can
  // actually offer. We only render the express row + divider when at least one
  // is available, so we never show an empty band on unsupported browsers.
  const [expressMethods, setExpressMethods] = useState<string[]>([])

  // Shared confirmation used by BOTH the express wallets and the card button.
  // Submits the Elements group, then confirms the existing PaymentIntent.
  async function confirm() {
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
      confirmParams: { return_url: `${window.location.origin}/checkout/return` },
      redirect: "if_required",
    })

    if (confirmError) {
      setError(confirmError.message ?? "Your payment couldn't be completed.")
      onPaying(false)
      return
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      onPaid()
      return
    }

    setError("Your payment needs another step to finish. Please try again.")
    onPaying(false)
  }

  function handleExpressReady(event: StripeExpressCheckoutElementReadyEvent) {
    setExpressMethods(Object.keys(event.availablePaymentMethods ?? {}))
  }

  const hasExpress = expressMethods.length > 0

  return (
    <div>
      {/* Express wallets (Apple Pay, Google Pay, Link) rendered as peer buttons
          in one row so they're all visible at once — not hidden behind a single
          dominant Link tab. Tapping one confirms the same PaymentIntent the card
          form below uses. The element self-hides any wallet the browser can't
          offer; we track what's available to decide whether to show the divider. */}
      <div className={hasExpress ? "block" : "hidden"}>
        <ExpressCheckoutElement
          options={{ buttonHeight: 48, paymentMethods: { applePay: "always", googlePay: "always" } }}
          onReady={handleExpressReady}
          onConfirm={confirm}
        />
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Or pay with card
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
      </div>

      {/* Inline card form. Wallets are disabled here because the express row
          above already surfaces Apple Pay / Google Pay / Link as clear options;
          this keeps the card entry clean and avoids duplicate wallet buttons. */}
      <PaymentElement
        options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }}
        onReady={() => setReady(true)}
        onChange={() => {
          if (error) setError(null)
        }}
      />

      {error && (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
      )}

      <Button
        onClick={confirm}
        disabled={!ready || paying || !stripe}
        className="mt-4 h-12 w-full rounded-xl bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90"
      >
        {paying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Processing…
          </>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
            Pay {formatAud(total)}
          </>
        )}
      </Button>
    </div>
  )
}

// Shown when a gift card covers the whole order, so there's no card balance left.
function GiftCardOnly({
  giftCardAmount,
  paying,
  onPay,
}: {
  giftCardAmount: number
  paying: boolean
  onPay: () => void
}) {
  return (
    <div>
      <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Gift className="h-4 w-4 text-accent" aria-hidden="true" />
          Paid in full with your gift card
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Your gift card covers this order ({formatAud(giftCardAmount)} applied via the Coupons API). No card payment is
          needed.
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
          <>Place order</>
        )}
      </Button>
    </div>
  )
}

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
          order.
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
          <>Pay {formatAud(total)}</>
        )}
      </Button>
    </div>
  )
}
