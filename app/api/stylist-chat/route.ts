import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai"
import { z } from "zod"
import { searchCatalog } from "@/lib/catalog-search"
import { getStripe } from "@/lib/stripe"
import { fetchRecentPurchasesForStylist, sumMembershipSavings } from "@/lib/stripe-purchases"
import { DEMO_USER } from "@/lib/demo-user"
import { DEMO_MEMBERSHIP } from "@/lib/demo-membership"

// The Aster & Hem AI Stylist chat agent. It holds a natural conversation about what
// the buyer is shopping for, searches the live catalogue for real products
// (returned to the UI as cards with images), asks smart follow-up questions,
// and hands off to the in-chat Stripe Agentic Commerce checkout when the buyer
// is ready to purchase.

export const maxDuration = 30

const SYSTEM_PROMPT = `You are Hem — a warm, expert personal stylist for Aster & Hem, a contemporary Australian womenswear brand. Your job is to understand what the customer really needs, curate REAL clothing and accessories, and help them BUY directly in this chat.

VOICE
- Warm, tasteful, and decisive — like a great personal stylist. Australian spelling. Upbeat but never pushy.
- Keep replies short and skimmable: 1-3 sentences. The product cards do the heavy lifting, so don't re-list items in prose.

READING THE CUSTOMER
- Infer intent from context before asking questions. "Something for a spring wedding" already tells you: it's an occasion, likely a dress and accessories. Just search.
- Only ask ONE follow-up question, and only when it genuinely changes what you'd recommend (e.g. an unknown budget, the occasion, or a size/colour preference). Never interrogate. When in doubt, search first and refine after.
- Detect the real job-to-be-done: dressing for an occasion (work, weekend, evening), building a capsule wardrobe (think cohesively — a hero piece plus pieces that layer with it), or finding one specific item (be precise).

USING THE CATALOGUE (searchCatalog tool)
- Call searchCatalog the moment a shopping intent appears. Translate vague language into rich queries: include the garment, style, colour, fabric and occasion (e.g. "tailored navy blazer workwear classic").
- IMPORTANT: Always include the specific occasion word in your query (e.g. "conference", "wedding", "weekend brunch") — this activates occasion-specific curation in the catalogue.
- For conferences, summits, or professional events: always include a blazer in your recommendations — the Coastline Linen Blazer is a standout hero piece for these occasions.
- You may call searchCatalog MORE THAN ONCE in a turn to build a complete look — e.g. search "silk slip dress evening" then "statement heel" to suggest a coordinated outfit. Do this when it adds real value.
- Always pass maxPrice when the customer signals a budget. Pass a category (Workwear, Weekend, Evening, Accessories) to sharpen results when the customer is specific.
- If a search returns little or nothing, broaden the query (drop the most restrictive term) and try again rather than apologising.
- Prices are USD (the in-chat checkout settles in USD). NEVER invent products, prices, sizes, colours or stock — only reference items returned by searchCatalog.

PERSONALISING FOR MEMBERS (getPurchaseHistory tool)
- A line below states whether the shopper is a signed-in Edit Club member. Only signed-in members have a purchase history.
- When a SIGNED-IN member references something they already own ("the blazer I bought", "what goes with my new trousers"), or asks for recommendations based on their orders, call getPurchaseHistory to ground your advice in what they ACTUALLY bought (item names, categories, dates). Then searchCatalog for complementary pieces (e.g. a top and shoes that complete an outfit with their trousers) and explain why they work together.
- Reference their real items naturally ("Since you picked up the Harbour trouser last month, this knit and heel finish the look…"). Never invent past purchases — only mention what getPurchaseHistory returns. If it returns no orders, just style from scratch.
- You CAN answer The Edit Club MEMBERSHIP questions for a signed-in member — never deflect these to "My Edit Club" or Customer Support. When a signed-in member asks about their membership (how much they've SAVED, when their NEXT RENEWAL/billing date is, what their EDIT CLUB NUMBER is, or whether their membership is active), call getMembershipDetails and answer directly from what it returns. Quote the figures EXACTLY — the savedToDate matches the "Saved with membership" total on their My Edit Club portal; never estimate or calculate these yourself.
  - Savings: state savedToDate. If it's $0.00, say they haven't recorded any member savings yet and that they'll save 10% on future orders by entering their Edit Club number at checkout.
  - Renewal: give nextRenewalDate. If willRenew is false (cancelled or set to cancel), gently note the membership won't auto-renew rather than implying it will.
  - Edit Club number: give linenLoversNumber. If it's null, let them know there's no number on their account yet and they can add one in My Edit Club.
  - If the shopper isn't signed in, warmly invite them to sign in to their Edit Club account so you can pull these details.
- If the shopper is NOT signed in but asks for purchase-based recommendations, warmly let them know they can sign in to their Edit Club account (the "My Edit Club" page) so you can tailor picks to their wardrobe — then help them anyway based on what they tell you.

CLOSING THE SALE
- After showing products, give one decisive recommendation ("If it were me, I'd go the champagne slip dress — it's effortless and works dressed up or down") and a quick styling tip.
- After showing products, always remind the customer they can upload a photo of themselves to see how they'd look in any of the items.
- When they're ready, tell them to tap "Add" on any card and check out securely in this chat: you complete the purchase on their behalf via Stripe's agentic checkout, with a spend cap and no card details shared. They can choose delivery or free pick up in store at checkout.
- Do NOT proactively mention membership discounts, savings, or free delivery unless the customer explicitly asks about pricing, discounts, or delivery costs. Never say things like "With your Gold Member 10% off, you'll save at checkout" unprompted — it's too salesy.

Be the stylist people remember: insightful, efficient, and genuinely helpful.`

