import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { getProductById, summarizeCartItems } from "@/lib/products"
import { MEMBERSHIP_LABEL } from "@/lib/shipping"
import {
  SAVINGS_METADATA_KEY,
  SAVINGS_LABEL_METADATA_KEY,
  ITEMS_METADATA_KEY,
  CATEGORIES_METADATA_KEY,
} from "@/lib/membership"
import type { CartItem } from "@/lib/types"

export async function POST(req: NextRequest) {
  let cartItems: CartItem[] = []
  let shipping = 0
  let shippingLabel = "Standard Delivery"
  let discountAmount = 0
  let discountLabel = "Discount"
  let membershipFee = 0
  // The signed-in Edit Club member (Stripe customer id) and the portion of
  // the discount attributable to their membership, captured for "Saved with
  // membership" on the dashboard.
  let customerId: string | null = null
  let memberDiscountAmount = 0
  // An Aster & Hem gift card redeemed at the review step. The coupon was minted by
  // /api/gift-card/apply (Coupons API); the Checkout Session applies it natively
  // via `discounts` so the card pays its share and the Checkout collects the rest.
  let giftCardCouponId: string | null = null
  try {
    const body = await req.json()
    cartItems = body.cartItems ?? []
    shipping = typeof body.shipping === "number" ? body.shipping : 0
    shippingLabel = typeof body.shippingLabel === "string" ? body.shippingLabel : "Standard Delivery"
    discountAmount = typeof body.discountAmount === "number" ? body.discountAmount : 0
    discountLabel = typeof body.discountLabel === "string" ? body.discountLabel : "Discount"
    membershipFee = typeof body.membershipFee === "number" ? body.membershipFee : 0
    customerId = typeof body.customerId === "string" && body.customerId ? body.customerId : null
    memberDiscountAmount =
      typeof body.memberDiscountAmount === "number" ? body.memberDiscountAmount : 0
    giftCardCouponId =
      typeof body.giftCardCouponId === "string" && body.giftCardCouponId ? body.giftCardCouponId : null
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const stripe = getStripe()

  // Demo mode — no Stripe key configured
  if (!stripe) {
    return NextResponse.json({ clientSecret: null, demoMode: true })
  }

  const lineItems = cartItems
    .map((item) => {
      const product = getProductById(item.productId)
      if (!product) return null
      return {
        price_data: {
          currency: "usd", // USD required for ACS Preview
          product_data: {
            name: product.name,
            images: product.image.startsWith("http") ? [product.image] : undefined,
            metadata: { ah_sku: product.id, category: product.category },
          },
          unit_amount: Math.round(product.price * 100),
        },
        quantity: item.quantity,
      }
    })
    .filter((li): li is NonNullable<typeof li> => Boolean(li))

  // Track whether the order contains physical goods so we only collect a
  // shipping address / quote when something actually needs to be delivered.
  const hasPhysicalGoods = lineItems.length > 0

  // Add the paid Edit Club membership as its own subscription-style line item
  // so it shows distinctly on the Stripe invoice.
  if (membershipFee > 0) {
    lineItems.push({
      price_data: {
        currency: "usd", // USD required for ACS Preview
        product_data: {
          name: MEMBERSHIP_LABEL,
          images: undefined,
          metadata: { ah_sku: "linen-lovers-membership", category: "Membership" },
        },
        unit_amount: Math.round(membershipFee * 100),
      },
      quantity: 1,
    })
  }

  if (lineItems.length === 0) {
    return NextResponse.json({ error: "Nothing to purchase" }, { status: 400 })
  }

  // The customer id comes from the shopper's localStorage and can be stale — the
  // Stripe customer may have been deleted, or belong to a different Stripe
  // account/mode. Attaching a non-existent customer makes
  // checkout.sessions.create throw "No such customer", which previously surfaced
  // as "We couldn't start secure checkout" with no way to recover. Validate it
  // first and fall back to a guest checkout if it's gone — the member discount is
  // already included in the payload, so the shopper still gets their pricing.
  let customerInvalid = false
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId)
      if ((existing as { deleted?: boolean }).deleted) {
        customerId = null
        customerInvalid = true
      }
    } catch {
      customerId = null
      customerInvalid = true
    }
  }

  try {
    // Stripe Checkout allows only ONE coupon per session, so we reconcile the two
    // possible discounts here:
    //   - the The Edit Club / promo member discount, and
    //   - the redeemed Aster & Hem gift card (already a coupon from the Coupons API).
    // When both are present we mint a single combined coupon for the session; the
    // original gift card coupon still exists in Stripe as the redemption record.
    let giftCardValue = 0
    if (giftCardCouponId) {
      try {
        const giftCoupon = await stripe.coupons.retrieve(giftCardCouponId)
        if (giftCoupon.amount_off) giftCardValue = giftCoupon.amount_off / 100
      } catch (error) {
        console.log("[v0] gift-card coupon retrieve failed:", error)
      }
    }

    let couponId: string | undefined
    if (giftCardValue > 0 && discountAmount > 0) {
      const combined = await stripe.coupons.create({
        amount_off: Math.round((discountAmount + giftCardValue) * 100),
        currency: "usd",
        duration: "once",
        name: `${discountLabel.slice(0, 20)} + Gift Card`.slice(0, 40),
        metadata: { kind: "member_discount_plus_gift_card", gift_card_coupon: giftCardCouponId ?? "" },
      })
      couponId = combined.id
    } else if (giftCardValue > 0 && giftCardCouponId) {
      // Gift card only — apply the coupon minted at redemption directly.
      couponId = giftCardCouponId
    } else if (discountAmount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(discountAmount * 100),
        currency: "usd",
        duration: "once",
        name: discountLabel.slice(0, 40),
      })
      couponId = coupon.id
    }

    // The portion of the discount that came from the Edit Club membership,
    // recorded (in cents) on the PaymentIntent so the dashboard can total real
    // "Saved with membership" amounts from actual purchases.
    const memberSavingsCents = Math.round(memberDiscountAmount * 100)
    const piMetadata: Record<string, string> = {}
    if (memberSavingsCents > 0) {
      piMetadata[SAVINGS_METADATA_KEY] = String(memberSavingsCents)
      piMetadata[SAVINGS_LABEL_METADATA_KEY] = "The Edit Club member discount"
    }
    // Record the product-level order contents on the PaymentIntent so the
    // member's "Recent purchases" can list the items they bought. The reader
    // (mapCharge) reads names/categories from PaymentIntent metadata — the line
    // items alone aren't enough — so without this, orders placed in the same
    // checkout as a membership sign-up showed only a generic "Aster & Hem order".
    const orderSummary = summarizeCartItems(cartItems)
    if (orderSummary.items) piMetadata[ITEMS_METADATA_KEY] = orderSummary.items
    if (orderSummary.categories) piMetadata[CATEGORIES_METADATA_KEY] = orderSummary.categories

    const origin = req.headers.get("origin") ?? new URL(req.url).origin

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      // Card payments stay fully inline (onComplete fires on the client).
      // Redirect-based methods like Klarna & Afterpay require a redirect to the
      // provider, so we use "if_required" + a return_url that brings the shopper
      // back to a confirmation page only when a redirect actually happens.
      redirect_on_completion: "if_required",
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      // Disable Stripe Adaptive Pricing so the checkout always shows the default
      // USD amounts (we present these as AU pricing) rather than converting to
      // the shopper's local currency.
      adaptive_pricing: { enabled: false },
      // Attach the purchase to the signed-in member so it (and its savings)
      // appears on their membership dashboard.
      ...(customerId ? { customer: customerId } : {}),
      line_items: lineItems,
      mode: "payment",
      // Explicitly choose the methods to show (this also hides bank/BECS Direct
      // Debit, which would otherwise appear via automatic methods). Apple Pay &
      // Google Pay are surfaced automatically as wallets whenever `card` is
      // enabled, so they are not listed separately.
      //
      // NOTE: Afterpay/Clearpay and Klarna are intentionally NOT offered here.
      // This account is AU-based, where those BNPL methods only support AUD, but
      // the checkout presents prices in USD (with adaptive_pricing disabled).
      // Including them made Stripe reject the whole session ("afterpay_clearpay
      // only supports aud"), which surfaced as "We couldn't start secure
      // checkout". Card + Link (+ wallets) work in USD and keep checkout reliable.
      payment_method_types: ["card", "link"],
      payment_intent_data: Object.keys(piMetadata).length ? { metadata: piMetadata } : undefined,
      // Only collect a shipping address / delivery quote when the order has
      // physical goods. A membership-only purchase is digital, so we skip it.
      ...(hasPhysicalGoods
        ? {
            shipping_address_collection: { allowed_countries: ["AU"] as const },
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount" as const,
                  fixed_amount: { amount: Math.round(shipping * 100), currency: "usd" },
                  display_name: shippingLabel.slice(0, 50),
                },
              },
            ],
          }
        : {}),
      discounts: couponId ? [{ coupon: couponId }] : undefined,
      metadata: {
        demo: "aster_hem_acs_demo",
        powered_by: "stripe_agentic_commerce_suite",
        ah_shipping: shippingLabel,
        ah_discount: discountLabel,
        ...(giftCardValue > 0
          ? {
              ah_gift_card_coupon: giftCardCouponId ?? "",
              ah_gift_card_amount: String(Math.round(giftCardValue * 100)),
            }
          : {}),
        ...piMetadata,
      },
    })

    // `customerInvalid` tells the client its saved member id was stale so it can
    // clear localStorage and stop sending it on the next attempt.
    return NextResponse.json({ clientSecret: session.client_secret, customerInvalid })
  } catch (error) {
    console.log("[v0] checkout session error:", error)
    const message = error instanceof Error ? error.message : "We couldn't start secure checkout. Please try again."
    return NextResponse.json({ clientSecret: null, error: message }, { status: 502 })
  }
}
