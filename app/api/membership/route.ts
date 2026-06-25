import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { type MembershipData, type MembershipInvoice } from "@/lib/membership"
import { fetchPurchasesPage, sumMembershipSavings } from "@/lib/stripe-purchases"

// Returns the membership dashboard payload for a given Stripe customer:
// customer details, active subscription, recent invoices, payment method and
// derived savings.
export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId")
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    })

    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Most recent subscription for this customer (active or otherwise).
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 1,
      expand: ["data.default_payment_method"],
    })
    const sub = subs.data[0] ?? null

    // Recent invoices for billing history + amount-paid calculation. We pull a
    // wider page (100) because a member's product orders from the join flow are
    // billed on their OWN one-time invoices (kind: linen_lovers_goods) which we
    // must NOT show here — those belong in "Recent purchases", not billing.
    const invoiceList = await stripe.invoices.list({ customer: customerId, limit: 100 })

    // Billing history = the Linen Lovers MEMBERSHIP only. An invoice is a
    // membership/billing invoice when it was raised by the subscription (its
    // billing_reason starts with "subscription"), e.g. subscription_create or
    // subscription_cycle. Product orders (manual goods invoices, standalone
    // PaymentIntents) are deliberately excluded so billing stays separate from
    // purchases and the same order never appears in both lists.
    const isMembershipInvoice = (inv: Stripe.Invoice) =>
      (inv.billing_reason ?? "").startsWith("subscription") &&
      inv.metadata?.kind !== "linen_lovers_goods"

    const membershipInvoices = invoiceList.data.filter(isMembershipInvoice)

    // Billing history shows real, billed membership invoices only — skip $0.00 ones.
    const invoices: MembershipInvoice[] = membershipInvoices
      .filter((inv) => inv.amount_paid > 0)
      .slice(0, 5)
      .map((inv) => ({
      id: inv.id,
      number: inv.number,
      created: inv.created,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      invoicePdf: inv.invoice_pdf ?? null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    }))

    // First page (10) of real Stripe purchases from the past two years, with any
    // invoice discount attached. Further pages load via /api/membership/purchases.
    const firstPage = await fetchPurchasesPage(stripe, customerId)

    // "Paid to date" reflects membership fees only, matching the billing section.
    const paidInvoices = membershipInvoices.filter((i) => i.status === "paid")
    const amountPaidToDate = paidInvoices.reduce((sum, i) => sum + i.amount_paid, 0)
    // "Saved with membership" is the real Linen Lovers discount captured on the
    // member's purchases (in cents), not an estimate.
    const savedToDate = await sumMembershipSavings(stripe, customerId)

    // Resolve a card payment method to display last4.
    let pm: Stripe.PaymentMethod | null = null
    const subPm = sub?.default_payment_method
    if (subPm && typeof subPm !== "string") {
      pm = subPm
    } else {
      const custPm =
        typeof customer.invoice_settings?.default_payment_method !== "string"
          ? customer.invoice_settings?.default_payment_method
          : null
      pm = custPm ?? null
    }

    // Final fallback: a subscription created via Checkout always saves the
    // payment method to the customer even if it isn't yet flagged as the
    // subscription/customer default. List ALL saved methods (not just cards) so a
    // Link wallet is found too — otherwise paying with Link would wrongly show
    // "No card on file". Prefer a card if one exists, else use the first method
    // (e.g. Link).
    if (!pm) {
      try {
        const pms = await stripe.paymentMethods.list({ customer: customerId, limit: 10 })
        pm = pms.data.find((m) => m.type === "card") ?? pms.data[0] ?? null
      } catch {
        // Leave pm null; UI will show "On file".
      }
    }

    const price = sub?.items.data[0]?.price ?? null

    const data: MembershipData = {
      customer: {
        id: customer.id,
        name: customer.name ?? null,
        email: customer.email ?? null,
        // The Linen Lovers number lives in customer metadata (e.g. "LL-123").
        memberId: customer.metadata?.member_id ?? null,
      },
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
            currentPeriodStart: sub.items.data[0]?.current_period_start ?? null,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            interval: price?.recurring?.interval ?? null,
            intervalCount: price?.recurring?.interval_count ?? null,
            amount: price?.unit_amount ?? null,
            currency: price?.currency ?? "usd",
          }
        : null,
      paymentMethod: pm
        ? {
            type: pm.type ?? null,
            brand: pm.card?.brand ?? null,
            last4: pm.card?.last4 ?? null,
            // Link wallets expose only the account email (no card brand/last4),
            // so surface it for display.
            email: pm.type === "link" ? (pm.link?.email ?? null) : null,
          }
        : null,
      invoices,
      purchases: firstPage.purchases,
      purchasesHasMore: firstPage.hasMore,
      purchasesCursor: firstPage.nextCursor,
      amountPaidToDate,
      savedToDate,
    }

    return NextResponse.json(data)
  } catch (error) {
    console.log("[v0] membership route error:", error)
    return NextResponse.json({ error: "Unable to load membership" }, { status: 500 })
  }
}
