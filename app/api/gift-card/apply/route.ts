import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { GIFT_CARD_VALID_PIN, GIFT_CARD_NUMBER_LENGTH, GIFT_CARD_DEMO_BALANCE } from "@/lib/checkout-config"

// Redeems an Adairs gift card by validating it server side and minting a one-off
// Stripe coupon (Coupons API) for the card balance. The coupon id is handed back
// to the client, which passes it to whichever payment API settles the order:
//   - PaymentIntents API (Elements mode) reads the coupon's amount_off and
//     subtracts it from the intent amount.
//   - Checkout Sessions API (embedded mode) applies it natively via `discounts`.
//
// Demo rules: any GIFT_CARD_NUMBER_LENGTH-digit number is accepted and the PIN
// must equal GIFT_CARD_VALID_PIN, otherwise the card is declined.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rawNumber = String(body.number ?? "").replace(/\s+/g, "")
    const pin = String(body.pin ?? "").trim()

    if (!new RegExp(`^\\d{${GIFT_CARD_NUMBER_LENGTH}}$`).test(rawNumber)) {
      return NextResponse.json(
        { ok: false, error: `Please enter a valid ${GIFT_CARD_NUMBER_LENGTH}-digit gift card number.` },
        { status: 400 },
      )
    }

    if (pin !== GIFT_CARD_VALID_PIN) {
      return NextResponse.json(
        { ok: false, error: "Gift card declined. Please check your PIN and try again." },
        { status: 402 },
      )
    }

    const balance = GIFT_CARD_DEMO_BALANCE
    const last4 = rawNumber.slice(-4)

    const stripe = getStripe()
    // Without Stripe keys we still approve the card so the demo flow works; the
    // checkout falls back to a simulated payment downstream.
    if (!stripe) {
      return NextResponse.json({ ok: true, demoMode: true, couponId: null, balance, last4 })
    }

    // A unique, single-use coupon scoped to this redemption. amount_off is in the
    // smallest currency unit (cents). Stripe automatically caps the discount at
    // the order total, so a $50 card on a $40 order only ever removes $40.
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(balance * 100),
      currency: "usd",
      duration: "once",
      name: `Adairs Gift Card ****${last4}`,
      metadata: { kind: "adairs_gift_card", last4 },
    })

    return NextResponse.json({ ok: true, couponId: coupon.id, balance, last4 })
  } catch (error) {
    console.log("[v0] gift-card apply error:", error)
    return NextResponse.json({ ok: false, error: "Couldn't apply that gift card. Please try again." }, { status: 500 })
  }
}
