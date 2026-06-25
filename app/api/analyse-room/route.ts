import { type NextRequest, NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"
import { ADAIRS_PRODUCTS } from "@/lib/products"
import { curateAnalysis, detectStyleKey, type RoomKind } from "@/lib/style-curation"
import type { RoomAnalysis } from "@/lib/types"

export const maxDuration = 30

// How many pieces make up one complete, styleable look. Kept tight so the list
// on screen maps 1:1 to a head-to-toe outfit (layer, base, shoes, bag, accent).
const CURATED_COUNT = 6

const analysisSchema = z.object({
  roomType: z.string().describe("The occasion the look is for, e.g. 'Workwear Edit', 'Weekend Edit', 'Evening Edit'"),
  detectedStyle: z
    .string()
    .describe("The fashion aesthetic detected from the photo + brief, e.g. 'Minimalist', 'Classic / Tailored', 'Romantic'"),
  colourPalette: z
    .array(z.string())
    .length(5)
    .describe("Exactly 5 hex colour codes that define the look's colour story (drawn from the photo + recommended pieces)"),
  styleGap: z
    .string()
    .describe(
      "REQUIRED FORMAT: must start with 'To bring your look toward a <requested style> feel, ' and then name the " +
        "specific colours, fabrics and garments that complete the outfit. It MUST mention the customer's requested " +
        "style by name. Example: 'To bring your look toward a classic feel, build around a navy blazer, a straight-leg " +
        "trouser and polished leather accents.' Do NOT criticise the customer or what they are currently wearing — " +
        "only describe the forward-looking, style-specific additions.",
    ),
  stylistNote: z.string().describe("A warm, 1-2 sentence editorial note from Hem, the personal stylist"),
  recommendedProductIds: z
    .array(z.string())
    .describe(
      `Exactly ${CURATED_COUNT} product IDs that form ONE complete, coordinated head-to-toe outfit, ordered by visual impact`,
    ),
})

// Words that signal the gap is critiquing the customer rather than describing
// the style-forward additions we want.
const CRITIQUE_WORDS = [
  "frumpy",
  "dated",
  "outdated",
  "boring",
  "dull",
  "unflattering",
  "cheap",
  "ill-fitting",
  "drab",
  "wrong",
  "mistake",
  "bad",
]

// Ensure the styleGap reads as a forward-looking, style-led recommendation.
function ensureThemeGap(aiGap: string | undefined, fallbackGap: string): string {
  const gap = (aiGap ?? "").trim()
  if (!gap) return fallbackGap
  const lower = gap.toLowerCase()
  const startsRight = lower.startsWith("to bring your look") || lower.startsWith("to give your look")
  const hasCritique = CRITIQUE_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lower))
  if (!startsRight || hasCritique) return fallbackGap
  return gap
}

