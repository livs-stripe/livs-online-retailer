import { type NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"
import { ADAIRS_PRODUCTS } from "@/lib/products"
import { curateAnalysis, detectStyleKey } from "@/lib/style-curation"
import type { RoomAnalysis } from "@/lib/types"

export const maxDuration = 30

// How many pieces make up a curated, styleable collection. Kept tight so the
// list on screen maps 1:1 to what we can realistically place in the room photo.
const CURATED_COUNT = 6

const analysisSchema = z.object({
  roomType: z.string().describe("The type of room, e.g. 'Living Room', 'Bedroom'"),
  detectedStyle: z.string().describe("The interior style detected, e.g. 'Coastal', 'Boho', 'Scandinavian'"),
  colourPalette: z
    .array(z.string())
    .length(5)
    .describe("Exactly 5 hex colour codes sampled from the actual room photo"),
  styleGap: z
    .string()
    .describe(
      "REQUIRED FORMAT: must start with 'To bring this <room type> toward a <requested style> feel, ' and then " +
        "name the specific colours, materials and pieces that would move the room toward that style. It MUST " +
        "mention the customer's requested style by name. Example: 'To bring this living room toward a relaxed " +
        "boho feel, layer in earthy terracotta tones, a jute rug, woven textures and a rattan accent.' " +
        "Do NOT criticise or describe what is wrong with the current room — only describe the forward-looking, " +
        "theme-specific additions.",
    ),
  stylistNote: z.string().describe("A warm, 1-2 sentence editorial note from the stylist"),
  recommendedProductIds: z
    .array(z.string())
    .describe(
      `Exactly ${CURATED_COUNT} product IDs that form ONE cohesive, complementary collection for this room, ordered by visual impact`,
    ),
})

// Words that signal the gap is critiquing the current room rather than
// describing the theme-forward additions we want.
const CRITIQUE_WORDS = [
  "cold",
  "sterile",
  "stark",
  "lacking",
  "lacks",
  "uninviting",
  "bland",
  "boring",
  "dull",
  "empty",
  "bare",
  "cluttered",
  "outdated",
  "drab",
  "harsh",
]

// Ensure the styleGap reads as a forward-looking, theme-led recommendation.
// Falls back to the deterministic, theme-specific gap when the AI's version
// reads as a critique or doesn't follow the required "To bring this..." shape.
function ensureThemeGap(aiGap: string | undefined, fallbackGap: string): string {
  const gap = (aiGap ?? "").trim()
  if (!gap) return fallbackGap
  const lower = gap.toLowerCase()
  const startsRight = lower.startsWith("to bring this") || lower.startsWith("to give this")
  const hasCritique = CRITIQUE_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lower))
  if (!startsRight || hasCritique) return fallbackGap
  return gap
}

