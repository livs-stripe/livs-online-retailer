import Link from "next/link"
import { CheckCircle2, XCircle, Clock } from "lucide-react"
import { getStripe } from "@/lib/stripe"
import { formatAud } from "@/lib/format"

// Confirmation page shown after a redirect-based payment (Klarna / Afterpay)
// sends the shopper back. Card payments never land here — they complete inline
// in the embedded Checkout. This is a Server Component so the session is read
// straight from Stripe with no client-side fetching.
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id: sessionId } = await searchParams
  const stripe = getStripe()

  let state: "paid" | "processing" | "failed" = "failed"
  let amount: number | null = null
  let email: string | null = null

  if (sessionId && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      email = session.customer_details?.email ?? null
      amount = typeof session.amount_total === "number" ? session.amount_total / 100 : null
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        state = "paid"
      } else if (session.status === "open") {
        // Buyer returned without finishing (or BNPL still authorising).
        state = "processing"
      } else {
        state = "failed"
      }
    } catch {
      state = "failed"
    }
  }

  const content = {
    paid: {
      icon: <CheckCircle2 className="h-12 w-12 text-accent" aria-hidden="true" />,
      title: "Order confirmed",
      body:
        amount != null
          ? `Thanks${email ? `, ${email}` : ""}. Your payment of ${formatAud(amount)} was successful and your order is on its way.`
          : "Thanks! Your payment was successful and your order is on its way.",
    },
    processing: {
      icon: <Clock className="h-12 w-12 text-muted-foreground" aria-hidden="true" />,
      title: "Payment processing",
      body: "Your payment hasn't completed yet. If you didn't finish at the provider, you can return to your cart and try again.",
    },
    failed: {
      icon: <XCircle className="h-12 w-12 text-destructive" aria-hidden="true" />,
      title: "Payment not completed",
      body: "We couldn't confirm your payment. No charge has been made — please return to your cart and try again.",
    },
  }[state]

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {content.icon}
        <h1 className="text-balance font-serif text-2xl text-foreground">{content.title}</h1>
        <p className="text-pretty leading-relaxed text-muted-foreground">{content.body}</p>
        <Link
          href="/"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continue shopping
        </Link>
      </div>
    </main>
  )
}
