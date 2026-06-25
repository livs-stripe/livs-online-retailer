import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"

// After the Payment Element confirms a SetupIntent client-side, we finish the
// card update on the server: pull the new payment method off the SetupIntent
// (never trust a client-sent id), then make it the default for both the customer
// invoice settings and the active subscription so the next renewal uses it.
export async function POST(req: NextRequest) {
  let setupIntentId: string | undefined
  let customerId: string | undefined
  let subscriptionId: string | undefined
  try {
    const body = await req.json()
    setupIntentId = body.setupIntentId
    customerId = body.customerId
    subscriptionId = body.subscriptionId
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!setupIntentId || !customerId) {
    return NextResponse.json({ error: "Missing setupIntentId or customerId" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  try {
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    })

    // Guard: the SetupIntent must belong to this customer and be completed.
    const intentCustomer =
      typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id
    if (intentCustomer !== customerId) {
      return NextResponse.json({ error: "Payment method mismatch." }, { status: 400 })
    }
    if (setupIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Card was not confirmed." }, { status: 400 })
    }

    const pm = setupIntent.payment_method
    const paymentMethodId = typeof pm === "string" ? pm : pm?.id
    if (!paymentMethodId) {
      return NextResponse.json({ error: "No payment method found." }, { status: 400 })
    }

    // Default for any future invoices created for this customer.
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })

    // Default for the membership subscription's automatic renewals.
    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      })
    }

    const card = typeof pm === "string" ? null : pm?.card
    return NextResponse.json({
      ok: true,
      brand: card?.brand ?? null,
      last4: card?.last4 ?? null,
    })
  } catch (error) {
    console.log("[v0] payment-method error:", error)
    return NextResponse.json({ error: "Unable to save the new card." }, { status: 500 })
  }
}
