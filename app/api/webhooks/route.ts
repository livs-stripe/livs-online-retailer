import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"

// Stripe webhook receiver for the The Edit Club subscription demo.
//
// Forward events locally with:
//   stripe listen --forward-to localhost:3000/api/webhooks
//
// Set STRIPE_WEBHOOK_SECRET to verify signatures. Without it (e.g. quick demo)
// we parse the event unverified and still log it.
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ received: true, demoMode: true })
  }

  const body = await req.text()
  const signature = req.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event
  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } else {
      event = JSON.parse(body) as Stripe.Event
    }
  } catch (err) {
    console.log("[v0] webhook signature verification failed:", (err as Error).message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session
      console.log("[v0] webhook checkout.session.completed:", {
        id: s.id,
        customer: s.customer,
        subscription: s.subscription,
        email: s.customer_details?.email,
      })
      break
    }
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice
      console.log("[v0] webhook invoice.payment_succeeded:", {
        id: inv.id,
        customer: inv.customer,
        amountPaid: inv.amount_paid,
      })
      break
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice
      console.log("[v0] webhook invoice.payment_failed:", {
        id: inv.id,
        customer: inv.customer,
        attemptCount: inv.attempt_count,
      })
      break
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      console.log("[v0] webhook customer.subscription.deleted:", {
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
      })
      break
    }
    default:
      console.log("[v0] webhook unhandled event:", event.type)
  }

  return NextResponse.json({ received: true })
}
