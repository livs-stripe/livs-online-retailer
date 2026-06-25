import type Stripe from "stripe"
import { MEMBER_ID_METADATA_KEY } from "./membership"

// Server-only helpers for finding Edit Club member customers in Stripe.
//
// THE TEST-CLOCK PROBLEM
// ----------------------
// Every demo member's customer is created on a Stripe Test Clock (for the 2-year
// renewal simulation). Stripe EXCLUDES test-clock customers from:
//   - the default `customers.list()` (returns only non-clock customers), and
//   - the `customers.search()` API, and
//   - `customers.list({ email })` (email-filtered list).
// The ONLY ways to reach a test-clock customer are a direct `customers.retrieve`
// by id, or `customers.list({ test_clock })` scoped to its clock. That's why
// looking a member up by email or member number silently found nothing.
//
// PERFORMANCE
// -----------
// Each membership join creates its own test clock, so an account accumulates
// many clocks over time. Scanning them ONE AT A TIME (a sequential paginated
// request per clock) is slow enough to hang the join/login UI. We therefore scan
// clocks CONCURRENTLY in small batches and short-circuit as soon as we match.

// Safety caps so a large account can't make a lookup run unbounded.
const MAX_CLOCKS = 500
// How many test clocks to query in parallel at once.
const CLOCK_CONCURRENCY = 10

function emailOf(c: Stripe.Customer): string {
  return (c.email ?? "").trim().toLowerCase()
}

// Collects every test clock id on the account (bounded by MAX_CLOCKS).
async function listTestClockIds(stripe: Stripe): Promise<string[]> {
  const ids: string[] = []
  for await (const clock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    ids.push(clock.id)
    if (ids.length >= MAX_CLOCKS) break
  }
  return ids
}

// Scans all test-clock customers in concurrent batches, returning the first
// customer matching `predicate` (or null). Short-circuits across batches so a
// match on an early clock avoids querying the rest.
async function findInTestClocks(
  stripe: Stripe,
  predicate: (c: Stripe.Customer) => boolean,
): Promise<Stripe.Customer | null> {
  const clockIds = await listTestClockIds(stripe)

  for (let i = 0; i < clockIds.length; i += CLOCK_CONCURRENCY) {
    const batch = clockIds.slice(i, i + CLOCK_CONCURRENCY)
    const results = await Promise.all(
      batch.map((id) => stripe.customers.list({ test_clock: id, limit: 100 })),
    )
    for (const page of results) {
      for (const c of page.data) {
        if (!c.deleted && predicate(c)) return c
      }
    }
  }
  return null
}

// Finds the member customer for an email, including test-clock customers. Prefers
// a customer that already carries a Edit Club number; otherwise returns any
// customer with that email (so the caller can fall back to a subscription check).
export async function findCustomerByEmail(
  stripe: Stripe,
  email: string,
): Promise<{ withMemberId: Stripe.Customer | null; anyMatch: Stripe.Customer | null }> {
  const target = email.trim().toLowerCase()

  // 1) Cheap path: the email-filtered list covers all NON-clock customers in a
  //    single request.
  const nonClock = await stripe.customers.list({ email: target, limit: 100 })
  let anyMatch: Stripe.Customer | null = null
  for (const c of nonClock.data) {
    if (c.deleted) continue
    if (c.metadata?.[MEMBER_ID_METADATA_KEY]) return { withMemberId: c, anyMatch: c }
    if (!anyMatch) anyMatch = c
  }

  // 2) Members live on test clocks (excluded above), so scan those concurrently.
  const clockMatch = await findInTestClocks(
    stripe,
    (c) => emailOf(c) === target && Boolean(c.metadata?.[MEMBER_ID_METADATA_KEY]),
  )
  if (clockMatch) return { withMemberId: clockMatch, anyMatch: clockMatch }

  // 3) No member-id match anywhere — fall back to any clock customer with the
  //    email (so the caller can still check for an active subscription).
  if (!anyMatch) {
    anyMatch = await findInTestClocks(stripe, (c) => emailOf(c) === target)
  }

  return { withMemberId: null, anyMatch }
}

// Finds the customer carrying the given canonical member id (e.g. "LL-123"),
// including test-clock customers.
export async function findCustomerByMemberId(
  stripe: Stripe,
  canonicalId: string,
): Promise<Stripe.Customer | null> {
  // Non-clock customers first (Search API is fast and indexed when available).
  try {
    const result = await stripe.customers.search({
      query: `metadata['${MEMBER_ID_METADATA_KEY}']:'${canonicalId}'`,
      limit: 1,
    })
    if (result.data.length > 0) return result.data[0]
  } catch {
    // Search API unavailable — non-clock match will be covered by clock scan below
    // is not guaranteed, so also do a quick non-clock list fallback.
    for await (const c of stripe.customers.list({ limit: 100 })) {
      if (c.metadata?.[MEMBER_ID_METADATA_KEY] === canonicalId) return c
    }
  }

  // Members live on test clocks — scan those concurrently.
  return findInTestClocks(stripe, (c) => c.metadata?.[MEMBER_ID_METADATA_KEY] === canonicalId)
}

// Whether a customer has a currently-effective The Edit Club subscription. Used as
// a fallback when the member id hasn't been stamped yet (just after payment).
export async function hasActiveMembershipSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 })
  return subs.data.some(
    (s) =>
      s.metadata?.membership === "linen_lovers" &&
      (s.status === "active" || s.status === "trialing" || s.status === "past_due"),
  )
}
