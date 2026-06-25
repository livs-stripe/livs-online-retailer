import type Stripe from "stripe"
import { LINEN_LOVERS_PRODUCT_ID, LINEN_LOVERS_PRICE_ID } from "@/lib/membership"

// Server-only resolver for the Linen Lovers 2-year membership price.
//
// The membership product was originally hardcoded to a single Stripe account's
// product id. When the connected account changes (e.g. switching from a US to an
// AU Stripe account), that product id no longer exists and every call that
// listed prices for it threw "No such product", surfacing as a 500 at checkout.
//
// This resolver is account-agnostic and self-healing:
//   1. Use STRIPE_MEMBERSHIP_PRICE_ID if provided.
//   2. Try the known product id (works on the original account).
//   3. Search the account for a product named like the membership.
//   4. Create the product + a recurring $19.95 / 2-year price if none exists.
// So it works on whatever Stripe account is currently connected.

const MEMBERSHIP_NAME = "Linen Lovers Membership"
const MEMBERSHIP_AMOUNT = 1995 // $19.95 in cents
const MEMBERSHIP_CURRENCY = "usd" // USD required for the ACS Preview demo
const MEMBERSHIP_INTERVAL: Stripe.PriceCreateParams.Recurring.Interval = "year"
const MEMBERSHIP_INTERVAL_COUNT = 2

async function firstRecurringPriceForProduct(stripe: Stripe, productId: string): Promise<Stripe.Price | null> {
  try {
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      type: "recurring",
      limit: 10,
    })
    return prices.data[0] ?? null
  } catch {
    // Product doesn't exist on this account (e.g. after switching accounts).
    return null
  }
}

async function findMembershipProductByName(stripe: Stripe): Promise<string | null> {
  // Search API (when available) is the cheapest exact-name lookup.
  try {
    const res = await stripe.products.search({
      query: `active:'true' AND name:'${MEMBERSHIP_NAME}'`,
      limit: 1,
    })
    if (res.data[0]) return res.data[0].id
  } catch {
    // Search may be unavailable; fall back to listing.
  }
  try {
    const list = await stripe.products.list({ active: true, limit: 100 })
    const match = list.data.find((p) => p.name === MEMBERSHIP_NAME)
    return match?.id ?? null
  } catch {
    return null
  }
}

async function createMembershipPrice(stripe: Stripe): Promise<Stripe.Price> {
  const product = await stripe.products.create({
    name: MEMBERSHIP_NAME,
    description: "Linen Lovers 2-year membership",
  })
  return stripe.prices.create({
    product: product.id,
    currency: MEMBERSHIP_CURRENCY,
    unit_amount: MEMBERSHIP_AMOUNT,
    recurring: { interval: MEMBERSHIP_INTERVAL, interval_count: MEMBERSHIP_INTERVAL_COUNT },
    nickname: "Linen Lovers 2-year membership",
  })
}

export async function resolveMembershipPrice(stripe: Stripe): Promise<Stripe.Price | null> {
  // 1. Explicit price id: env override first, then the known account price.
  for (const priceId of [process.env.STRIPE_MEMBERSHIP_PRICE_ID, LINEN_LOVERS_PRICE_ID].filter(
    Boolean,
  ) as string[]) {
    try {
      const price = await stripe.prices.retrieve(priceId)
      if (price.active) return price
    } catch {
      // Falls through to product/discovery below.
    }
  }

  // 2. The known product id (works on the account it was created in).
  const envProductId = process.env.STRIPE_MEMBERSHIP_PRODUCT_ID
  for (const productId of [envProductId, LINEN_LOVERS_PRODUCT_ID].filter(Boolean) as string[]) {
    const price = await firstRecurringPriceForProduct(stripe, productId)
    if (price) return price
  }

  // 3. Search this account for the membership product by name.
  const foundProductId = await findMembershipProductByName(stripe)
  if (foundProductId) {
    const price = await firstRecurringPriceForProduct(stripe, foundProductId)
    if (price) return price
  }

  // 4. Nothing exists on this account yet — create it so checkout can proceed.
  try {
    return await createMembershipPrice(stripe)
  } catch {
    return null
  }
}
