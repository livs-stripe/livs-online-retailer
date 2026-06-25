import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { fetchPurchasesPage } from "@/lib/stripe-purchases"

// Cursor-paginated purchase history (groups of 10, past two years). Pass the
// previous response's `nextCursor` as `startingAfter` to load the next group.
export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId")
  const startingAfter = req.nextUrl.searchParams.get("startingAfter") ?? undefined
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  try {
    const page = await fetchPurchasesPage(stripe, customerId, startingAfter)
    return NextResponse.json(page)
  } catch (error) {
    console.log("[v0] membership purchases route error:", error)
    return NextResponse.json({ error: "Unable to load purchases" }, { status: 500 })
  }
}
