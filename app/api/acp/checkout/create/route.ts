import type { NextRequest } from "next/server"
import { getProductById } from "@/lib/products"
import { getStripe } from "@/lib/stripe"
import { acpError, formatUsd, jsonCors, preflight, toCents } from "@/lib/acp"

// POST /api/acp/checkout/create — step 1 of the ACP checkout. Prices the cart
// server-side from the catalogue and opens a Stripe PaymentIntent with manual
// capture (so we only capture funds once the order is confirmed downstream).

interface CheckoutItem {
  product_id: string
  quantity: number
}

export function OPTIONS() {
  return preflight()
}

export async function POST(req: NextRequest) {
  let body: { items?: CheckoutItem[] }
  try {
    body = await req.json()
  } catch {
    return acpError("INVALID_BODY", "Request body must be valid JSON.", 400)
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return acpError("EMPTY_CART", "Provide at least one item to check out.", 400)
  }

  // Resolve + price every line server-side. Never trust client amounts.
  const lines: { product_id: string; name: string; quantity: number; unit_cents: number; subtotal_cents: number }[] = []
  for (const item of items) {
    const product = getProductById(String(item.product_id))
    if (!product) {
      return acpError("PRODUCT_NOT_FOUND", `No product found for id "${item.product_id}".`, 404)
    }
    const quantity = Number.isFinite(item.quantity) && item.quantity > 0 ? Math.floor(item.quantity) : 1
    const unit_cents = toCents(product.price)
    lines.push({
      product_id: product.id,
      name: product.variant ? `${product.name} (${product.variant})` : product.name,
      quantity,
      unit_cents,
      subtotal_cents: unit_cents * quantity,
    })
  }

  const totalCents = lines.reduce((sum, l) => sum + l.subtotal_cents, 0)
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0)

  // Stripe metadata values cap at 500 chars — keep the items payload compact.
  const compactItems = JSON.stringify(lines.map((l) => ({ id: l.product_id, q: l.quantity }))).slice(0, 480)

  const buildItemsResponse = () =>
    lines.map((l) => ({
      product_id: l.product_id,
      name: l.name,
      quantity: l.quantity,
      unit_price: formatUsd(l.unit_cents),
      subtotal: formatUsd(l.subtotal_cents),
    }))

  const orderSummary = {
    item_count: itemCount,
    subtotal_display: formatUsd(totalCents),
    shipping_display: "Calculated at next step",
    total_display: formatUsd(totalCents),
  }

  const stripe = getStripe()

  // Demo mode — no Stripe key. Return a faithfully-shaped simulated checkout.
  if (!stripe) {
    const checkoutId = `pi_demo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    return jsonCors({
      checkout_id: checkoutId,
      status: "created",
      items: buildItemsResponse(),
      order_summary: orderSummary,
      next_step: "Provide shipping address to continue",
    })
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      capture_method: "manual",
      // Card-only with no redirect-based methods, so the agent can confirm
      // server-side with a test card without needing a return_url.
      payment_method_types: ["card"],
      metadata: {
        source: "acp_demo",
        agent: "chatgpt_custom_gpt",
        seller: "adairs",
        items: compactItems,
      },
    })

    return jsonCors({
      checkout_id: paymentIntent.id,
      status: "created",
      items: buildItemsResponse(),
      order_summary: orderSummary,
      next_step: "Provide shipping address to continue",
    })
  } catch (error) {
    return acpError(
      "STRIPE_ERROR",
      error instanceof Error ? error.message : "Failed to create checkout.",
      502,
    )
  }
}
