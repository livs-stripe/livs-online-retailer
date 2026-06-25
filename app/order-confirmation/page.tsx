import Link from "next/link"
import { Truck, Sparkles, RotateCcw } from "lucide-react"
import { Header } from "@/components/adairs/header"
import { Button } from "@/components/ui/button"
import { getStripe } from "@/lib/stripe"

// Always display in AUD ("A$") for currency consistency across the storefront,
// regardless of the session's underlying settlement currency.
function formatMoney(amount: number, _currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "AUD",
  }).format(amount / 100)
}

export default async function OrderConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams
  const stripe = getStripe()

  let total: string | null = null
  let email: string | null = null

  if (stripe && session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id)
      if (session.amount_total != null) {
        total = formatMoney(session.amount_total, session.currency ?? "usd")
      }
      email = session.customer_details?.email ?? null
    } catch {
      // ignore — fall back to generic confirmation
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="animate-fade-up mx-auto max-w-xl px-4 pb-20 pt-16 text-center sm:px-6">
          <span className="animate-check-circle mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent">
            <svg viewBox="0 0 52 52" className="h-10 w-10" aria-hidden="true">
              <path
                className="animate-check-draw"
                fill="none"
                stroke="var(--accent-foreground)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 27 l8 8 l16 -18"
              />
            </svg>
          </span>

          <h1 className="mt-6 text-balance font-serif text-4xl text-foreground">Your Adairs order is confirmed!</h1>
          <p className="mx-auto mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
            Your curated collection is on its way. {email ? `A receipt has been sent to ${email}.` : ""}
          </p>

          {total && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
              <span className="text-sm text-muted-foreground">Total paid</span>
              <span className="font-serif text-2xl text-foreground">{total}</span>
            </div>
          )}

          <div className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-foreground">
            <Truck className="h-4 w-4 text-accent" aria-hidden="true" />
            Estimated delivery: <span className="font-medium">3–7 business days</span>
          </div>

          <div className="mt-8 flex justify-center">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-accent text-base font-medium text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/">
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Style Another Room
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
