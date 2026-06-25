import type { NextRequest } from "next/server"
import { getProductById } from "@/lib/products"
import { getStripe } from "@/lib/stripe"
import { acpError, formatUsd, jsonCors, preflight, toCents } from "@/lib/acp"

// POST /api/acp/checkout/complete — step 3 of the ACP checkout. Confirms the
// PaymentIntent with a Stripe test card, captures it, and returns the order.

export function OPTIONS() {
  return preflight()
}

function orderIdFrom(checkoutId: string): string {
  return `ADR-${checkoutId.slice(-8).toUpperCase()}`
}

// Rebuild a human-readable line list from the compact items stored in metadata.
function itemsFromMetadata(raw: string | undefined) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { id: string; q: number }[]
    return parsed
      .map((entry) => {
        const product = getProductById(String(entry.id))
        if (!product) return null
        const unit = toCents(product.price)
        return {
          product_id: product.id,
          name: product.variant ? `${product.name} (${product.variant})` : product.name,
          quantity: entry.q,
          unit_price: formatUsd(unit),
          subtotal: formatUsd(unit * entry.q),
        }
      })
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  let body: { checkout_id?: string; confirm?: boolean }
  try {
    body = await req.json()
  } catch {
    return acpError("INVALID_BODY", "Request body must be valid JSON.", 400)
  }

  const checkoutId = body.checkout_id?.trim()
  if (!checkoutId) {
    return acpError("MISSING_CHECKOUT_ID", "checkout_id is required.", 400)
  }
  if (body.confirm !== true) {
    return acpError("NOT_CONFIRMED", "Set confirm: true to complete the purchase.", 400)
  }

  const stripe = getStripe()

  // Demo mode — no Stripe key. Return a faithfully-shaped confirmed order.
  if (!stripe) {
    return jsonCors({
      checkout_id: checkoutId,
      status: "confirmed",
      order_id: orderIdFrom(checkoutId),
      amount_charged: "$0.00",
      payment_method: "Visa •••• 4242",
      estimated_delivery: "3–5 business days",
      confirmation_message:
        "Your Adairs order is confirmed! You'll receive a shipping notification soon.",
      items_ordered: [],
      stripe_payment_id: checkoutId,
    })
  }

  try {
    const confirmed = await stripe.paymentIntents.confirm(checkoutId, {
      payment_method: "pm_card_visa",
    })
    const captured = await stripe.paymentIntents.capture(confirmed.id)

    return jsonCors({
      checkout_id: captured.id,
      status: "confirmed",
      order_id: orderIdFrom(captured.id),
      amount_charged: formatUsd(captured.amount_received || captured.amount),
      payment_method: "Visa •••• 4242",
      estimated_delivery: "3–5 business days",
      confirmation_message:
        "Your Adairs order is confirmed! You'll receive a shipping notification soon.",
      items_ordered: itemsFromMetadata(captured.metadata?.items),
      stripe_payment_id: captured.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete checkout."
    const notFound = /no such payment_?intent/i.test(message)
    return acpError(
      notFound ? "CHECKOUT_NOT_FOUND" : "STRIPE_ERROR",
      notFound ? `No checkout found for id "${checkoutId}".` : message,
      notFound ? 404 : 502,
    )
  }
}
