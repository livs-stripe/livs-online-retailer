import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"

// Creates a SetupIntent so a member can save a NEW card via the Stripe Payment
// Element (no hosted Stripe UI). The card is collected off-session for future
// subscription renewals. The returned clientSecret is mounted client-side.
export async function POST(req: NextRequest) {
  let customerId: string | undefined
  try {
    const body = await req.json()
    customerId = body.customerId
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      // Saved for charging the membership renewal automatically later on.
      usage: "off_session",
      // Renewals are card-only, so collect a card (+ Apple Pay / Google Pay
      // wallets) and never bank/BECS Direct Debit.
      payment_method_types: ["card"],
    })
    return NextResponse.json({ clientSecret: setupIntent.client_secret })
  } catch (error) {
    console.log("[v0] setup-intent error:", error)
    return NextResponse.json({ error: "Unable to start card update." }, { status: 500 })
  }
}
