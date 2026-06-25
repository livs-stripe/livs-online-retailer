import type { NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { acpError, formatUsd, jsonCors, preflight } from "@/lib/acp"

// POST /api/acp/checkout/update — step 2 of the ACP checkout. Attaches the
// shipping address to the existing PaymentIntent and marks it ready to confirm.

interface Shipping {
  name?: string
  line1?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
}

export function OPTIONS() {
  return preflight()
}

function shippingSummary(s: Shipping): string {
  const region = [s.city, s.state, s.postal_code].filter(Boolean).join(" ")
  return [s.name, s.line1, region, s.country].filter(Boolean).join(", ")
}

export async function POST(req: NextRequest) {
  let body: { checkout_id?: string; shipping?: Shipping }
  try {
    body = await req.json()
  } catch {
    return acpError("INVALID_BODY", "Request body must be valid JSON.", 400)
  }

  const checkoutId = body.checkout_id?.trim()
  const shipping = body.shipping
  if (!checkoutId) {
    return acpError("MISSING_CHECKOUT_ID", "checkout_id is required.", 400)
  }
  if (!shipping || !shipping.name || !shipping.line1) {
    return acpError("INVALID_SHIPPING", "Shipping name and line1 are required.", 400)
  }

  const summary = shippingSummary(shipping)
  const stripe = getStripe()

  // Demo mode — no Stripe key. Echo a ready-to-confirm response.
  if (!stripe) {
    return jsonCors({
      checkout_id: checkoutId,
      status: "ready_to_confirm",
      shipping_confirmed: true,
      shipping_summary: summary,
      payment_method: "Visa ending 4242 (test)",
      order_total: "Confirmed at next step",
      next_step: "Confirm to complete purchase",
    })
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(checkoutId)

    const updated = await stripe.paymentIntents.update(checkoutId, {
      shipping: {
        name: shipping.name,
        address: {
          line1: shipping.line1,
          city: shipping.city,
          state: shipping.state,
          country: shipping.country,
          postal_code: shipping.postal_code,
        },
      },
      metadata: {
        ...intent.metadata,
        shipping_name: shipping.name ?? "",
        shipping_summary: summary.slice(0, 480),
      },
    })

    return jsonCors({
      checkout_id: updated.id,
      status: "ready_to_confirm",
      shipping_confirmed: true,
      shipping_summary: summary,
      payment_method: "Visa ending 4242 (test)",
      order_total: formatUsd(updated.amount),
      next_step: "Confirm to complete purchase",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update checkout."
    const notFound = /no such payment_?intent/i.test(message)
    return acpError(
      notFound ? "CHECKOUT_NOT_FOUND" : "STRIPE_ERROR",
      notFound ? `No checkout found for id "${checkoutId}".` : message,
      notFound ? 404 : 502,
    )
  }
}
