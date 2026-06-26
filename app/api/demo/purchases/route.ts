import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { DEMO_USER } from "@/lib/demo-user"
import { fetchRecentPurchasesForStylist } from "@/lib/stripe-purchases"

export async function GET() {
  const customerId = DEMO_USER.stripeCustomerId

  try {
    const stripe = getStripe()
    if (!stripe) return NextResponse.json({ purchases: [] })
    const purchases = await fetchRecentPurchasesForStylist(stripe, customerId, 5)
    return NextResponse.json({ purchases })
  } catch (error) {
    console.error("Failed to fetch demo purchases:", error)
    return NextResponse.json({ purchases: [] })
  }
}
