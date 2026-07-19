import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { getProductById, summarizeCartItems } from "@/lib/products"
import {
  SAVINGS_METADATA_KEY,
  SAVINGS_LABEL_METADATA_KEY,
  ITEMS_METADATA_KEY,
  CATEGORIES_METADATA_KEY,
} from "@/lib/membership"
import type { CartItem } from "@/lib/types"

interface Body {
  cartItems?: CartItem[]
  shipping?: number
  shippingLabel?: string
  discountAmount?: number
  discountLabel?: string
  membershipFee?: number
  customerId?: string | null
  memberDiscountAmount?: number
  // An Aster & Hem gift card redeemed at the review step. The coupon was minted by
  // /api/gift-card/apply (Coupons API); here we read its value back from Stripe
  // and subtract it from the PaymentIntent amount so the card pays its share and
  // the Payment Element only collects the remaining balance.
  giftCardCouponId?: string | null
  // Fallback gift card value (dollars) used only when Stripe isn't configured.
  giftCardAmount?: number
  // When present, update the existing intent's amount instead of creating a new
  // one so the mounted Payment Element keeps its state across price changes.
  paymentIntentId?: string
}

// Storefront checkout via the PaymentIntents API. This powers the "Elements"
// checkout mode. When an Aster & Hem gift card has been redeemed, its coupon value is
// subtracted here so the Payment Element only collects the remaining balance —
// the gift card (Coupons API) and the card (PaymentIntents API) settle the order
// together. Amounts are priced server-side from the catalog so the client can't
// change what we charge.
export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const cartItems = body.cartItems ?? []
  const shipping = typeof body.shipping === "number" ? body.shipping : 0
  const discountAmount = typeof body.discountAmount === "number" ? body.discountAmount : 0
  const membershipFee = typeof body.membershipFee === "number" ? body.membershipFee : 0
  const customerId = typeof body.customerId === "string" && body.customerId ? body.customerId : null
  const memberDiscountAmount =
    typeof body.memberDiscountAmount === "number" ? body.memberDiscountAmount : 0

  // Price the goods from the catalog — never trust a client-supplied subtotal.
  const goodsSubtotal = cartItems.reduce((sum, item) => {
    const product = getProductById(item.productId)
    return product ? sum + product.price * item.quantity : sum
  }, 0)

  const orderTotal = Math.max(0, goodsSubtotal + membershipFee + shipping - discountAmount)
  const itemCount = cartItems.reduce((n, i) => n + i.quantity, 0)
  const giftCardCouponId =
    typeof body.giftCardCouponId === "string" && body.giftCardCouponId ? body.giftCardCouponId : null

  if (orderTotal <= 0) {
    return NextResponse.json({ error: "Nothing to purchase" }, { status: 400 })
  }

  const stripe = getStripe()

  // Demo mode — no Stripe key configured. The client falls back to a simulated
  // payment so the experience still completes in the preview.
  if (!stripe) {
    const fallbackGift = Math.min(typeof body.giftCardAmount === "number" ? body.giftCardAmount : 0, orderTotal)
    return NextResponse.json({ clientSecret: null, demoMode: true, amount: Math.max(0, orderTotal - fallbackGift) })
  }

  // Read the authoritative gift card value back from the coupon in Stripe rather
  // than trusting the client, then cap it at the order total.
  let giftCardApplied = 0
  if (giftCardCouponId) {
    try {
      const coupon = await stripe.coupons.retrieve(giftCardCouponId)
      if (coupon.amount_off) giftCardApplied = Math.min(coupon.amount_off / 100, orderTotal)
    } catch (error) {
      console.log("[v0] gift-card coupon retrieve failed:", error)
    }
  }

  const total = Math.max(0, orderTotal - giftCardApplied)
  const amountCents = Math.round(total * 100)

  // The gift card covers the whole order — there's nothing left to charge, so we
  // skip creating a PaymentIntent and let the client confirm a gift-card-only order.
  if (amountCents <= 0) {
    return NextResponse.json({ fullyCovered: true, demoMode: false, amount: 0, giftCardApplied })
  }

  const memberSavingsCents = Math.round(memberDiscountAmount * 100)
  const metadata: Record<string, string> = {
    demo: "aster_hem_acs_demo",
    flow: "storefront_elements_checkout",
    powered_by: "stripe_payment_element",
    ah_shipping: (body.shippingLabel ?? "Standard Delivery").slice(0, 200),
    ah_discount: (body.discountLabel ?? "Discount").slice(0, 200),
  }
  // Record the product-level order contents so a member's purchase history can
  // later be read back per-item (e.g. by the AI Stylist for recommendations).
  const orderSummary = summarizeCartItems(cartItems)
  if (orderSummary.items) metadata[ITEMS_METADATA_KEY] = orderSummary.items
  if (orderSummary.categories) metadata[CATEGORIES_METADATA_KEY] = orderSummary.categories
  if (memberSavingsCents > 0) {
    metadata[SAVINGS_METADATA_KEY] = String(memberSavingsCents)
    metadata[SAVINGS_LABEL_METADATA_KEY] = "The Edit Club member discount"
  }
  if (giftCardApplied > 0) {
    metadata.ah_gift_card_coupon = String(giftCardCouponId)
    metadata.ah_gift_card_amount = String(Math.round(giftCardApplied * 100))
  }

  try {
    if (body.paymentIntentId) {
      const updated = await stripe.paymentIntents.update(body.paymentIntentId, {
        amount: amountCents,
        metadata,
      })
      return NextResponse.json({
        clientSecret: updated.client_secret,
        paymentIntentId: updated.id,
        demoMode: false,
        amount: total,
      })
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd", // USD required for the ACS preview
      // Card + Link (plus Apple Pay / Google Pay, which surface automatically
      // with `card`). Link auto-populates the customer's saved details inline.
      payment_method_types: ["card", "link"],
      description: `Aster & Hem — ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      ...(customerId ? { customer: customerId } : {}),
      metadata,
    })

    return NextResponse.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      demoMode: false,
      amount: total,
    })
  } catch (error) {
    console.log("[v0] storefront payment-intent error:", error)
    return NextResponse.json({ clientSecret: null, demoMode: true, amount: total })
  }
}