export async function POST(req: NextRequest) {
  let imageBase64 = ""
  let stylePrompt = ""
  let occasion: RoomKind = "work"
  // Optional budget (AUD). When present, the whole curated look must fit within
  // it — this is the figure the buyer later authorizes the agent to spend.
  let budget: number | undefined

  try {
    const body = await req.json()
    imageBase64 = body.imageBase64 ?? ""
    stylePrompt = body.stylePrompt ?? ""
    if (body.occasion === "work" || body.occasion === "weekend" || body.occasion === "evening") {
      occasion = body.occasion
    }
    if (typeof body.budget === "number" && body.budget > 0) budget = body.budget
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!imageBase64) {
    return NextResponse.json({ error: "Missing photo" }, { status: 400 })
  }

  // Give the model the full catalogue with subcategory + colour + price so it can
  // coordinate a complete head-to-toe outfit.
  const catalog = ADAIRS_PRODUCTS.map(
    (p) => `${p.id} | ${p.name} | ${p.category} / ${p.subcategory} | ${p.colour} | $${p.price}`,
  ).join("\n")

  // Deterministic, style-aware curation. Used to (a) bias the AI toward the
  // requested style and (b) guarantee a DIFFERENT, on-brief fallback per style
  // if the model is unavailable.
  const styleKey = detectStyleKey(stylePrompt)
  const suggested = curateAnalysis(stylePrompt, occasion, budget)
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
            "You are Hem, a senior personal stylist for Aster & Hem, a contemporary Australian womenswear brand. " +
            "Analyse the customer's photo (it may show them, an outfit they love, or pieces from their wardrobe) and " +
            "curate ONE complete, coordinated head-to-toe outfit that matches their style brief and the occasion.\n\n" +
            "Rules for recommendedProductIds:\n" +
            `- Select EXACTLY ${CURATED_COUNT} products that together form a SINGLE cohesive outfit.\n` +
            "- Build a complete look: include a layer (blazer/jacket/coat), a base (either a dress OR a top + a " +
            "bottom), shoes, a bag, and one or two accessories (jewellery, scarf or belt). Do NOT recommend several " +
            "of the same garment type (e.g. three dresses).\n" +
            "- The pieces MUST share a coherent colour story that complements the customer's photo and brief.\n" +
            `- Favour pieces appropriate to the occasion: ${occasion}.\n` +
            "- CRITICAL: the outfit MUST clearly reflect the customer's requested style. A 'minimalist' brief should " +
            "look distinctly different from a 'romantic', 'classic', 'relaxed', 'monochrome' or 'earthy' brief — " +
            "different colours, fabrics and silhouettes. Do NOT default to the same neutral set regardless of brief.\n" +
            "- Only use IDs that exist in the catalogue below. Order them by visual impact (hero piece first).\n\n" +
            "Also infer the occasion label, the detected aesthetic, and exactly 5 hex colours for the look's palette.\n" +
            "- styleGap: write ONE forward-looking sentence that MUST begin with 'To bring your look toward a " +
            "<requested style> feel, ' and then name the specific colours, fabrics and garments that complete the " +
            "outfit. It MUST mention the requested style by name. CRITICAL: never criticise the customer or what " +
            "they're wearing — focus ONLY on the style-specific additions.\n" +
            "- stylistNote: a warm, 1-2 sentence editorial note from Hem.\n\n" +
            "Catalogue (id | name | category / subcategory | colour | price):\n" +
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
                  : "No specific brief — style it to suit me.") +
                `\nOccasion: ${occasion}.` +
                (budget
                  ? `\n\nMy total budget is $${budget} AUD. CRITICAL: the combined price of all ${CURATED_COUNT} ` +
                    "recommended pieces MUST stay at or under this budget. Prioritise the hero pieces, then choose " +
                    "the most impactful accents that still fit. Do not exceed the budget."
                  : "") +
                `\n\nFor reference, a strong on-brief outfit for this style would be: ${suggestedLine}. ` +
                "You may refine this using the actual photo, but stay true to this style direction.",
            },
            { type: "image", image: imageBase64 },
          ],
        },
      ],
    })

    const validIds = new Set(ADAIRS_PRODUCTS.map((p) => p.id))
    let recommendedProductIds = [...new Set(output.recommendedProductIds)]
      .filter((id) => validIds.has(id))
      .slice(0, CURATED_COUNT)

    // Budget guardrail: if the model overshot, fall back to the deterministic,
    // budget-fitted curation so the look the buyer authorizes can't exceed it.
    if (budget !== undefined) {
      const total = recommendedProductIds.reduce(
        (sum, id) => sum + (ADAIRS_PRODUCTS.find((p) => p.id === id)?.price ?? 0),
        0,
      )
      if (total > budget) recommendedProductIds = suggested.recommendedProductIds
    }

    const styleGap = ensureThemeGap(output.styleGap, suggested.styleGap)

    return NextResponse.json({
      ...output,
      styleGap,
      recommendedProductIds: recommendedProductIds.length
        ? recommendedProductIds
        : suggested.recommendedProductIds,
    } satisfies RoomAnalysis)
  } catch (error) {
    console.log("[v0] analyse-room error, falling back to style-aware curation:", error)
    return NextResponse.json(suggested)
  }
}
