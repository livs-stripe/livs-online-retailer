// Aster & Hem-style delivery & loyalty pricing rules (modelled on adairs.com.au)
//
// - Standard delivery is a flat fee, free above a spend threshold.
// - Edit Club members get a lower free-shipping threshold.
// - "Join and save" applies a one-off discount on the current order.
// - Promotional codes apply a percentage or fixed dollar discount.

// Standard delivery is a flat fee (Aster & Hem increased this from $14.95 to $19.95).
export const STANDARD_SHIPPING = 19.95
// Free standard delivery thresholds: Edit Club members over $50, everyone
// else over $175.
export const FREE_SHIP_THRESHOLD_GUEST = 175
export const FREE_SHIP_THRESHOLD_MEMBER = 50
// New The Edit Club get a $20 welcome reward. It is NOT applied to the sign-up
// order — it now arrives within 48 hours of joining (delivered separately), so
// it never discounts the current checkout.
export const MEMBERSHIP_JOIN_DISCOUNT = 20
export const MEMBERSHIP_WELCOME_DELAY_HOURS = 48
// Existing Edit Club members save more on every item: 10% off full-price
// items and 5% off items already on sale.
export const MEMBER_DISCOUNT_FULL = 0.1
export const MEMBER_DISCOUNT_SALE = 0.05
// A paid The Edit Club 2-year membership added as its own line item on the order.
export const MEMBERSHIP_PRICE = 19.95
export const MEMBERSHIP_TERM_YEARS = 2
export const MEMBERSHIP_LABEL = "The Edit Club 2-Year Membership"
// Sentinel cart line id used to represent the membership in the cart. It is not a
// real product in the catalog, so cart/checkout code special-cases this id.
export const MEMBERSHIP_CART_ID = "linen-lovers-membership"

export interface PromoCode {
  code: string
  label: string
  type: "percent" | "amount"
  value: number
}

// Demo promotional codes
export const PROMO_CODES: Record<string, PromoCode> = {
  WELCOME10: { code: "WELCOME10", label: "10% off your order", type: "percent", value: 10 },
  STYLE15: { code: "STYLE15", label: "15% off styling picks", type: "percent", value: 15 },
  ADAIRS20: { code: "ADAIRS20", label: "$20 off", type: "amount", value: 20 },
}

export function lookupPromo(code: string): PromoCode | null {
  if (!code) return null
  return PROMO_CODES[code.trim().toUpperCase()] ?? null
}

// A Edit Club number is the "LL-" prefix followed by the member's sequence
// (e.g. "LL-123", "LL-4829301"), case-insensitive and tolerant of a missing
// hyphen ("LL123"). A bare numeric sequence of 3+ digits is also accepted so
// members can paste just the number. NOTE: real member ids in this system are
// short and sequential (LL-123, LL-124, LL-125 …), so we must NOT require a long
// minimum length — doing so rejects every genuine member.
export function isValidLinenNumber(value: string): boolean {
  return /^(LL-?\d+|\d{3,})$/i.test(value.trim())
}

