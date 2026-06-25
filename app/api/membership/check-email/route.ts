import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { MEMBER_ID_METADATA_KEY } from "@/lib/membership"
import { findCustomerByEmail, hasActiveMembershipSubscription } from "@/lib/member-lookup"

// Pre-join guard: given an email, reports whether that person is ALREADY a Linen
// Lovers member. The join flow calls this before starting checkout so the same
// person can't accidentally buy a second membership — if they already have one
// we sign them in to their existing account instead of creating a duplicate.
//
// IMPORTANT: every demo member's Stripe customer is created on a Test Clock (for
// the 2-year simulation), and Stripe EXCLUDES test-clock customers from the
// Search API, from `customers.list({ email })`, AND from the default
// `customers.list()`. The only way to reach them is per-clock listing, which is
// exactly what findCustomerByEmail (lib/member-lookup) does. Relying on the
// plain list/search here was the bug that let a known member buy a second
// membership.
//
// "Is a member" means: a Stripe customer with this email carries a The Edit Club
// member number (member_id metadata) OR has an active/trialing/past_due
// linen_lovers subscription (covers the brief window after payment but before
// the completion handler stamps the member id).

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    // No Stripe configured (demo mode): never block joining.
    return NextResponse.json({ isMember: false })
  }

  let email = ""
  try {
    const body = await req.json()
    email = String(body.email ?? "").trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
  }

  try {
    // Test-clock-aware lookup across both normal and clock customers.
    const { withMemberId, anyMatch } = await findCustomerByEmail(stripe, email)

    // Strongest signal: a customer already carrying a Edit Club number.
    if (withMemberId) {
      return NextResponse.json(memberResponse(withMemberId, email))
    }

    // Fallback: email matches a customer who has an active membership
    // subscription but whose member id hasn't been stamped yet (just paid).
    if (anyMatch && (await hasActiveMembershipSubscription(stripe, anyMatch.id))) {
      return NextResponse.json(memberResponse(anyMatch, email))
    }

    return NextResponse.json({ isMember: false })
  } catch (error) {
    console.log("[v0] membership check-email error:", error)
    // On error, don't hard-block the join — let them proceed rather than trap them.
    return NextResponse.json({ isMember: false })
  }
}

function memberResponse(customer: Stripe.Customer, fallbackEmail: string) {
  return {
    isMember: true as const,
    customerId: customer.id,
    memberId: customer.metadata?.[MEMBER_ID_METADATA_KEY] ?? null,
    name: customer.name ?? null,
    email: customer.email ?? fallbackEmail,
  }
}
