"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowRight,
  CreditCard,
  Download,
  Loader2,
  LogOut,
  Sparkles,
  CalendarClock,
  PiggyBank,
  Mail,
  BadgeCheck,
  ShoppingBag,
  Tag,
  Check,
  FastForward,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SiteChrome } from "@/components/storefront/site-chrome"
import { useCart } from "@/components/storefront/cart-context"
import { MembershipManageCard } from "@/components/storefront/membership-manage-card"
import { StylistChatWidget } from "@/components/storefront/stylist-chat-widget"
import {
  LS_CUSTOMER_ID,
  LS_SUBSCRIPTION_ID,
  ORDER_PLACED_EVENT,
  membershipStatusLabel,
  membershipTone,
  type MembershipData,
  type MembershipStatusTone,
} from "@/lib/membership"
import { MEMBERSHIP_TERM_YEARS } from "@/lib/shipping"

// Always present amounts in AUD ("A$") so currency is consistent with the rest
// of the storefront, regardless of the charge's underlying settlement currency.
function formatMoney(cents: number, _currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100)
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const TONE_DOT: Record<MembershipStatusTone, string> = {
  active: "bg-emerald-500",
  expiring: "bg-amber-500",
  cancelled: "bg-muted-foreground",
}

type View =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "member"; data: MembershipData }

