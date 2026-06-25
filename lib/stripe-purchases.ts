import type Stripe from "stripe"
import {
  type MembershipPurchase,
  SAVINGS_METADATA_KEY,
  SAVINGS_LABEL_METADATA_KEY,
  ITEMS_METADATA_KEY,
  CATEGORIES_METADATA_KEY,
} from "./membership"

// Purchases are shown going back two years, paged in groups of 10.
export const PURCHASE_WINDOW_SECONDS = 2 * 365 * 24 * 60 * 60
export const PURCHASE_PAGE_SIZE = 10

type DiscountInfo = { amount: number; label: string | null }

// Pull the coupon/promo name out of an expanded discount, when available. The
// discount shape on invoice totals is narrow, so we read the (expanded) coupon
// defensively via a cast.
function discountLabel(discount: unknown): string | null {
  if (!discount || typeof discount === "string") return null
  const coupon = (discount as { coupon?: string | Stripe.Coupon | null }).coupon
  if (!coupon || typeof coupon === "string") return null
  return coupon.name ?? coupon.id ?? null
}

// Builds a lookup from a payment id (PaymentIntent id or Charge id) to the
// discount recorded on the invoice it paid. This lets us attach the discount a
// member received to the matching charge in their purchase history.
function buildDiscountMap(invoices: Stripe.Invoice[]): Map<string, DiscountInfo> {
  const map = new Map<string, DiscountInfo>()
  for (const inv of invoices) {
    const amount = (inv.total_discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0)
    if (amount <= 0) continue
    const first = (inv.total_discount_amounts ?? [])[0]
    const info: DiscountInfo = { amount, label: first ? discountLabel(first.discount) : null }
    for (const p of inv.payments?.data ?? []) {
      const pay = p.payment
      if (!pay) continue
      const pi = pay.payment_intent
      if (typeof pi === "string") map.set(pi, info)
      else if (pi) map.set(pi.id, info)
      const ch = pay.charge
      if (typeof ch === "string") map.set(ch, info)
      else if (ch) map.set(ch.id, info)
    }
  }
  return map
}

// Reads the The Edit Club savings recorded on a charge's PaymentIntent metadata
// (set at front-end checkout). Returns null when no membership savings applies.
function savingsFromPaymentIntent(charge: Stripe.Charge): DiscountInfo | null {
  const pi = charge.payment_intent
  if (!pi || typeof pi === "string") return null
  const amount = Number.parseInt(pi.metadata?.[SAVINGS_METADATA_KEY] ?? "", 10)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { amount, label: pi.metadata?.[SAVINGS_LABEL_METADATA_KEY] ?? "The Edit Club member discount" }
}

// Collects the charge & PaymentIntent ids that paid subscription invoices, so
// the recurring Edit Club membership charge can be excluded from the member's
// "Recent purchases" (which should list only their product orders, never the
// membership itself).
function buildMembershipPaymentIds(invoices: Stripe.Invoice[]): Set<string> {
  const ids = new Set<string>()
  for (const inv of invoices) {
    if (!(inv.billing_reason ?? "").startsWith("subscription")) continue
    for (const p of inv.payments?.data ?? []) {
      const pay = p.payment
      if (!pay) continue
      const pi = pay.payment_intent
      if (typeof pi === "string") ids.add(pi)
      else if (pi) ids.add(pi.id)
      const ch = pay.charge
      if (typeof ch === "string") ids.add(ch)
      else if (ch) ids.add(ch.id)
    }
  }
  return ids
}

function mapCharge(c: Stripe.Charge, discountMap: Map<string, DiscountInfo>): MembershipPurchase {
  const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id
  // Prefer an invoice-level discount (subscriptions); fall back to the member
  // savings recorded on the PaymentIntent for front-end store purchases.
  const discount =
    discountMap.get(c.id) ??
    (pi ? discountMap.get(pi) : undefined) ??
    savingsFromPaymentIntent(c) ??
    null
  // Read the product-level order contents recorded on the PaymentIntent at
  // checkout, when present.
  const piObj = typeof c.payment_intent === "string" ? null : c.payment_intent
  const itemsRaw = piObj?.metadata?.[ITEMS_METADATA_KEY] ?? ""
  const categoriesRaw = piObj?.metadata?.[CATEGORIES_METADATA_KEY] ?? ""
  const items = itemsRaw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
  const categories = categoriesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  // Charges that paid an invoice (e.g. the join-flow goods order) carry Stripe's
  // generic "Payment for Invoice …" description. Show a friendlier label, and
  // prefer the recorded item names when we have them.
  const rawDescription = c.description ?? ""
  const description =
    !rawDescription || /payment for invoice/i.test(rawDescription)
      ? items.length > 0
        ? items.join(", ")
        : "Aster & Hem order"
      : rawDescription

  return {
    id: c.id,
    description,
    amount: c.amount,
    currency: c.currency,
    created: c.created,
    status: c.status,
    receiptUrl: c.receipt_url ?? null,
    discount,
    items,
    categories,
  }
}

export interface PurchasesPage {
  purchases: MembershipPurchase[]
  hasMore: boolean
  nextCursor: string | null
}

