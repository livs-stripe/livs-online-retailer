import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { getProductById } from "@/lib/products"
import { resolveMembershipPrice } from "@/lib/membership-price"
import {
  createNowTestClock,
  SIMULATION_METADATA_KEY,
  SIMULATION_METADATA_VALUE,
} from "@/lib/test-clock"
import type { CartItem } from "@/lib/types"

// Seamless "join from the cart" checkout.
//
// Runs an EMBEDDED Checkout in `subscription` mode so a single payment:
//  - creates the Stripe customer (on a Test Clock for the 2-year simulation),
//  - creates the auto-renewing 2-year The Edit Club subscription,
//  - adds any products the shopper is buying as one-time lines on the first
//    invoice, and
//  - auto-pays that first invoice.
// The $20 welcome reward is NOT applied to this order — it arrives within 48
// hours of joining (delivered separately), so checkout carries no reward coupon.
export async function POST(req: NextRequest) {
  let cartItems: CartItem[] = []
  let shipping = 0
  let shippingLabel = "Standard Delivery"
  try {
    const body = await req.json()
    cartItems = Array.isArray(body.cartItems) ? body.cartItems : []
    shipping = typeof body.shipping === "number" ? body.shipping : 0
    shippingLabel = typeof body.shippingLabel === "string" ? body.shippingLabel : "Standard Delivery"
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ clientSecret: null, demoMode: true })
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin

  try {
    const price = await resolveMembershipPrice(stripe)
    if (!price) {
      return NextResponse.json({ error: "No active membership price found" }, { status: 400 })
    }

    // The subscription's first invoice must contain ONLY the 2-year membership.
    // Any products in the cart are billed on a SEPARATE one-time invoice once
    // checkout completes (see GET /api/checkout-session), so they never land on
    // the subscription invoice.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: price.id, quantity: 1 }]

    // Resolve valid products now (prices come from the server-side catalog) and
    // stash them on the session so the post-completion invoice can rebuild them.
    const productItems = cartItems
      .map((item) => {
        const product = getProductById(item.productId)
        return product ? { productId: product.id, quantity: item.quantity } : null
      })
      .filter((p): p is { productId: string; quantity: number } => Boolean(p))
    const hasPhysicalGoods = productItems.length > 0

    // Pre-create the customer on a fresh Test Clock so the membership can be
    // fast-forwarded ("2 years from now") later. Best-effort: a normal customer
    // is created by Checkout if this fails.
    let customerId: string | undefined
    try {
      const clock = await createNowTestClock(stripe, "Edit Club simulation")
      const customer = await stripe.customers.create({
        test_clock: clock.id,
        metadata: {
          membership: "linen_lovers",
          source: "adairs_demo",
          [SIMULATION_METADATA_KEY]: SIMULATION_METADATA_VALUE,
        },
      })
      customerId = customer.id
    } catch (clockErr) {
      console.log("[v0] join-checkout test clock skipped:", clockErr)
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      mode: "subscription",
      // Card + Link + wallets (Apple Pay / Google Pay surface automatically with
      // `card`). Bank/BECS is intentionally excluded. Klarna & Afterpay can't be
      // used here because Stripe doesn't support BNPL on recurring subscriptions.
      payment_method_types: ["card", "link"],
      adaptive_pricing: { enabled: false },
      line_items: lineItems,
      subscription_data: {
        // Headline shown on the subscription in the Stripe Dashboard. Makes it
        // explicit that the subscription itself is only the $19.95 membership and
        // that any other items bought at the same time are billed separately, so
        // the membership never looks like it cost more than it did.
        description: hasPhysicalGoods
          ? "The Edit Club 2-Year Membership — $19.95. Other items in this order are billed on a separate invoice."
          : "The Edit Club 2-Year Membership — $19.95.",
        metadata: { membership: "linen_lovers", source: "adairs_demo" },
      },
      metadata: {
        membership: "linen_lovers",
        source: "adairs_demo",
        demo: "adairs_acs_demo",
        powered_by: "stripe_agentic_commerce_suite",
        // Products are billed on a separate invoice after completion so the
        // subscription invoice stays membership-only. The completion handler
        // rebuilds them from this metadata (prices re-resolved server-side).
        products_json: JSON.stringify(productItems),
        shipping_amount: String(hasPhysicalGoods ? shipping : 0),
        shipping_label: shippingLabel.slice(0, 250),
      },
      // Collect a delivery address when there are physical goods. (Shipping
      // cost is billed as a line item above — `shipping_options` is not allowed
      // in subscription mode.)
      ...(hasPhysicalGoods
        ? { shipping_address_collection: { allowed_countries: ["AU", "NZ", "US"] as const } }
        : {}),
    }

    if (customerId) {
      params.customer = customerId
      // Only sync the address automatically. We deliberately DON'T use
      // `name: "auto"` here because that copies the card's billing/cardholder
      // name (often the literal "Card Holder Name" placeholder) onto the
      // customer. The real name the shopper typed is applied after completion in
      // `ensureMemberRecord` from the collected checkout details instead.
      params.customer_update = { address: "auto" }
    }

    const session = await stripe.checkout.sessions.create(params)

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      customerId: customerId ?? null,
    })
  } catch (error) {
    console.log("[v0] join-checkout error:", error)
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 })
  }
}
