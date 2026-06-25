import { type NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { getProductById } from "@/lib/products"
import {
  MEMBER_DESCRIPTION,
  MEMBER_ID_METADATA_KEY,
  MEMBER_ID_START,
  ITEMS_METADATA_KEY,
  CATEGORIES_METADATA_KEY,
  formatMemberId,
  parseMemberId,
} from "@/lib/membership"

// Marks (on the customer) that a checkout session's goods have already been
// billed, so reloading the welcome page never double-charges.
const GOODS_INVOICED_METADATA_KEY = "goods_invoiced_session"

// Determines the next sequential Edit Club member id (e.g. "LL-125") by
// scanning EVERY existing customer's member_id metadata and incrementing the
// highest found.
//
// This must page through ALL customers: `customers.list({ limit: 100 })` only
// returns the most recent 100, so once the account has more than 100 customers
// the members that actually carry member_id metadata fall outside that window.
// The scan then never sees them, `highest` stays at the start value, and every
// new member is assigned the SAME number — the bug this fixes. autoPagingEach
// walks the full list so the real maximum is always found.
//
// We also collect every used sequence into a Set and return it alongside the
// candidate so the caller can guarantee the assigned id is genuinely unique
// (guarding against a concurrent join that grabbed the same number).
async function nextMemberId(stripe: Stripe): Promise<{ memberId: string; used: Set<number> }> {
  let highest = MEMBER_ID_START - 1
  const used = new Set<number>()
  for await (const c of stripe.customers.list({ limit: 100 })) {
    const seq = parseMemberId(c.metadata?.[MEMBER_ID_METADATA_KEY])
    if (seq !== null) {
      used.add(seq)
      if (seq > highest) highest = seq
    }
  }
  // Walk forward from the highest+1 until we hit a sequence nobody holds. With a
  // clean sequential history this is simply highest+1; the loop only matters if
  // there are gaps or a race left a number taken.
  let next = highest + 1
  while (used.has(next)) next += 1
  return { memberId: formatMemberId(next), used }
}

// Returns true if any customer already carries this exact member id. Uses the
// Search API when available, falling back to a paginated scan.
async function memberIdTaken(stripe: Stripe, memberId: string): Promise<boolean> {
  try {
    const result = await stripe.customers.search({
      query: `metadata['${MEMBER_ID_METADATA_KEY}']:'${memberId}'`,
      limit: 1,
    })
    return result.data.length > 0
  } catch {
    for await (const c of stripe.customers.list({ limit: 100 })) {
      if (c.metadata?.[MEMBER_ID_METADATA_KEY] === memberId) return true
    }
    return false
  }
}

// Ensures a freshly-joined customer carries the same record shape as the
// existing demo members: a sequential member_id, the standard description, plus
// name/email backfilled from the checkout details when Stripe didn't set them.
// Idempotent — a customer that already has a member_id is left untouched.
async function ensureMemberRecord(
  stripe: Stripe,
  customer: Stripe.Customer,
  session: Stripe.Checkout.Session,
): Promise<string> {
  // The name the shopper actually typed. Prefer the shipping "Full name", then
  // the session's individual name, then the customer details name. We avoid
  // relying solely on the latter because for card payments it can resolve to the
  // billing/cardholder field (e.g. the literal "Card Holder Name" placeholder).
  const enteredName =
    session.collected_information?.shipping_details?.name ??
    session.collected_information?.individual_name ??
    session.customer_details?.name ??
    null

  const existing = customer.metadata?.[MEMBER_ID_METADATA_KEY]

  let memberId = existing ?? ""
  const params: Stripe.CustomerUpdateParams = {}

  // Only stamp the member id/description once. Compute a guaranteed-unique
  // sequential number and re-verify it's still free immediately before writing,
  // so two members joining at the same time can't be handed the same id.
  if (!existing) {
    const result = await nextMemberId(stripe)
    memberId = result.memberId
    if (await memberIdTaken(stripe, memberId)) {
      // Extremely rare race: someone claimed our candidate between the scan and
      // now. Recompute from a fresh scan to land on the new highest+1.
      memberId = (await nextMemberId(stripe)).memberId
    }
    params.metadata = { ...customer.metadata, [MEMBER_ID_METADATA_KEY]: memberId }
    params.description = customer.description ?? MEMBER_DESCRIPTION
  }

  // Correct the customer name from the entered details. This also repairs records
  // that were previously saved with the wrong (cardholder) name.
  if (enteredName && enteredName !== customer.name) params.name = enteredName
  if (!customer.email && session.customer_details?.email)
    params.email = session.customer_details.email

  if (Object.keys(params).length > 0) {
    await stripe.customers.update(customer.id, params)
  }
  return memberId
}

// Bills the cart's products on a SEPARATE one-time invoice after a membership
// join completes, so the subscription's first invoice stays membership-only.
// The products, shipping and welcome reward are read from the session metadata
// stashed by /api/membership/join-checkout; prices are re-resolved server-side.
// Idempotent: guarded by a per-session flag plus Stripe idempotency keys.
async function chargeGoodsInvoice(
  stripe: Stripe,
  customer: Stripe.Customer,
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription | null,
): Promise<void> {
  const raw = session.metadata?.products_json
  if (!raw) return

  let items: { productId: string; quantity: number }[] = []
  try {
    items = JSON.parse(raw)
  } catch {
    return
  }
  if (!Array.isArray(items) || items.length === 0) return

  // Already billed for this checkout? Don't charge again on page reloads.
  if (customer.metadata?.[GOODS_INVOICED_METADATA_KEY] === session.id) return

  // The goods invoice is bound to the customer's currency. Because the customer
  // just paid for the membership subscription, their currency is already locked
  // (e.g. AUD on an AU account). Invoice items + coupon MUST match it, otherwise
  // Stripe rejects them ("cannot combine currencies") and the products are never
  // billed — which is why join-flow purchases previously failed to appear. Fall
  // back to the membership subscription's currency, which is always the same.
  const currency =
    customer.currency ?? subscription?.items.data[0]?.price?.currency ?? "usd"

  // Reuse the payment method saved during the subscription checkout to charge
  // the standalone goods invoice off-session.
  const pmId = (v: string | Stripe.PaymentMethod | null | undefined): string | undefined =>
    !v ? undefined : typeof v === "string" ? v : v.id
  const paymentMethod =
    pmId(subscription?.default_payment_method) ??
    pmId(customer.invoice_settings?.default_payment_method)

  // Create the standalone goods invoice FIRST (empty draft) so we can bind each
  // line item DIRECTLY to it below. `pending_invoice_items_behavior: "exclude"`
  // means it won't sweep in unrelated pending items, and — critically — binding
  // items to this invoice keeps them off the membership SUBSCRIPTION's invoices.
  //
  // The previous approach created "pending" invoice items (no invoice binding)
  // and hoped a follow-up invoice would sweep them up. When that sweep/pay was
  // unreliable, the orphaned pending items were instead attached to the next
  // subscription renewal invoice (2 years later) — which is exactly why the cart
  // products showed up in billing history on the renewal instead of as an
  // immediate order in "Recent purchases".
  const invoice = await stripe.invoices.create(
    {
      customer: customer.id,
      collection_method: "charge_automatically",
      auto_advance: false,
      default_payment_method: paymentMethod,
      pending_invoice_items_behavior: "exclude",
      // Shown on the invoice so it's clear these are the other cart items bought
      // alongside the membership — kept off the $19.95 membership invoice.
      description:
        "Aster & Hem order — items purchased with your Edit Club sign-up (billed separately from the $19.95 membership).",
      metadata: {
        source: "adairs_demo",
        kind: "linen_lovers_goods",
        checkout_session: session.id,
      },
    },
    { idempotencyKey: `goods-inv-${session.id}` },
  )

  // Bind one line per product DIRECTLY to the goods invoice — re-priced from the
  // catalog. Passing `invoice: invoice.id` guarantees these never leak onto the
  // subscription's invoices.
  if (invoice.id) {
    for (const it of items) {
      const product = getProductById(it.productId)
      if (!product) continue
      const qty = Math.max(1, Math.floor(it.quantity || 1))
      await stripe.invoiceItems.create(
        {
          customer: customer.id,
          invoice: invoice.id,
          amount: Math.round(product.price * 100) * qty,
          currency,
          description: qty > 1 ? `${product.name} \u00d7 ${qty}` : product.name,
        },
        { idempotencyKey: `goods-ii-${session.id}-${it.productId}` },
      )
    }

    // Shipping, if any was charged — also bound to this invoice.
    const shippingAmount = Math.round(Number(session.metadata?.shipping_amount ?? "0") * 100)
    if (shippingAmount > 0) {
      await stripe.invoiceItems.create(
        {
          customer: customer.id,
          invoice: invoice.id,
          amount: shippingAmount,
          currency,
          description: (session.metadata?.shipping_label || "Standard Delivery").slice(0, 250),
        },
        { idempotencyKey: `goods-ship-${session.id}` },
      )
    }
  }

  // NB: the $20 welcome reward is NOT applied to this invoice. It arrives within
  // 48 hours of joining (delivered separately), so the goods invoice carries no
  // reward discount.

  let paidInvoiceId: string | null = null
  if (invoice.id) {
    try {
      await stripe.invoices.finalizeInvoice(invoice.id)
      const paid = await stripe.invoices.pay(invoice.id, { off_session: true })
      paidInvoiceId = paid.id ?? invoice.id
    } catch (err) {
      console.log("[v0] goods invoice finalize/pay error:", err)
    }
  }

  // Record the product names + categories on the goods charge's PaymentIntent.
  // The "Recent purchases" reader (mapCharge) pulls item/category chips from
  // PaymentIntent metadata, and the auto-created PaymentIntent that pays this
  // invoice has none — which is why join-flow cart items previously showed as a
  // bare "Aster & Hem order" with no products. Stamping it makes the items appear.
  if (paidInvoiceId) {
    try {
      const itemsLabel = items
        .map((it) => {
          const product = getProductById(it.productId)
          if (!product) return null
          const qty = Math.max(1, Math.floor(it.quantity || 1))
          return qty > 1 ? `${product.name} \u00d7 ${qty}` : product.name
        })
        .filter((s): s is string => Boolean(s))
        .join(" | ")
      const categoriesLabel = Array.from(
        new Set(
          items
            .map((it) => getProductById(it.productId)?.category)
            .filter((c): c is string => Boolean(c)),
        ),
      ).join(", ")

      // Find the PaymentIntent(s) that paid this invoice and stamp the metadata.
      const withPayments = await stripe.invoices.retrieve(paidInvoiceId, {
        expand: ["payments.data.payment.payment_intent"],
      })
      for (const p of withPayments.payments?.data ?? []) {
        const pi = p.payment?.payment_intent
        const piId = typeof pi === "string" ? pi : pi?.id
        if (!piId) continue
        await stripe.paymentIntents.update(piId, {
          metadata: {
            [ITEMS_METADATA_KEY]: itemsLabel.slice(0, 500),
            [CATEGORIES_METADATA_KEY]: categoriesLabel.slice(0, 500),
          },
        })
      }
    } catch (err) {
      console.log("[v0] goods PaymentIntent metadata error:", err)
    }
  }

  // Record that this session's goods are billed (metadata merges by key, so the
  // member id set elsewhere is preserved).
  await stripe.customers.update(customer.id, {
    metadata: { [GOODS_INVOICED_METADATA_KEY]: session.id },
  })
}

// Retrieve a completed Checkout Session so the welcome page can confirm the
// membership and capture the customer + subscription IDs for the demo.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id")
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ demoMode: true }, { status: 200 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    })

    const customer =
      session.customer && typeof session.customer !== "string" && !session.customer.deleted
        ? session.customer
        : null
    const subscription =
      session.subscription && typeof session.subscription !== "string" ? session.subscription : null

    // Make the newly-joined Edit Club member a proper Stripe customer with membership
    // metadata matching the existing demo members. Only runs once the checkout
    // is actually complete/paid.
    let memberId = customer?.metadata?.[MEMBER_ID_METADATA_KEY] ?? null
    if (customer && (session.status === "complete" || session.payment_status === "paid")) {
      try {
        memberId = await ensureMemberRecord(stripe, customer, session)
      } catch (err) {
        console.log("[v0] ensureMemberRecord error:", err)
      }
      // Bill any cart products on a separate invoice so the subscription's first
      // invoice only contains the membership.
      try {
        await chargeGoodsInvoice(stripe, customer, session, subscription)
      } catch (err) {
        console.log("[v0] chargeGoodsInvoice error:", err)
      }
    }

    return NextResponse.json({
      status: session.status,
      paymentStatus: session.payment_status,
      customerId: typeof session.customer === "string" ? session.customer : (customer?.id ?? null),
      subscriptionId:
        typeof session.subscription === "string" ? session.subscription : (subscription?.id ?? null),
      email: session.customer_details?.email ?? customer?.email ?? null,
      // Prefer the entered shipping/individual name over the card's billing name
      // so the welcome greeting matches what the shopper typed.
      name:
        session.collected_information?.shipping_details?.name ??
        session.collected_information?.individual_name ??
        customer?.name ??
        session.customer_details?.name ??
        null,
      memberId,
    })
  } catch (error) {
    console.log("[v0] checkout-session retrieve error:", error)
    return NextResponse.json({ error: "Unable to retrieve session" }, { status: 500 })
  }
}
