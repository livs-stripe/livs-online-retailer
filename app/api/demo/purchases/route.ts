import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { fetchRecentPurchasesForStylist } from "@/lib/stripe-purchases"

export async function GET() {
  const customerId = process.env.DEMO_CUSTOMER_ID
  if (!customerId) {
    return NextResponse.json({ purchases: [] })
  }

  try {
    const stripe = getStripe()
    const purchases = await fetchRecentPurchasesForStylist(stripe, customerId, 3)
    return NextResponse.json({ purchases })
  } catch (error) {
    console.error("Failed to fetch demo purchases:", error)
    return NextResponse.json({ purchases: [] })
  }
}