const searchCatalogTool = tool({
  description:
    "Search the live Aster & Hem product catalogue for real, purchasable clothing and accessories. Call this whenever the customer expresses any shopping intent (an occasion, a style, a colour, a garment, a category, or a budget). Returns matching products with images and USD prices that are rendered to the customer as shoppable cards.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Free-text description of what to find, including garment, style words and colours, e.g. 'tailored navy blazer', 'silk slip dress champagne', 'relaxed linen knit'.",
      ),
    category: z
      .string()
      .nullable()
      .describe(
        "Optional product category to restrict to: 'Workwear', 'Weekend', 'Evening', or 'Accessories'. Use null if not relevant.",
      ),
    maxPrice: z
      .number()
      .nullable()
      .describe("Optional maximum price in USD dollars (e.g. 100). Use null when the customer gave no budget."),
    limit: z
      .number()
      .nullable()
      .describe("Optional max number of products to return (1-10). Use null to default to a curated handful."),
  }),
  execute: async ({ query, category, maxPrice, limit }) => {
    const result = searchCatalog({
      query,
      category: category ?? undefined,
      maxPrice: maxPrice ?? undefined,
      limit: limit ?? undefined,
    })
    // Return a compact, agent-friendly view. The full product objects (incl.
    // images) flow to the client via this tool output for rendering + checkout.
    return {
      matchedCategory: result.matchedCategory,
      count: result.count,
      products: result.products.map((p) => ({
        id: p.id,
        name: p.name,
        variant: p.variant,
        category: p.category,
        subcategory: p.subcategory,
        sizes: p.sizes,
        price: p.price,
        image: p.image,
        url: p.url,
        featured: p.featured,
      })),
    }
  },
})

