import { type NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import {
  advanceClockByYears,
  clockDashboardUrl,
  customerClockId,
  customerDashboardUrl,
} from "@/lib/test-clock"

// Advancing a clock simulates real billing events and may take a little while.
export const maxDuration = 60

// Default horizon for the simulation. The Edit Club membership renews every
// 2 years, so 2 years lands exactly on the first renewal.
const DEFAULT_YEARS = 2

// GET /api/membership/simulate?customerId=cus_xxx
// Reports whether a customer is on a test clock and its current simulated time.
export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get("customerId")
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  try {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    const clockId = customerClockId(customer)
    if (!clockId) {
      return NextResponse.json({ simulatable: false })
    }

    const clock = await stripe.testHelpers.testClocks.retrieve(clockId)
    return NextResponse.json({
      simulatable: true,
      clockId,
      status: clock.status,
      frozenTime: clock.frozen_time,
      clockUrl: clockDashboardUrl(clockId),
      customerUrl: customerDashboardUrl(customerId),
    })
  } catch (error) {
    console.log("[v0] simulate GET error:", error)
    return NextResponse.json({ error: "Unable to read simulation state" }, { status: 500 })
  }
}

// POST /api/membership/simulate  { customerId, years? }
// Fast-forwards the customer's test clock so their subscription's future
// (renewals/invoices) can be inspected in the Stripe Dashboard.
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 })
  }

  let body: { customerId?: string; years?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const customerId = body.customerId
  const years = typeof body.years === "number" && body.years > 0 ? body.years : DEFAULT_YEARS
  if (!customerId) {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 })
  }

  try {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    const clockId = customerClockId(customer)
    if (!clockId) {
      return NextResponse.json(
        { error: "This member isn't on a test clock and can't be simulated." },
        { status: 400 },
      )
    }

    const clock = await advanceClockByYears(stripe, clockId, years)

    return NextResponse.json({
      ok: true,
      years,
      clockId,
      status: clock.status,
      frozenTime: clock.frozen_time,
      clockUrl: clockDashboardUrl(clockId),
      customerUrl: customerDashboardUrl(customerId),
    })
  } catch (error) {
    console.log("[v0] simulate POST error:", error)
    const message = error instanceof Error ? error.message : "Unable to run simulation"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