// Normalises any accepted member input into the canonical "LL-<n>" form so the
// same string is used for display, lookup and metadata regardless of how the
// member typed it ("ll123", "123" and "LL-123" all become "LL-123").
export function normaliseLinenNumber(value: string): string {
  const trimmed = value.trim()
  const digits = trimmed.replace(/^LL-?/i, "")
  return `LL-${digits}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// In-chat ("agent") checkout pricing
//
// Shared by the checkout panel (display) and the payment-intent route (charge)
// so the amount shown always matches the amount charged. Applying a valid Linen
// Lovers number unlocks the member discount and the lower free-delivery
// threshold.
// ---------------------------------------------------------------------------
export interface AgentPriceItem {
  price: number
  quantity: number
  onSale?: boolean
}

export interface AgentPriceInput {
  items: AgentPriceItem[]
  fulfillment: "delivery" | "pickup"
  isMember: boolean
}

export interface AgentPriceResult {
  subtotal: number
  memberDiscount: number
  discountedSubtotal: number
  shipping: number
  shippingFree: boolean
  freeShipThreshold: number
  total: number
  isMember: boolean
}

export function computeAgentPrice({ items, fulfillment, isMember }: AgentPriceInput): AgentPriceResult {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0))

  // The Edit Club save 10% off full-price items and 5% off items already on sale.
  const memberDiscount = isMember
    ? round2(
        items.reduce(
          (s, i) => s + i.price * i.quantity * (i.onSale ? MEMBER_DISCOUNT_SALE : MEMBER_DISCOUNT_FULL),
          0,
        ),
      )
    : 0

  const discountedSubtotal = round2(subtotal - memberDiscount)
  const freeShipThreshold = isMember ? FREE_SHIP_THRESHOLD_MEMBER : FREE_SHIP_THRESHOLD_GUEST

  let shipping = 0
  let shippingFree = true
  if (fulfillment === "delivery") {
    // Qualification is on the order value (subtotal), matching Aster & Hem's wording
    // of "free standard delivery on orders over $X".
    shippingFree = subtotal >= freeShipThreshold
    shipping = shippingFree ? 0 : STANDARD_SHIPPING
  }

  const total = round2(discountedSubtotal + shipping)

  return {
    subtotal,
    memberDiscount,
    discountedSubtotal,
    shipping,
    shippingFree,
    freeShipThreshold,
    total,
    isMember,
  }
}

export interface OrderLine {
  price: number
  quantity: number
  onSale: boolean
}

export interface OrderInput {
  subtotal: number
  isMember: boolean
  joinMembership: boolean
  promo: PromoCode | null
  postcode: string
  // Per-item cart lines used to compute the tiered member discount.
  items?: OrderLine[]
}

export interface OrderSummary {
  subtotal: number
  memberDiscount: number
  promoDiscount: number
  totalDiscount: number
  membershipFee: number
  shipping: number
  shippingLabel: string
  freeShipping: boolean
  hasPostcode: boolean
  memberActive: boolean
  total: number
}

export function computeOrder(input: OrderInput): OrderSummary {
  const { subtotal, isMember, joinMembership, promo, postcode, items } = input
  const memberActive = isMember || joinMembership

  // Existing members save per item: 10% off full price, 5% off sale. The $20
  // welcome reward is NOT applied to this order — it now arrives within 48 hours
  // of joining (delivered separately), so joining alone gives no instant order
  // discount here.
  let memberDiscount = 0
  if (isMember && items && items.length > 0) {
    const raw = items.reduce((sum, line) => {
      const rate = line.onSale ? MEMBER_DISCOUNT_SALE : MEMBER_DISCOUNT_FULL
      return sum + line.price * line.quantity * rate
    }, 0)
    memberDiscount = Math.round(raw * 100) / 100
  }
  // Joining adds a paid 2-year membership to the order as its own line item.
  const membershipFee = joinMembership ? MEMBERSHIP_PRICE : 0

  let promoDiscount = 0
  if (promo) {
    promoDiscount = promo.type === "percent" ? (subtotal * promo.value) / 100 : promo.value
  }

  const totalDiscount = Math.min(subtotal, Math.round((memberDiscount + promoDiscount) * 100) / 100)
  const discountedSubtotal = subtotal - totalDiscount

  const hasPostcode = /^\d{4}$/.test(postcode.trim())
  const threshold = memberActive ? FREE_SHIP_THRESHOLD_MEMBER : FREE_SHIP_THRESHOLD_GUEST
  const freeShipping = subtotal >= threshold

  let shipping = 0
  let shippingLabel = "Standard Delivery"
  if (hasPostcode) {
    if (freeShipping) {
      shipping = 0
      shippingLabel = memberActive ? "Free standard shipping — The Edit Club" : "Free standard shipping"
    } else {
      shipping = STANDARD_SHIPPING
      shippingLabel = `Standard Delivery to ${postcode.trim()}`
    }
  }

  const total = discountedSubtotal + shipping + membershipFee

  return {
    subtotal,
    memberDiscount,
    promoDiscount,
    totalDiscount,
    membershipFee,
    shipping,
    shippingLabel,
    freeShipping,
    hasPostcode,
    memberActive,
    total,
  }
}