// Fetches one page (10) of a customer's successful charges from the past two
// years, newest first, with any invoice discount attached. Pass the previous
// page's `nextCursor` as `startingAfter` to load the next group.
export async function fetchPurchasesPage(
  stripe: Stripe,
  customerId: string,
  startingAfter?: string,
): Promise<PurchasesPage> {
  const gte = Math.floor(Date.now() / 1000) - PURCHASE_WINDOW_SECONDS

  // Invoices in the same window let us map discounts onto their charges.
  const invoiceList = await stripe.invoices.list({
    customer: customerId,
    limit: 100,
    created: { gte },
    expand: ["data.payments", "data.total_discount_amounts.discount.coupon"],
  })
  const discountMap = buildDiscountMap(invoiceList.data)
  // Ids of charges that paid the membership subscription — excluded below.
  const membershipPaymentIds = buildMembershipPaymentIds(invoiceList.data)

  const params: Stripe.ChargeListParams = {
    customer: customerId,
    limit: PURCHASE_PAGE_SIZE,
    created: { gte },
    // Needed to read The Edit Club savings recorded on the PaymentIntent.
    expand: ["data.payment_intent"],
  }
  if (startingAfter) params.starting_after = startingAfter

  const chargeList = await stripe.charges.list(params)
  const purchases = chargeList.data
    .filter((c) => c.paid && c.status === "succeeded")
    .filter((c) => {
      // Drop the recurring membership charge; keep product orders only.
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id
      return !membershipPaymentIds.has(c.id) && !(pi && membershipPaymentIds.has(pi))
    })
    .map((c) => mapCharge(c, discountMap))

  // Cursor is the last raw charge id so paging continues regardless of filtering.
  const nextCursor = chargeList.data.length ? chargeList.data[chargeList.data.length - 1].id : null

  return { purchases, hasMore: chargeList.has_more, nextCursor }
}

// A concise, agent-friendly view of a single past order for the AI Stylist.
export interface StylistPurchase {
  // ISO date (YYYY-MM-DD) the order was placed.
  date: string
  // Product-level item names when recorded at checkout (newest tracking), else
  // an empty array — in which case `description` carries the order summary.
  items: string[]
  // Unique product categories in the order (e.g. ["Throws and Blankets"]).
  categories: string[]
  // Human summary fallback (e.g. "Aster & Hem — 2 items") for older orders.
  description: string
  // Order total in dollars.
  amount: number
}

// Fetches a member's recent product orders, formatted for the AI Stylist to
// ground personalised recommendations (e.g. "you bought a throw last month →
// suggest matching cushions"). Reuses fetchPurchasesPage so the recurring
// membership charge is already excluded and product-level metadata is parsed.
export async function fetchRecentPurchasesForStylist(
  stripe: Stripe,
  customerId: string,
  limit = 8,
): Promise<StylistPurchase[]> {
  const { purchases } = await fetchPurchasesPage(stripe, customerId)
  return purchases.slice(0, limit).map((p) => ({
    date: new Date(p.created * 1000).toISOString().slice(0, 10),
    items: p.items,
    categories: p.categories,
    description: p.description,
    amount: p.amount / 100,
  }))
}

// Totals the real Edit Club member savings (in cents) captured across a
// customer's purchases from the past two years.
//
// This mirrors the per-purchase discount resolution in `mapCharge`, so the
// "Saved with membership" headline always matches what's shown on the rows:
//   - invoice-level membership discount first (e.g. the welcome reward / member
//     discount applied when a shopper joins and buys in the SAME order via the
//     subscription join checkout — that order has no PaymentIntent metadata
//     because subscription mode can't set `payment_intent_data`), then
//   - the savings recorded on the PaymentIntent for ordinary store purchases.
// Using the same precedence per charge avoids double counting.
export async function sumMembershipSavings(stripe: Stripe, customerId: string): Promise<number> {
  const gte = Math.floor(Date.now() / 1000) - PURCHASE_WINDOW_SECONDS
  let total = 0
  let startingAfter: string | undefined

  // Invoices in the window let us count discounts captured at the invoice level
  // (subscription join orders), keyed back to the charge that paid them.
  const invoiceList = await stripe.invoices.list({
    customer: customerId,
    limit: 100,
    created: { gte },
    expand: ["data.payments", "data.total_discount_amounts.discount.coupon"],
  })
  const discountMap = buildDiscountMap(invoiceList.data)

  // Page through up to ~500 charges (5 pages) — ample for the demo window.
  for (let page = 0; page < 5; page++) {
    const params: Stripe.ChargeListParams = {
      customer: customerId,
      limit: 100,
      created: { gte },
      expand: ["data.payment_intent"],
    }
    if (startingAfter) params.starting_after = startingAfter

    const list = await stripe.charges.list(params)
    for (const c of list.data) {
      if (!c.paid || c.status !== "succeeded") continue
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id
      const savings =
        discountMap.get(c.id) ??
        (pi ? discountMap.get(pi) : undefined) ??
        savingsFromPaymentIntent(c)
      if (savings) total += savings.amount
    }
    if (!list.has_more || list.data.length === 0) break
    startingAfter = list.data[list.data.length - 1].id
  }

  return total
}