export async function POST(req: NextRequest) {
  let imageBase64 = ""
  let stylePrompt = ""
  // Optional budget (AUD). When present, the whole curated look must fit within
  // it — this is the figure the buyer later authorizes the agent to spend.
  let budget: number | undefined

  try {
    const body = await req.json()
    imageBase64 = body.imageBase64 ?? ""
    stylePrompt = body.stylePrompt ?? ""
    if (typeof body.budget === "number" && body.budget > 0) budget = body.budget
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!imageBase64) {
    return NextResponse.json({ error: "Missing room image" }, { status: 400 })
  }

  // Give the model the full catalog with colour + price so it can coordinate a scheme
  const catalog = ADAIRS_PRODUCTS.map(
    (p) => `${p.id} | ${p.name} | ${p.category} | ${p.variant} | $${p.price}`,
  ).join("\n")

  // Deterministic, style-aware curation. Used to (a) bias the AI toward the
  // requested style and (b) guarantee a DIFFERENT, on-brief fallback per style
  // if the model is unavailable — so "boho" and "mediterranean" never collapse
  // to the same generic edit.
  const styleKey = detectStyleKey(stylePrompt)
  const suggested = curateAnalysis(stylePrompt, "living", budget)
  const suggestedLine = suggested.recommendedProductIds
    .map((id) => {
      const p = ADAIRS_PRODUCTS.find((x) => x.id === id)
      return p ? `${p.id} (${p.name})` : id
    })
    .join(", ")

  try {
    const { output } = await generateText({
      model: "google/gemini-3.5-flash",
      output: Output.object({ schema: analysisSchema }),
      messages: [
        {
          role: "system",
          content:
            "You are a senior interior stylist for Adairs, an Australian homewares brand. " +
            "Analyse the customer's room photo and curate a SMALL, cohesive collection that elevates the space.\n\n" +
            "Rules for recommendedProductIds:\n" +
            `- Select EXACTLY ${CURATED_COUNT} products.\n` +
            "- CRITICAL: Only recommend items that can REALISTICALLY be placed in THIS room type, because every " +
            "recommended piece will be composited into the customer's room photo. For a living room, lounge, office, " +
            "breakout or any non-bedroom space, do NOT recommend bed linen, quilt covers, sheets, pillowcases or " +
            "duvets. Reserve bed linen and quilt covers for actual bedrooms only.\n" +
            "- ALWAYS include at least one rug from the 'Rugs and Mats' category as a grounding hero piece — rugs " +
            "anchor the room and are essential to the styled look.\n" +
            "- For a living room / lounge, ALSO include from the 'Furniture' category one hero sofa or lounge AND " +
            "one coffee/occasional table whose colour and material clearly match the style brief (e.g. a black or " +
            "marble table for modern/luxe, an olive or natural-timber piece for boho/tropical). These define the " +
            "look. Order them FIRST (sofa, then table) so they are placed before the smaller accents.\n" +
            "- Choose pieces from DIFFERENT categories so they layer together (e.g. a rug, cushions, a throw, " +
            "a lamp, a piece of decor) rather than several of the same thing.\n" +
            "- The pieces must share a coherent colour story that complements the room's existing palette and the " +
            "customer's style brief.\n" +
            "- CRITICAL: The selection MUST clearly reflect the customer's style brief. A 'boho' brief should look " +
            "distinctly different from a 'mediterranean', 'coastal', 'scandi' or 'modern' brief — different colours, " +
            "materials and motifs. Do NOT default to the same neutral set regardless of the brief.\n" +
            "- Only use IDs that exist in the catalog below. Order them by visual impact (hero piece first), since " +
            "they are placed into the photo in that order.\n\n" +
            "Also extract the room type, the detected style, and exactly 5 hex colours sampled from the photo.\n" +
            "- styleGap: write ONE forward-looking sentence that MUST begin with 'To bring this <room type> toward " +
            "a <requested style> feel, ' and then name the specific colours, materials and pieces that would move " +
            "the room toward the customer's REQUESTED style. It MUST mention the requested style by name. " +
            "Example: 'To bring this living room toward a relaxed coastal feel, layer in breezy whites, natural " +
            "jute, soft linen and a few woven accents.' CRITICAL: Do NOT criticise, describe or list what is wrong " +
            "with the current room (no words like 'cold', 'sterile', 'stark', 'lacking', 'uninviting'). Focus ONLY " +
            "on the theme-specific additions that achieve the requested look.\n" +
            "- stylistNote: a warm, 1-2 sentence editorial note from the stylist.\n\n" +
            "Catalog (id | name | category | variant | price):\n" +
            catalog,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                (stylePrompt
                  ? `My style brief: ${stylePrompt}\n(Interpreted style direction: ${styleKey}.)`
                  : "No specific brief — style it to suit the room.") +
                (budget
                  ? `\n\nMy total budget is $${budget} AUD. CRITICAL: the combined price of all ${CURATED_COUNT} ` +
                    "recommended pieces MUST stay at or under this budget. Prioritise the hero pieces, then choose " +
                    "the most impactful accents that still fit. Do not exceed the budget."
                  : "") +
                `\n\nFor reference, a strong on-brief selection for this style would be: ${suggestedLine}. ` +
                "You may refine this using the actual room photo, but stay true to this style direction.",
            },
            { type: "image", image: imageBase64 },
          ],
        },
      ],
    })

    // Keep only valid, unique product IDs and cap to the curated count
    const validIds = new Set(ADAIRS_PRODUCTS.map((p) => p.id))
    let recommendedProductIds = [...new Set(output.recommendedProductIds)]
      .filter((id) => validIds.has(id))
      .slice(0, CURATED_COUNT)

    // Budget guardrail: if the model overshot the buyer's budget, fall back to
    // the deterministic, budget-fitted curation so the look the buyer sees (and
    // later authorizes the agent to buy) can never exceed what they set.
    if (budget !== undefined) {
      const total = recommendedProductIds.reduce(
        (sum, id) => sum + (ADAIRS_PRODUCTS.find((p) => p.id === id)?.price ?? 0),
        0,
      )
      if (total > budget) recommendedProductIds = suggested.recommendedProductIds
    }

    // Safety net: guarantee the styleGap is theme-led, not a critique. If the
    // model lapsed into describing what's wrong with the room, or failed to
    // reference the requested style, swap in the deterministic theme-specific
    // gap so it always reads as "to achieve <style>, add <materials>".
    const styleGap = ensureThemeGap(output.styleGap, suggested.styleGap)

    return NextResponse.json({
      ...output,
      styleGap,
      // If the model returned no usable IDs, fall back to the style-aware
      // curation rather than a single generic list.
      recommendedProductIds: recommendedProductIds.length
        ? recommendedProductIds
        : suggested.recommendedProductIds,
    } satisfies RoomAnalysis)
  } catch (error) {
    console.log("[v0] analyse-room error, falling back to style-aware curation:", error)
    return NextResponse.json(suggested)
  }
}
