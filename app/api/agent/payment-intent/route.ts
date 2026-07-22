import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { DEMO_USER } from "@/lib/demo-user"
import { getProductById, summarizeCartItems } from "@/lib/products"
import { computeAgentPrice, isValidLinenNumber } from "@/lib/shipping"
import {
  ITEMS_METADATA_KEY,
  CATEGORIES_METADATA_KEY,
  SAVINGS_METADATA_KEY,
  SAVINGS_LABEL_METADATA_KEY,
} from "@/lib/membership"
import type { CartItem } from "@/lib/types"

const AGENT = "aster_hem_stylist"

interface PaymentIntentBody {
  cartItems?: CartItem[]
  fulfillment?: "delivery" | "pickup"
  // A Edit Club membership number. When valid, the buyer gets the member
  // discount and the lower free-delivery threshold. Validated server-side so the
  // charged amount can't be discounted from the client.
  linenNumber?: string
  // When present we update the amount on an existing PaymentIntent (e.g. the
  // buyer switched delivery ↔ pickup) instead of creating a new one — the
  // clientSecret stays stable so the mounted Payment Element keeps its state.
  paymentIntentId?: string
  // The Edit Club member's Stripe customer id (from localStorage). When
  // present the order is attached to their customer so it appears in their
  // purchase history and the AI Stylist can personalise future recommendations.
  customerId?: string | null
}

// Price the order server-side — never trust client amounts. Returns the
// subtotal, member discount, shipping and total in dollars.
function priceOrder(cartItems: CartItem[], fulfillment: "delivery" | "pickup", isMember: boolean) {
  const items = cartItems
    .map((item) => {
      const product = getProductById(item.productId)
      return product ? { price: product.price, quantity: item.quantity, onSale: false } : null
    })
    .filter((i): i is { price: number; quantity: number; onSale: boolean } => i !== null)

  return computeAgentPrice({ items, fulfillment, isMember })
}

export async function POST(req: NextRequest) {
  let body: PaymentIntentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const cartItems = body.cartItems ?? []
  const fulfillment = body.fulfillment === "pickup" ? "pickup" : "delivery"
  if (cartItems.length === 0) {
    return NextResponse.json({ error: "Nothing to purchase" }, { status: 400 })
  }

  const stripe = getStripe()

  // Always attach transactions to Liv's Stripe customer
  const customerId = DEMO_USER.stripeCustomerId

  // Determine membership SERVER-SIDE. The authoritative source is the customer's
  // own Stripe record (this also works for auto-detected members whose "LL-123"
  // id isn't a 6-digit number). Guests who type a number fall back to format
  // validation.
  let memberApplied = Boolean(body.linenNumber && isValidLinenNumber(body.linenNumber))
  if (stripe && customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (!(customer as Stripe.DeletedCustomer).deleted && (customer as Stripe.Customer).metadata?.member_id) {
        memberApplied = true
      }
    } catch {
      // Couldn't load the customer — fall back to the typed-number result.
    }
  }

  const { subtotal, memberDiscount, shipping, shippingFree, freeShipThreshold, total } = priceOrder(
    cartItems,
    fulfillment,
    memberApplied,
  )
  const amountCents = Math.round(total * 100)
  const itemCount = cartItems.reduce((n, i) => n + i.quantity, 0)

  // Surfaced to the client so the breakdown matches exactly what we charge.
  const pricing = {
    amount: total,
    subtotal,
    memberDiscount,
    shipping,
    shippingFree,
    freeShipThreshold,
    memberApplied,
    itemCount,
  }

  // Demo mode — no Stripe key configured. The client falls back to a simulated
  // payment so the in-chat experience still works in the preview.
  if (!stripe) {
    return NextResponse.json({
      clientSecret: null,
      demoMode: true,
      ...pricing,
    })
  }

  try {
    const metadata: Record<string, string> = {
      flow: "agent_inline_checkout",
      agent: AGENT,
      fulfillment,
      linen_lovers: memberApplied ? "applied" : "none",
      powered_by: "stripe_payment_element",
    }
    // Record the product-level order contents so the AI Stylist can read this
    // order back per-item when making future recommendations.
    const orderSummary = summarizeCartItems(cartItems)
    if (orderSummary.items) metadata[ITEMS_METADATA_KEY] = orderSummary.items
    if (orderSummary.categories) metadata[CATEGORIES_METADATA_KEY] = orderSummary.categories

    // Record the The Edit Club savings so the member's dashboard "Saved with
    // membership" total includes in-chat orders. Without this, agent purchases
    // would show no savings even when the member discount was applied.
    const memberSavingsCents = Math.round(memberDiscount * 100)
    if (memberApplied && memberSavingsCents > 0) {
      metadata[SAVINGS_METADATA_KEY] = String(memberSavingsCents)
      metadata[SAVINGS_LABEL_METADATA_KEY] = "The Edit Club member discount"
    }

    // A customer session lets the Payment Element surface the member's saved
    // payment methods (the card / Link on file) so they don't re-enter details.
    let customerSessionClientSecret: string | null = null
    if (customerId) {
      try {
        const session = await stripe.customerSessions.create({
          customer: customerId,
          components: {
            payment_element: {
              enabled: true,
              features: {
                payment_method_redisplay: "enabled",
                // Show methods saved with any redisplay value (e.g. a card saved
                // during membership sign-up), not just those marked "always".
                payment_method_allow_redisplay_filters: ["always", "limited", "unspecified"],
                payment_method_save: "enabled",
                payment_method_save_usage: "off_session",
                payment_method_remove: "enabled",
              },
            },
          },
        })
        customerSessionClientSecret = session.client_secret
      } catch (e) {
        console.log("[v0] customer session error:", e)
      }
    }

    // Update the existing intent's amount when the buyer changes fulfilment so
    // the mounted Payment Element doesn't have to remount.
    if (body.paymentIntentId) {
      const updated = await stripe.paymentIntents.update(body.paymentIntentId, {
        amount: amountCents,
        metadata,
      })
      return NextResponse.json({
        clientSecret: updated.client_secret,
        paymentIntentId: updated.id,
        customerSessionClientSecret,
        demoMode: false,
        ...pricing,
      })
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      description: `Aster & Hem Stylist — ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      customer: customerId,
      metadata,
    })

    return NextResponse.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      customerSessionClientSecret,
      demoMode: false,
      ...pricing,
    })
  } catch (error) {
    console.log("[v0] payment-intent error:", error)
    // Fall back to demo mode so the buyer can still complete an order in chat.
    return NextResponse.json({
      clientSecret: null,
      demoMode: true,
      ...pricing,
    })
  }
}
