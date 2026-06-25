// The Edit Club Stripe Billing (subscription) configuration & shared types.
//
// The membership is a real Stripe subscription against an existing product in
// the connected (test mode) Stripe account. Prices are fetched dynamically so
// we never hardcode a price ID that could drift.

// Edit Club membership product + price on the connected (AU) Stripe account.
// The resolver in lib/membership-price.ts tries the price first, then the
// product, and self-heals if neither exists on the active account.
export const LINEN_LOVERS_PRODUCT_ID = "prod_Ugfsub23cnQZed"
export const LINEN_LOVERS_PRICE_ID = "price_1ThIWeRujtq690JavqCuPfea"

// localStorage keys used to remember the demo member between visits. In
// production these would be columns on your user record instead.
export const LS_CUSTOMER_ID = "ll_customer_id"
export const LS_SUBSCRIPTION_ID = "ll_subscription_id"

// Window event fired whenever an order is paid for (parent cart OR the in-chat
// stylist checkout). The My Edit Club page listens for it and re-fetches so
// "Recent purchases", billing history, and member savings reflect the new order
// without a manual reload.
export const ORDER_PLACED_EVENT = "adairs:order-placed"

/** Notify any open My Edit Club view that a new order was just placed. */
export function notifyOrderPlaced() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ORDER_PLACED_EVENT))
  }
}

// The Edit Club customer record format, mirroring the existing demo members
// (e.g. member_id "LL-123", description "Edit Club demo member"). New members
// created at join time are stamped with the same shape so they're consistent.
export const MEMBER_ID_METADATA_KEY = "member_id"
export const MEMBER_ID_PREFIX = "LL-"
export const MEMBER_ID_START = 123 // existing members occupy LL-123, LL-124
export const MEMBER_DESCRIPTION = "Edit Club demo member"

// Formats a numeric sequence into the canonical member id (e.g. 125 -> "LL-125").
export function formatMemberId(seq: number): string {
  return `${MEMBER_ID_PREFIX}${seq}`
}

// Parses the numeric sequence out of a member id, or null if it doesn't match.
export function parseMemberId(memberId: string | null | undefined): number | null {
  if (!memberId) return null
  const match = memberId.match(/^LL-(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : null
}

// Each membership renewal is assumed to save the member this much versus
// non-member pricing — used for the "you've saved $X" headline on the dashboard.
export const SAVINGS_PER_RENEWAL = 30

// Metadata keys used to record the real The Edit Club member discount on the
// PaymentIntent of a front-end purchase. The dashboard sums these to show
// "Saved with membership" from actual captured savings rather than an estimate.
export const SAVINGS_METADATA_KEY = "linen_lovers_savings" // amount in cents (string)
export const SAVINGS_LABEL_METADATA_KEY = "linen_lovers_savings_label"

// Metadata keys recording the product-level contents of an order on its
// PaymentIntent (set at checkout). These let the AI Stylist read a member's real
// purchase history back at the product level to recommend complementary pieces.
export const ITEMS_METADATA_KEY = "adairs_items" // pipe-separated item names
export const CATEGORIES_METADATA_KEY = "adairs_categories" // comma-separated categories

export type MembershipStatusTone = "active" | "expiring" | "cancelled"

export interface MembershipInvoice {
  id: string
  number: string | null
  created: number
  amountPaid: number
  currency: string
  status: string | null
  invoicePdf: string | null
  hostedInvoiceUrl: string | null
}

// A real purchase pulled from the customer's Stripe charge history. Amounts are
// in cents. `discount` is populated when the related invoice recorded a discount
// (coupon/promo), so members can see exactly what they saved on an order.
export interface MembershipPurchase {
  id: string
  description: string
  amount: number
  currency: string
  created: number
  status: string
  receiptUrl: string | null
  discount: {
    amount: number
    label: string | null
  } | null
  // Product-level contents parsed from the order's PaymentIntent metadata, when
  // recorded at checkout. Empty for older orders that predate this tracking.
  items: string[]
  categories: string[]
}

export interface MembershipData {
  customer: {
    id: string
    name: string | null
    email: string | null
    memberId: string | null
  }
  subscription: {
    id: string
    status: string
    currentPeriodEnd: number | null
    currentPeriodStart: number | null
    cancelAtPeriodEnd: boolean
    interval: string | null
    intervalCount: number | null
    amount: number | null
    currency: string
  } | null
  paymentMethod: {
    // The Stripe payment method type, e.g. "card" or "link". Lets the UI render
    // a Link wallet on file (which has no card brand/last4) as well as cards.
    type: string | null
    brand: string | null
    last4: string | null
    // For Link payments, the Link account email — there is no card last4 to show.
    email: string | null
  } | null
  invoices: MembershipInvoice[]
  purchases: MembershipPurchase[]
  // Cursor pagination for purchases: whether more pages exist and where to
  // resume from (passed to /api/membership/purchases).
  purchasesHasMore: boolean
  purchasesCursor: string | null
  amountPaidToDate: number
  savedToDate: number
}

// Map a subscription to a UI status tone. Active with >60 days to renewal is
// "active"; <60 days (or set to cancel) is "expiring"; otherwise "cancelled".
export function membershipTone(
  status: string | undefined | null,
  currentPeriodEnd: number | null,
  cancelAtPeriodEnd: boolean,
): MembershipStatusTone {
  if (!status || status === "canceled" || status === "incomplete_expired" || status === "unpaid") {
    return "cancelled"
  }
  const sixtyDays = 60 * 24 * 60 * 60
  const now = Math.floor(Date.now() / 1000)
  if (cancelAtPeriodEnd) return "expiring"
  if (status === "active" || status === "trialing") {
    if (currentPeriodEnd && currentPeriodEnd - now < sixtyDays) return "expiring"
    return "active"
  }
  // past_due, incomplete, etc.
  return "expiring"
}

export function membershipStatusLabel(tone: MembershipStatusTone): string {
  switch (tone) {
    case "active":
      return "Active"
    case "expiring":
      return "Expiring soon"
    case "cancelled":
      return "Cancelled"
  }
}
