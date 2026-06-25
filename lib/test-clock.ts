import type Stripe from "stripe"

// Stripe Test Clock helpers for the The Edit Club demo.
//
// Test clocks let us simulate the passage of time for a real subscription so we
// can show, e.g., "what the account looks like after 2 years" (the first
// renewal of the 2-year membership) without manually clicking through the Stripe
// Dashboard. A customer can only be attached to a clock at creation time, so the
// join flow creates the customer on a fresh clock up front.

const DAY = 24 * 60 * 60
// Advance in <=180 day hops, polling between each, to stay well within Stripe's
// per-advancement limits and to let each simulated billing event settle.
const ADVANCE_STEP_SECONDS = 180 * DAY
// How long we'll wait for a single advancement to finish processing.
const ADVANCE_TIMEOUT_MS = 90_000

export const SIMULATION_METADATA_KEY = "simulation"
export const SIMULATION_METADATA_VALUE = "test_clock"

export function clockDashboardUrl(clockId: string): string {
  return `https://dashboard.stripe.com/test/test-clocks/${clockId}`
}

export function customerDashboardUrl(customerId: string): string {
  return `https://dashboard.stripe.com/test/customers/${customerId}`
}

// Creates a test clock frozen at "now" so a customer/subscription created on it
// behaves like the present until we advance it.
export async function createNowTestClock(stripe: Stripe, name: string): Promise<Stripe.TestHelpers.TestClock> {
  return stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name,
  })
}

// Resolves the test clock id attached to a customer (or null if the customer
// isn't on a clock and therefore can't be simulated).
export function customerClockId(customer: Stripe.Customer): string | null {
  const tc = customer.test_clock
  if (!tc) return null
  return typeof tc === "string" ? tc : tc.id
}

// Polls a test clock until it finishes advancing (status "ready"), throwing on
// failure or timeout.
async function waitForReady(
  stripe: Stripe,
  clockId: string,
  initial?: Stripe.TestHelpers.TestClock,
): Promise<Stripe.TestHelpers.TestClock> {
  let clock = initial ?? (await stripe.testHelpers.testClocks.retrieve(clockId))
  const deadline = Date.now() + ADVANCE_TIMEOUT_MS
  while (clock.status === "advancing") {
    if (Date.now() > deadline) throw new Error("Test clock advancement timed out")
    await new Promise((r) => setTimeout(r, 1500))
    clock = await stripe.testHelpers.testClocks.retrieve(clockId)
  }
  if (clock.status === "internal_failure") {
    throw new Error("Test clock advancement failed inside Stripe")
  }
  return clock
}

// Advances a test clock forward to `targetTime` (unix seconds) in safe steps,
// simulating any billing events (renewals, invoices) along the way.
export async function advanceClockTo(
  stripe: Stripe,
  clockId: string,
  targetTime: number,
): Promise<Stripe.TestHelpers.TestClock> {
  // Make sure we're not mid-advance from a previous call.
  let clock = await waitForReady(stripe, clockId)
  while ((clock.frozen_time ?? 0) < targetTime) {
    const next = Math.min((clock.frozen_time ?? 0) + ADVANCE_STEP_SECONDS, targetTime)
    await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: next })
    clock = await waitForReady(stripe, clockId)
  }
  return clock
}

// Advances a clock by a number of years from its current frozen time.
//
// We use 365.25 days/year (leap-year aware) plus a few days of buffer so the
// clock reliably crosses the subscription's calendar renewal boundary (e.g. the
// 2-year membership renewal lands at ~731 days, not exactly 730) and the renewal
// invoice is actually generated.
export async function advanceClockByYears(
  stripe: Stripe,
  clockId: string,
  years: number,
): Promise<Stripe.TestHelpers.TestClock> {
  const clock = await stripe.testHelpers.testClocks.retrieve(clockId)
  const from = clock.frozen_time ?? Math.floor(Date.now() / 1000)
  const target = from + Math.round(years * 365.25 * DAY) + 3 * DAY
  return advanceClockTo(stripe, clockId, target)
}