export function MembershipContent() {
  const router = useRouter()
  const { addMembership } = useCart()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")
  const [view, setView] = useState<View>({ status: "loading" })
  const [lookupEmail, setLookupEmail] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const load = useCallback(async (customerId: string): Promise<MembershipData | null> => {
    try {
      const res = await fetch(`/api/membership?customerId=${encodeURIComponent(customerId)}`)
      const data = await res.json()
      if (!res.ok) {
        setView({ status: "error", message: data.error ?? "Unable to load your membership." })
        return null
      }
      setView({ status: "member", data })
      return data as MembershipData
    } catch {
      setView({ status: "error", message: "Something went wrong loading your membership." })
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      // Arriving straight from checkout: confirm the session (this finalizes the
      // member record + bills any cart products on a separate invoice), persist
      // the IDs, then drop the session_id from the URL before loading.
      if (sessionId) {
        try {
          const res = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`)
          const data = await res.json()
          if (res.ok && data.customerId) {
            localStorage.setItem(LS_CUSTOMER_ID, data.customerId)
            if (data.subscriptionId) localStorage.setItem(LS_SUBSCRIPTION_ID, data.subscriptionId)
            window.history.replaceState(null, "", "/edit-club/membership")
            if (active) await load(data.customerId)
            return
          }
        } catch {
          // Fall through to the stored customer below.
        }
      }
      const customerId = localStorage.getItem(LS_CUSTOMER_ID)
      if (!customerId) {
        if (active) setView({ status: "guest" })
        return
      }
      if (active) await load(customerId)
    })()
    return () => {
      active = false
    }
  }, [sessionId, load])

  // The id of the most recent purchase currently shown. Kept in a ref so the
  // order-placed poller below can tell when a brand-new charge has surfaced.
  const latestTopPurchaseId = useRef<string | null>(null)
  useEffect(() => {
    if (view.status === "member") {
      latestTopPurchaseId.current = view.data.purchases[0]?.id ?? null
    }
  }, [view])

  // Refresh whenever an order is placed elsewhere on the page (the parent cart
  // or the in-chat / agent stylist checkout) so "Recent purchases", billing
  // history and member savings update live. A freshly-confirmed PaymentIntent
  // can take a few seconds to become listable in the customer's Stripe charge
  // history, so we poll on a short backoff until a newer order appears at the
  // top (or the schedule is exhausted) rather than firing a single delayed
  // re-fetch that can miss it.
  useEffect(() => {
    let cancelled = false
    async function onOrderPlaced() {
      const customerId = localStorage.getItem(LS_CUSTOMER_ID)
      if (!customerId) return
      const knownTop = latestTopPurchaseId.current
      const delays = [0, 800, 1800, 3500, 6000, 9000]
      for (const delay of delays) {
        if (cancelled) return
        if (delay) await new Promise((r) => setTimeout(r, delay))
        const data = await load(customerId)
        // Stop as soon as a new order appears at the top of the history.
        if (data && (data.purchases[0]?.id ?? null) !== knownTop) break
      }
    }
    window.addEventListener(ORDER_PLACED_EVENT, onOrderPlaced)
    return () => {
      cancelled = true
      window.removeEventListener(ORDER_PLACED_EVENT, onOrderPlaced)
    }
  }, [load])

  // Joining now adds the membership as a cart line and opens the slide-in
  // checkout (no hosted Stripe redirect), so the member can complete the join
  // and anything else they're buying in one place.
  const handleJoin = useCallback(() => {
    addMembership()
  }, [addMembership])

  const handleLookup = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const email = lookupEmail.trim()
      if (!email) return
      setLookupLoading(true)
      setLookupError(null)
      try {
        const res = await fetch("/api/membership/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
        const data = await res.json()
        if (!res.ok) {
          setLookupError(data.error ?? "We couldn't find that membership.")
          setLookupLoading(false)
          return
        }
        // "Log in" by remembering the resolved Stripe customer on this device.
        localStorage.setItem(LS_CUSTOMER_ID, data.customerId)
        setView({ status: "loading" })
        toast.success(`Welcome back${data.name ? `, ${data.name.split(" ")[0]}` : ""}!`)
        await load(data.customerId)
      } catch {
        setLookupError("Something went wrong. Please try again.")
      } finally {
        setLookupLoading(false)
      }
    },
    [lookupEmail, load],
  )

  const signOut = useCallback(() => {
    localStorage.removeItem(LS_CUSTOMER_ID)
    localStorage.removeItem(LS_SUBSCRIPTION_ID)
    setLookupEmail("")
    setLookupError(null)
    setView({ status: "guest" })
    toast("Signed out of your membership on this device.")
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteChrome
        onHome={() => router.push("/")}
        onNavigate={() => router.push("/")}
        onEditClub={() => router.push("/?view=editclub")}
        onSearch={() => router.push("/")}
      />

      <main className="flex-1">
        {/* Tan hero */}
        <section className="bg-linen">
          <div className="mx-auto max-w-4xl px-4 pb-24 pt-10 sm:px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-linen-foreground/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-linen-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Rewards Membership
            </span>
            <h1 className="mt-3 font-serif text-3xl leading-tight text-linen-foreground sm:text-4xl">
              My Edit Club
            </h1>
          </div>
        </section>

        {/* Frosted card pulled up over the hero */}
        <section className="mx-auto -mt-16 max-w-4xl px-4 pb-16 sm:px-6">
          <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-lg backdrop-blur-md sm:p-8">
            {view.status === "loading" && <DashboardSkeleton />}

            {view.status === "guest" && (
              <div className="grid items-stretch gap-8 py-4 md:grid-cols-2 md:gap-0">
                {/* Already a member */}
                <div className="flex flex-col items-center gap-4 text-center md:px-8">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-linen/15 text-linen">
                    <Mail className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-foreground">Already an Edit Club member</h2>
                    <p className="mx-auto mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
                      Enter the email you joined with to view your membership and manage billing.
                    </p>
                  </div>
                  <form onSubmit={handleLookup} className="mt-1 flex w-full max-w-xs flex-col gap-2">
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={lookupEmail}
                        onChange={(e) => {
                          setLookupEmail(e.target.value)
                          if (lookupError) setLookupError(null)
                        }}
                        placeholder="you@example.com"
                        aria-label="Membership email"
                        className="rounded-full pl-9 text-center"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={lookupLoading || !lookupEmail.trim()}
                      className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                    >
                      {lookupLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        "View my membership"
                      )}
                    </Button>
                    {lookupError && (
                      <p className="text-xs text-destructive" role="alert">
                        {lookupError}
                      </p>
                    )}
                  </form>
                </div>

                {/* Not a member yet */}
                <div className="flex flex-col items-center gap-4 border-t border-border pt-8 text-center md:border-l md:border-t-0 md:px-8 md:pt-0">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-linen/15 text-linen">
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-serif text-2xl text-foreground">Not an Edit Club member yet</h2>
                    <p className="mx-auto mt-2 max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
                      Join for {MEMBERSHIP_TERM_YEARS} years of members-only pricing, free-shipping perks and early
                      access to every sale.
                    </p>
                  </div>
                  <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
                    <Button
                      onClick={handleJoin}
                      className="w-full rounded-full bg-linen text-linen-foreground hover:bg-linen/90"
                    >
                      Join The Edit Club
                      <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button asChild variant="outline" className="w-full rounded-full">
                      <Link href="/">Back to Aster & Hem</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {view.status === "error" && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <p className="text-pretty text-sm text-muted-foreground">{view.message}</p>
                <Button variant="outline" className="rounded-full" onClick={signOut}>
                  Sign out and start over
                </Button>
              </div>
            )}

            {view.status === "member" && (
      <MemberDashboard
        key={view.data.customer.id}
        data={view.data}
        onRefresh={() => load(view.data.customer.id)}
        onSignOut={signOut}
              />
            )}
          </div>
        </section>
      </main>

      <StylistChatWidget />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="animate-shimmer h-6 w-40 rounded-md" />
          <div className="animate-shimmer h-4 w-56 rounded-md" />
        </div>
        <div className="animate-shimmer h-7 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="animate-shimmer h-24 rounded-xl" />
        <div className="animate-shimmer h-24 rounded-xl" />
        <div className="animate-shimmer h-24 rounded-xl" />
      </div>
      <div className="animate-shimmer h-40 rounded-xl" />
    </div>
  )
}

function MemberDashboard({
  data,
  onRefresh,
  onSignOut,
}: {
  data: MembershipData
  onRefresh: () => void
  onSignOut: () => void
}) {
  const { customer, subscription, invoices, paymentMethod, savedToDate, amountPaidToDate } = data

  // Purchases are paginated (groups of 10, past two years). Seed from the
  // initial payload, then append more pages from /api/membership/purchases.
  const [purchases, setPurchases] = useState(data.purchases)
  const [purchasesCursor, setPurchasesCursor] = useState(data.purchasesCursor)
  const [purchasesHasMore, setPurchasesHasMore] = useState(data.purchasesHasMore)
  const [loadingMore, setLoadingMore] = useState(false)

  // Re-seed the paginated purchase list whenever a fresh membership payload
  // arrives (e.g. after an in-chat / agent order triggers a live refresh). The
  // dashboard is keyed by customer id so it never remounts on refresh, which
  // means this state would otherwise keep its first-render value — making new
  // orders appear only after a manual page reload.
  useEffect(() => {
    setPurchases(data.purchases)
    setPurchasesCursor(data.purchasesCursor)
    setPurchasesHasMore(data.purchasesHasMore)
  }, [data])

  const loadMorePurchases = useCallback(async () => {
    if (!purchasesCursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/membership/purchases?customerId=${encodeURIComponent(customer.id)}&startingAfter=${encodeURIComponent(purchasesCursor)}`,
      )
      const page = await res.json()
      if (!res.ok) throw new Error(page.error ?? "Unable to load more purchases.")
      setPurchases((prev) => [...prev, ...page.purchases])
      setPurchasesCursor(page.nextCursor)
      setPurchasesHasMore(page.hasMore)
    } catch {
      toast.error("Couldn't load more purchases. Please try again.")
    } finally {
      setLoadingMore(false)
    }
  }, [customer.id, purchasesCursor])

  const tone = membershipTone(
    subscription?.status,
    subscription?.currentPeriodEnd ?? null,
    subscription?.cancelAtPeriodEnd ?? false,
  )
  const currency = subscription?.currency ?? invoices[0]?.currency ?? "usd"

  return (
    <div className="flex flex-col gap-7">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-foreground">
            {customer.name ?? "Member"}
          </h2>
          {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
          {customer.memberId && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-linen/15 px-2.5 py-1 text-xs font-medium text-linen">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Member {customer.memberId}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
          <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
          {membershipStatusLabel(tone)}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={PiggyBank}
          label="Saved with membership"
          value={formatMoney(savedToDate, currency)}
          hint="The Edit Club discount on your purchases"
        />
        <StatCard
          icon={CalendarClock}
          label={subscription?.cancelAtPeriodEnd ? "Access until" : "Renews on"}
          value={subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "—"}
          hint={
            subscription?.cancelAtPeriodEnd
              ? "Membership set to cancel"
              : `Billed every ${subscription?.intervalCount ?? MEMBERSHIP_TERM_YEARS} ${subscription?.interval ?? "year"}${(subscription?.intervalCount ?? 2) > 1 ? "s" : ""}`
          }
        />
        <StatCard
          icon={CreditCard}
          label="Payment method"
          value={
            paymentMethod?.last4
              ? `${(paymentMethod.brand ?? "card").toUpperCase()} •••• ${paymentMethod.last4}`
              : paymentMethod?.type === "link"
                ? "Link"
                : "On file"
          }
          hint={`${formatMoney(amountPaidToDate, currency)} paid to date`}
        />
      </div>

      {/* Manage / actions — inline card update (Payment Element + SetupIntent)
          and cancel auto-renew (pure API), no Stripe-hosted UI. */}
      <MembershipManageCard
        customerId={customer.id}
        subscriptionId={subscription?.id ?? null}
        cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
        currentPeriodEnd={subscription?.currentPeriodEnd ?? null}
        paymentMethod={paymentMethod}
        onRefresh={onRefresh}
      />

      {/* Demo: fast-forward this member's Stripe Test Clock */}
      <SimulateCard customerId={customer.id} onAdvanced={onRefresh} />

      {/* Recent purchases (real Stripe charge history) */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg text-foreground">Recent purchases</h3>
          <span className="text-xs text-muted-foreground">From your Stripe history</span>
        </div>
        {purchases.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-1 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-8 text-center">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No purchases yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Orders paid through Stripe will appear here, including any member discounts applied.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {purchases.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linen/15 text-linen">
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.created)}</p>
                  {p.discount && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-linen/15 px-2 py-0.5 text-[11px] font-medium text-linen">
                      <Tag className="h-3 w-3" aria-hidden="true" />
                      {p.discount.label ?? "Discount"} −{formatMoney(p.discount.amount, p.currency)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-serif text-base text-foreground">
                    {formatMoney(p.amount, p.currency)}
                  </span>
                  {p.receiptUrl && (
                    <a
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-linen underline-offset-4 hover:underline"
                    >
                      Receipt
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {purchasesHasMore && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="outline"
              onClick={loadMorePurchases}
              disabled={loadingMore}
              className="rounded-full px-6"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading…
                </>
              ) : (
                "Show more purchases"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h3 className="font-serif text-lg text-foreground">Billing history</h3>
        {invoices.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Invoice</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{formatDate(inv.created)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.number ?? inv.id.slice(-8)}</td>
                    <td className="px-4 py-3 text-foreground">{formatMoney(inv.amountPaid, inv.currency)}</td>
                    <td className="px-4 py-3 text-right">
                      {inv.invoicePdf || inv.hostedInvoiceUrl ? (
                        <a
                          href={(inv.invoicePdf ?? inv.hostedInvoiceUrl) as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-linen underline-offset-4 hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  )
}

const SIMULATION_YEARS = 2

type SimState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; clockUrl: string; customerUrl: string }
  | { status: "error"; message: string }

// Fast-forwards the member's Stripe Test Clock by 2 years so the first
// membership renewal + invoice can be inspected in the Stripe Dashboard.
function SimulateCard({ customerId, onAdvanced }: { customerId: string; onAdvanced: () => void }) {
  const [sim, setSim] = useState<SimState>({ status: "idle" })

  const run = useCallback(async () => {
    setSim({ status: "running" })
    try {
      const res = await fetch("/api/membership/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, years: SIMULATION_YEARS }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSim({ status: "error", message: data.error ?? "Simulation failed." })
        return
      }
      setSim({ status: "done", clockUrl: data.clockUrl, customerUrl: data.customerUrl })
      // The simulate API only returns once the test clock has finished advancing
      // (status "ready"), which means Stripe has already created and paid the
      // renewal invoice. Re-fetch the membership so the new invoice appears in
      // Billing history without a manual page reload.
      onAdvanced()
    } catch {
      setSim({ status: "error", message: "Something went wrong running the simulation." })
    }
  }, [customerId, onAdvanced])

  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-5">
      <div className="flex items-start gap-3">
        <FastForward className="mt-0.5 h-5 w-5 shrink-0 text-linen" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Demo: simulate the future</p>
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
            Fast-forward this member&apos;s Stripe Test Clock by {SIMULATION_YEARS} years to see the first membership
            renewal and invoice in the Stripe Dashboard.
          </p>
        </div>
      </div>

      {sim.status !== "done" && (
        <Button
          onClick={run}
          disabled={sim.status === "running"}
          variant="outline"
          className="mt-3 rounded-full"
        >
          {sim.status === "running" ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              Advancing {SIMULATION_YEARS} years…
            </>
          ) : (
            <>
              <FastForward className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Simulate {SIMULATION_YEARS} years
            </>
          )}
        </Button>
      )}

      {sim.status === "error" && <p className="mt-2 text-xs text-destructive">{sim.message}</p>}

      {sim.status === "done" && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Check className="h-4 w-4 text-linen" aria-hidden="true" />
            Clock advanced {SIMULATION_YEARS} years. View the simulated account in Stripe:
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={sim.clockUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Test clock timeline
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a
              href={sim.customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Customer in Dashboard
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-linen" />
        {label}
      </span>
      <span className="font-serif text-xl text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  )
}
