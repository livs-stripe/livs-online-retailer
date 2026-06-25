import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"

// Cancels (or resumes) a Edit Club membership via pure API — no Stripe-hosted
// UI. We set `cancel_at_period_end: true` so the member keeps access until the
// end of the term they already paid for and simply stops auto-renewing. We never
// issue a refund: subscriptions are non-refundable, this only stops renewal.
export async function POST(req: NextRequest) {
  let subscriptionId: string | undefined
  let resume = false
  try {
    const body = await req.json()
    subscriptionId = body.subscriptionId
    resume = Boolean(body.resume)
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!subscriptionId) {
    return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  try {
    // resume === true flips auto-renew back on; otherwise schedule cancellation.
    const sub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !resume,
    })

    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
      status: sub.status,
    })
  } catch (error) {
    console.log("[v0] cancel route error:", error)
    return NextResponse.json({ error: "Unable to update your membership." }, { status: 500 })
  }
}
