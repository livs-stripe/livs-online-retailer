import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { isValidLinenNumber, normaliseLinenNumber } from "@/lib/shipping"
import { MEMBER_ID_METADATA_KEY } from "@/lib/membership"
import { findCustomerByEmail, findCustomerByMemberId } from "@/lib/member-lookup"

// Looks up an existing Linen Lover by EITHER the email on their Stripe customer
// record OR their Linen Lovers member number (e.g. "LL-123"). This is a
// lightweight "login" for the demo so the dashboard/portal and member pricing
// can load. In a real app this would sit behind proper authentication.
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  let email = ""
  let memberId = ""
  try {
    const body = await req.json()
    email = String(body.email ?? "").trim().toLowerCase()
    memberId = String(body.memberId ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    let customer: Stripe.Customer | null = null

    if (memberId) {
      // Resolve by Linen Lovers number. We accept "LL-123", "ll123" or "123"
      // and normalise to the canonical "LL-<n>" stored in customer metadata.
      if (!isValidLinenNumber(memberId)) {
        return NextResponse.json(
          { error: "Enter a valid Linen Lovers number (e.g. LL-123)." },
          { status: 400 },
        )
      }
      customer = await findCustomerByMemberId(stripe, normaliseLinenNumber(memberId))
      if (!customer) {
        return NextResponse.json(
          { error: "We couldn't find that Linen Lovers number." },
          { status: 404 },
        )
      }
    } else {
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
      }
      // Test-clock-aware email match (lib/member-lookup). A plain
      // customers.list({ email }) would miss test-clock members entirely.
      // Prefer a customer carrying a member_id; fall back to any email match.
      const { withMemberId, anyMatch } = await findCustomerByEmail(stripe, email)
      customer = withMemberId ?? anyMatch
      if (!customer) {
        return NextResponse.json(
          { error: "We couldn't find a membership for that email." },
          { status: 404 },
        )
      }
    }

    return NextResponse.json({
      customerId: customer.id,
      name: customer.name ?? null,
      email: customer.email ?? null,
      memberId: customer.metadata?.[MEMBER_ID_METADATA_KEY] ?? null,
    })
  } catch (error) {
    console.log("[v0] membership lookup error:", error)
    return NextResponse.json({ error: "Unable to look up that membership." }, { status: 500 })
  }
}