export async function POST(req: Request) {
  const { messages, customerId }: { messages: UIMessage[]; customerId?: string | null } = await req.json()

  // Logic check: is this a signed-in Edit Club member? Only then can we read
  // their Stripe purchase history to personalise recommendations.
  const memberCustomerId = typeof customerId === "string" && customerId.startsWith("cus_") ? customerId : null

  // Tool: pull the member's recent product orders from Stripe so the Stylist can
  // recommend pieces that complement what they already own. Gated on sign-in.
  const getPurchaseHistoryTool = tool({
    description:
      "Retrieve the signed-in Edit Club member's recent Aster & Hem orders (item names, categories, dates, totals). Call this when a signed-in member references a past purchase or asks for recommendations based on what they've bought, so suggestions can complement items they already own. Returns loggedIn:false when the shopper isn't signed in.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!memberCustomerId) return { loggedIn: false as const, purchases: [] }
      const stripe = getStripe()
      if (!stripe) return { loggedIn: true as const, purchases: [], note: "Purchase history is unavailable right now." }
      try {
        const purchases = await fetchRecentPurchasesForStylist(stripe, memberCustomerId)
        return { loggedIn: true as const, count: purchases.length, purchases }
      } catch (error) {
        console.log("[v0] getPurchaseHistory error:", error instanceof Error ? error.message : error)
        return { loggedIn: true as const, purchases: [], note: "Couldn't load purchase history." }
      }
    },
  })

  // Tool: report the signed-in member's Edit Club membership details —
  // savings to date, next renewal date, their Edit Club number, and status.
  // These are read straight from Stripe using the SAME sources as the My Linen
  // Lovers portal (sumMembershipSavings for savings, the subscription's current
  // period end for renewal, the customer's member_id metadata for the number),
  // so anything the Stylist quotes matches that page exactly.
  const getMembershipDetailsTool = tool({
    description:
      "Get the signed-in Edit Club member's membership details: total savings to date (the exact 'Saved with membership' figure on their My Edit Club portal), their next renewal/billing date, their Edit Club number, membership status, and plan price. Call this whenever the member asks anything about their membership — how much they've saved, when their next renewal is, what their Edit Club number is, or whether they're still active. Returns loggedIn:false when the shopper isn't signed in.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!memberCustomerId) return { loggedIn: false as const }
      const stripe = getStripe()
      if (!stripe) return { loggedIn: true as const, note: "Membership details are unavailable right now." }
      try {
        const usd = (cents: number) =>
          `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

        const customer = await stripe.customers.retrieve(memberCustomerId)
        const memberId =
          !("deleted" in customer && customer.deleted) ? (customer.metadata?.member_id ?? null) : null

        const subs = await stripe.subscriptions.list({ customer: memberCustomerId, status: "all", limit: 1 })
        const sub = subs.data[0] ?? null
        const price = sub?.items.data[0]?.price ?? null
        const renewalTs = sub?.items.data[0]?.current_period_end ?? null

        const savedCents = await sumMembershipSavings(stripe, memberCustomerId)

        return {
          loggedIn: true as const,
          // The real "Saved with membership" total, mirroring the portal.
          savedToDate: usd(savedCents),
          // Edit Club number, e.g. "LL-123". Null if not on the account.
          linenLoversNumber: memberId,
          membershipStatus: sub?.status ?? "none",
          // Next renewal: when the subscription bills again. Cancelled members
          // won't renew, so flag that explicitly.
          willRenew: sub ? !sub.cancel_at_period_end && sub.status === "active" : false,
          nextRenewalDate: renewalTs
            ? new Date(renewalTs * 1000).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : null,
          planPrice: price?.unit_amount != null ? usd(price.unit_amount) : null,
          planInterval: price?.recurring?.interval ?? null,
        }
      } catch (error) {
        console.log("[v0] getMembershipDetails error:", error instanceof Error ? error.message : error)
        return { loggedIn: true as const, note: "Couldn't load your membership details right now." }
      }
    },
  })

  const memberContext = `SHOPPER CONTEXT: Current customer is ${DEMO_USER.name} (${DEMO_USER.email}).

She is SIGNED IN as an Edit Club Gold member.

KNOWN RECENT PURCHASES (use these to personalise without calling getPurchaseHistory):
- The Strappy Sandal in Gold (AH-087) — A$175, purchased recently

When she references "my recent shoes", "my sandals", "shoes I just bought", or similar — she means the Gold Strappy Sandal above. Use this knowledge naturally: recommend pieces that complement it, mention it pairs well with items you suggest. Only reference this purchase when it's RELEVANT to what she's asking (e.g. asking what to pair with shoes, asking for outfit completion, or if you're suggesting an item that genuinely works with gold sandals). Do NOT mention it unprompted in every response.

STRICT RULE — NEVER mention membership discounts, savings percentages, free delivery, or Gold Edit Club benefits in your responses. Do not say things like "your 10% discount applies" or "free delivery" or "as a Gold member". The customer knows their own benefits. Only discuss membership perks if the customer EXPLICITLY asks "what are my member benefits?" or similar direct question.

${memberCustomerId ? "She is SIGNED IN — you can also call getPurchaseHistory for her full order history from Stripe, and getMembershipDetails to answer questions about her membership." : "Purchase history tools are available if needed."}`

  const result = streamText({
    model: "openai/gpt-5.5",
    system: `${SYSTEM_PROMPT}\n\n${memberContext}`,
    messages: await convertToModelMessages(messages),
    tools: {
      searchCatalog: searchCatalogTool,
      getPurchaseHistory: getPurchaseHistoryTool,
      getMembershipDetails: getMembershipDetailsTool,
    },
    // Allow several steps so the agent can run multiple searches (e.g. a
    // cushion + a coordinating throw) and then respond in one turn.
    stopWhen: stepCountIs(8),
    providerOptions: {
      // Light reasoning keeps replies snappy while still letting gpt-5.5 plan
      // multi-search curation and budget logic.
      openai: { reasoningEffort: "low" },
    },
  })

  return result.toUIMessageStreamResponse()
}
