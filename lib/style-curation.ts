// Deterministic, style-aware product curation.
//
// The AI stylist (app/api/analyse-room) is the primary path, but it can fail or
// return nothing. Previously the fallback was a single hard-coded list, so every
// style brief produced the SAME items (and therefore the same styled image).
//
// This module maps a free-text style brief (e.g. "boho", "mediterranean",
// "scandi") to a genuinely different, cohesive collection by scoring each
// catalog product against the chosen style. Scoring is two-tier:
//   - `signature` words are style-DEFINING (e.g. "tassel"/"jute" = boho,
//     "velvet"/"chrome" = luxe/modern). They score strongly AND act as
//     anti-signals for every OTHER style, so a signature piece of one style is
//     actively pushed OUT of a conflicting style's edit. This is what makes a
//     boho selection genuinely different from a modern one.
//   - `signals` are supporting cues (colours, materials) that nudge fit but are
//     shared more freely across styles.
// It is fully deterministic so the same brief always yields the same edit.

import { ADAIRS_PRODUCTS, type AdairsProduct } from "@/lib/products"
import type { RoomAnalysis } from "@/lib/types"

export type StyleKey =
  | "boho"
  | "coastal"
  | "mediterranean"
  | "scandi"
  | "modern"
  | "hamptons"
  | "farmhouse"
  | "japandi"
  | "luxe"
  | "tropical"
  | "neutral"

export type RoomKind = "living" | "bedroom"

interface StyleProfile {
  label: string
  // Words typed by the customer that select this style.
  aliases: string[]
  // Style-DEFINING words. Strong positive for this style; penalised for others.
  signature: string[]
  // Supporting cues (colours, materials). Soft positive, shared across styles.
  signals: string[]
  palette: string[]
  detectedStyle: string
  styleGap: string
  stylistNote: string
}

const STYLE_PROFILES: Record<Exclude<StyleKey, "neutral">, StyleProfile> = {
  boho: {
    label: "Boho",
    aliases: ["boho", "bohemian", "eclectic", "free spirit", "moroccan", "earthy", "global"],
    signature: [
      "tassel", "pom pom", "pompom", "fringe", "fringed", "jute", "sari", "macrame",
      "rattan", "cane", "kilim", "scalloped", "woven", "rust", "mustard", "ochre", "terracotta",
    ],
    signals: ["sage", "olive", "tan", "caramel", "umber", "turmeric", "tumeric", "spice", "natural", "fiore", "ravello"],
    palette: ["#B5651D", "#D9A14E", "#C97B63", "#7C8A4E", "#EDE3D2"],
    detectedStyle: "Boho / Eclectic",
    styleGap: "Your space is craving layered textures, earthy tones and a few free-spirited accents to feel collected and warm.",
    stylistNote: "I've pulled an earthy, textural edit — natural fibres, warm spice tones and tactile layers that bring relaxed boho character to the room.",
  },
  coastal: {
    label: "Coastal",
    aliases: ["coastal", "beach", "nautical", "seaside", "ocean", "hampton coastal"],
    signature: ["shell", "seafoam", "nautical", "rope", "driftwood", "wave", "ocean", "marine", "sea", "coast", "sand"],
    signals: ["blue", "white", "eucalyptus", "mint", "teal", "sky", "denim", "breeze", "spray", "sorrento", "capri"],
    palette: ["#3E6E8E", "#9FC1D4", "#F3F6F7", "#E3D9C6", "#1F3A4D"],
    detectedStyle: "Coastal / Relaxed",
    styleGap: "The room would lift with breezy blues, soft whites and natural textures to bring that calm, by-the-sea feeling.",
    stylistNote: "Think soft sea blues, sun-bleached whites and natural weaves — a calm coastal palette that feels fresh and airy.",
  },
  mediterranean: {
    label: "Mediterranean",
    aliases: ["mediterranean", "med", "greek", "italian", "amalfi", "tuscan", "spanish", "santorini"],
    signature: ["santorini", "amalfi", "positano", "sorrento", "splatter", "mosaic", "azure", "lemon", "citrus", "limoncello"],
    signals: ["blue", "white", "olive", "gold", "stripe", "terracotta", "terra cotta", "fresco", "porto", "riva"],
    palette: ["#2E5A87", "#E8E2D4", "#D98E3B", "#7A8B3C", "#FAF6EE"],
    detectedStyle: "Mediterranean / Sun-washed",
    styleGap: "It needs sun-baked terracotta, deep Aegean blues and hand-made ceramics to capture that warm Mediterranean spirit.",
    stylistNote: "A sun-washed Mediterranean edit — Aegean blues, warm terracotta and artisan ceramics that feel like a coastal villa.",
  },
  scandi: {
    label: "Scandi",
    aliases: ["scandi", "scandinavian", "nordic", "hygge", "minimal scandi"],
    signature: ["boucle", "nordic", "undyed", "birch", "hygge", "snow"],
    signals: ["white", "oak", "bamboo", "natural", "cream", "ivory", "pearl", "dove", "stone", "pale", "grey"],
    palette: ["#EDEBE6", "#D8D2C7", "#B7AE9F", "#8C8C8C", "#3A3833"],
    detectedStyle: "Scandinavian / Minimal",
    styleGap: "A pared-back palette of soft whites, pale woods and gentle texture would give the room that calm, uncluttered Scandi balance.",
    stylistNote: "A calm, pared-back Scandi edit — soft whites, pale neutrals and quiet texture for an uncluttered, light-filled feel.",
  },
  modern: {
    label: "Modern",
    aliases: ["modern", "contemporary", "minimalist", "minimal", "industrial", "monochrome", "sleek", "chic"],
    signature: ["black", "onyx", "charcoal", "chrome", "monochrome", "graphite", "slate", "matte", "concrete", "gunmetal", "coal"],
    signals: ["grey", "silver", "ash", "shadow", "midnight", "stone", "marle", "zeus", "loreto"],
    palette: ["#2B2B2B", "#6E6E6E", "#A8A29A", "#E5E2DD", "#111111"],
    detectedStyle: "Modern / Contemporary",
    styleGap: "Clean lines in a tonal black-to-stone palette with one or two sculptural pieces would sharpen the room's modern edge.",
    stylistNote: "A sharp, tonal edit — charcoals, stone and matte black with clean lines for a confident contemporary look.",
  },
  hamptons: {
    label: "Hamptons",
    aliases: ["hamptons", "classic", "traditional", "elegant classic", "coastal classic"],
    signature: ["navy", "pinstripe", "tailored", "colton"],
    signals: ["stripe", "white", "blue", "gold", "ivory", "cream", "pearl", "breeze", "snow", "harlow"],
    palette: ["#1F3A5F", "#F4F1EA", "#9DB4C8", "#C9A227", "#FFFFFF"],
    detectedStyle: "Hamptons / Classic",
    styleGap: "Crisp navy-and-white, soft stripes and a touch of warm gold would bring that timeless, tailored Hamptons elegance.",
    stylistNote: "A timeless Hamptons edit — crisp whites, deep navy and tailored stripes with a hint of gold for relaxed elegance.",
  },
  farmhouse: {
    label: "Farmhouse",
    aliases: ["farmhouse", "rustic", "country", "cottage", "provincial", "french country"],
    signature: ["gingham", "washed", "vintage", "wicker", "stonewashed"],
    signals: ["jute", "natural", "wool", "oak", "walnut", "linen", "sesame", "undyed", "basket", "beige", "ecru"],
    palette: ["#8A7A5E", "#D9CDB6", "#B79B6E", "#5C4A33", "#F1EADB"],
    detectedStyle: "Farmhouse / Rustic",
    styleGap: "Natural timbers, woven baskets and soft washed linens would give the room that warm, lived-in farmhouse comfort.",
    stylistNote: "A warm, rustic edit — washed linens, natural fibres and timber tones for that relaxed, lived-in farmhouse feel.",
  },
  japandi: {
    label: "Japandi",
    aliases: ["japandi", "japanese", "zen", "wabi", "wabi sabi", "minimal japanese"],
    signature: ["bamboo", "wabi", "zen", "moss", "stoneware"],
    signals: ["undyed", "oak", "natural", "stonewashed", "ash", "sesame", "stone", "boucle", "linen", "calypso"],
    palette: ["#A89B83", "#6F6A5C", "#D7D0C2", "#3F3B33", "#EFEBE2"],
    detectedStyle: "Japandi / Warm Minimal",
    styleGap: "A restrained palette of warm naturals, matte textures and low, grounded forms would bring that calm Japandi balance.",
    stylistNote: "A warm-minimal Japandi edit — natural fibres, muted earth tones and quiet, grounded pieces for a serene balance.",
  },
  luxe: {
    label: "Luxe",
    aliases: ["luxe", "glam", "glamorous", "luxury", "opulent", "elegant", "hollywood", "decadent"],
    signature: ["velvet", "fur", "chenille", "marble", "brass", "crystal", "satin", "plush"],
    signals: ["gold", "silver", "chrome", "bombay", "astoria", "florence", "midnight", "onyx", "clamshell"],
    // Warm, glamorous neutrals + metallic gold (no dominant purple per design guidance).
    palette: ["#2E2A33", "#8B6B4A", "#C9A227", "#2B2B2B", "#EDE6DA"],
    detectedStyle: "Luxe / Glam",
    styleGap: "Plush velvets, soft furs and metallic accents would add the rich, tactile glamour the room is missing.",
    stylistNote: "A rich, tactile edit — plush velvets, soft furs and warm metallic accents for a glamorous, layered finish.",
  },
  tropical: {
    label: "Tropical",
    aliases: ["tropical", "jungle", "resort", "palm springs", "island", "rainforest"],
    signature: ["palm", "monstera", "fern", "jungle", "tropic", "frond", "banana leaf"],
    signals: ["green", "forest", "leaf", "ivy", "seagrass", "olive", "fresco", "banksia", "lilly", "pilly"],
    palette: ["#2F5D3A", "#6E8B3D", "#C9B27C", "#1E3A2B", "#F0EFE2"],
    detectedStyle: "Tropical / Resort",
    styleGap: "Lush greens, palm motifs and natural textures would bring that vibrant, resort-style energy to the space.",
    stylistNote: "A lush, resort-style edit — deep greens, palm motifs and natural texture for a vibrant tropical mood.",
  },
}

// Short, customer-facing taglines for each selectable theme. These describe the
// vibe the vector search / curation engine maps products to.
const STYLE_DESCRIPTIONS: Record<Exclude<StyleKey, "neutral">, string> = {
  boho: "Natural textures, warm spice tones & relaxed layers",
  coastal: "Breezy blues, soft whites & natural weaves",
  mediterranean: "Aegean blues, terracotta & artisan ceramics",
  scandi: "Soft whites, pale woods & quiet texture",
  modern: "Charcoals, stone & clean contemporary lines",
  hamptons: "Crisp navy & white with tailored elegance",
  farmhouse: "Washed linens, timber tones & woven baskets",
  japandi: "Warm naturals, muted earth tones & calm forms",
  luxe: "Plush velvets, soft furs & metallic accents",
  tropical: "Lush greens, palm motifs & natural texture",
}

// Budget tiers the buyer can anchor the look to. The chosen value (in AUD)
// becomes the curation ceiling AND the Shared Payment Token spend cap, so the
// mandate the buyer approves is the same number that constrains the shop.
// `null` means no limit — curate purely on style.
export interface BudgetOption {
  label: string
  value: number | null
}

export const BUDGET_OPTIONS: BudgetOption[] = [
  { label: "Up to $1,500", value: 1500 },
  { label: "Up to $2,500", value: 2500 },
  { label: "Up to $4,000", value: 4000 },
  { label: "No budget limit", value: null },
]

export interface StyleOption {
  key: Exclude<StyleKey, "neutral">
  label: string
  description: string
  // Rich phrase fed into the analysis pipeline as the style brief. It contains
  // the theme name so detectStyleKey() resolves it, and descriptive cues so the
  // AI stylist and vector search get strong signal.
  prompt: string
  palette: string[]
}

// The selectable themes shown to the customer (one per defined style profile).
export const STYLE_OPTIONS: StyleOption[] = (
  Object.keys(STYLE_PROFILES) as Array<Exclude<StyleKey, "neutral">>
).map((key) => ({
  key,
  label: STYLE_PROFILES[key].label,
  description: STYLE_DESCRIPTIONS[key],
  prompt: `${STYLE_PROFILES[key].label} — ${STYLE_DESCRIPTIONS[key].toLowerCase()}`,
  palette: STYLE_PROFILES[key].palette,
}))

const NEUTRAL_PROFILE: StyleProfile = {
  label: "Contemporary Neutral",
  aliases: [],
  signature: [],
  signals: ["natural", "linen", "boucle", "cream", "stone", "sesame", "white", "oak", "beige", "umber"],
  palette: ["#C4956A", "#E8DDD0", "#2C2925", "#8B7355", "#F5F0EB"],
  detectedStyle: "Transitional / Neutral",
  styleGap: "Your room would benefit from layered textures and warm neutral accents to create depth.",
  stylistNote: "A warm, neutral edit — layered textures and soft earthy tones that elevate the space without overwhelming it.",
}

function profileFor(key: StyleKey): StyleProfile {
  return key === "neutral" ? NEUTRAL_PROFILE : STYLE_PROFILES[key]
}

// Map a free-text brief to a style key by matching alias words.
export function detectStyleKey(prompt: string): StyleKey {
  const text = ` ${prompt.toLowerCase()} `
  let best: { key: StyleKey; score: number } = { key: "neutral", score: 0 }
  for (const key of Object.keys(STYLE_PROFILES) as Array<Exclude<StyleKey, "neutral">>) {
    const { aliases } = STYLE_PROFILES[key]
    let score = 0
    for (const alias of aliases) {
      if (text.includes(` ${alias} `) || text.includes(alias)) score += alias.includes(" ") ? 3 : 2
    }
    if (score > best.score) best = { key, score }
  }
  return best.key
}

// Scoring weights.
const SIGNATURE_WEIGHT = 5 // own style-defining word present
const SIGNAL_WEIGHT = 1 // own supporting cue present
const CONFLICT_PENALTY = 4 // a DIFFERENT style's signature word present

// Build the set of words that "belong" to a style so we don't penalise a word
// that the requested style also claims (e.g. "chrome" is shared by modern+luxe).
function ownVocabulary(profile: StyleProfile): Set<string> {
  return new Set([...profile.signature, ...profile.signals])
}

// Collect every OTHER style's signature words (the anti-signals for `key`),
// excluding any the requested style also uses.
function conflictingSignatures(key: StyleKey, own: Set<string>): string[] {
  const out: string[] = []
  for (const k of Object.keys(STYLE_PROFILES) as Array<Exclude<StyleKey, "neutral">>) {
    if (k === key) continue
    for (const sig of STYLE_PROFILES[k].signature) {
      if (!own.has(sig)) out.push(sig)
    }
  }
  return out
}

// Cache compiled word-boundary matchers so we don't rebuild them per product.
const wordMatcherCache = new Map<string, RegExp>()
function wordMatcher(word: string): RegExp {
  let re = wordMatcherCache.get(word)
  if (!re) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    re = new RegExp(`\\b${escaped}\\b`, "i")
    wordMatcherCache.set(word, re)
  }
  return re
}

// Match a style word as a WHOLE word, not a naive substring. This is critical:
// substring matching produced false positives like "sea" inside "3 Seater",
// "rope" inside "European", "fur" inside "Furniture" and "ash" inside "washed",
// which wrongly penalised or boosted furniture and broke theme alignment.
function hasWord(text: string, word: string): boolean {
  return wordMatcher(word).test(text)
}

// Score a product's fit for a style. Positive = on-brief; negative = it reads as
// a different (conflicting) style and should be kept out of this edit.
function scoreProduct(product: AdairsProduct, profile: StyleProfile, antiSignals: string[]): number {
  const text = `${product.name} ${product.variant ?? ""}`.toLowerCase()
  let score = 0
  for (const sig of profile.signature) {
    if (hasWord(text, sig)) score += SIGNATURE_WEIGHT
  }
  for (const sig of profile.signals) {
    if (hasWord(text, sig)) score += SIGNAL_WEIGHT
  }
  for (const anti of antiSignals) {
    if (hasWord(text, anti)) score -= CONFLICT_PENALTY
  }
  return score
}

interface CurationSlot {
  categories: string[]
  // Optional regex to target a sub-type within a category (e.g. only sofas
  // within Furniture). If nothing matches, the slot falls back to the whole
  // category so it is never left empty.
  match?: RegExp
}

// Match real multi-seat sofas/lounges (but NOT a single "lounge chair").
const SOFA_MATCH = /\b(sofa|modular|settee|loveseat)\b|\blounge\b(?!\s*chair)/i
// Match coffee/occasional tables — the living-room styling hero. Deliberately
// excludes "side table" so we never surface a BEDSIDE table in a living room.
const TABLE_MATCH = /coffee table|nesting|drinks table|\bc table\b/i

// Category slots per room kind, in priority order. The first slot is the hero.
// Living rooms now LEAD with a theme-matched sofa and coffee table — the two
// highest-impact pieces and the first items the visualiser composites — then
// layer textiles and a finishing accent.
const LIVING_SLOTS: CurationSlot[] = [
  { categories: ["Furniture"], match: SOFA_MATCH },
  { categories: ["Furniture"], match: TABLE_MATCH },
  { categories: ["Rugs and Mats"] },
  { categories: ["Cushions"] },
  { categories: ["Throws and Blankets"] },
  { categories: ["Lighting", "Home Fragrance", "Homewares and Decor"] },
]

const BEDROOM_SLOTS: CurationSlot[] = [
  { categories: ["Bed Linen"] },
  { categories: ["Cushions"] },
  { categories: ["Cushions"] },
  { categories: ["Throws and Blankets"] },
  { categories: ["Rugs and Mats"] },
  { categories: ["Lighting", "Home Fragrance", "Homewares and Decor"] },
]

const CURATED_COUNT = 6

interface ScoredPick {
  product: AdairsProduct
  score: number
}

// How far below the top score a candidate can be and still join the rotation
// pool. Kept tight (≈ one supporting signal) so we only ever rotate among items
// that are similarly strongly on-theme, never dropping to off-brief picks.
const ROTATION_TOLERANCE = 2
// Always keep at least this many candidates in the pool (when available) so
// there is genuine variety even when the top tier is small.
const MIN_ROTATION_POOL = 5

// How much more likely the single best-fitting item can be over the weakest
// item in the pool. Capping this prevents one strongly-keyworded product (e.g.
// the only sofa literally named "olive") from being chosen almost every time,
// which is what made each theme reuse the exact same hero piece.
const MAX_WEIGHT_RATIO = 3

// Weighted-random choice from a scored pool, biased toward higher scores so the
// best-fitting items appear most often while still rotating through the rest.
// The bias is intentionally gentle (and capped) so we get genuine variety
// across runs/images rather than always returning the single top match.
function weightedRandomPick(pool: ScoredPick[]): ScoredPick {
  const minScore = Math.min(...pool.map((x) => x.score))
  // Shift so the lowest-scoring eligible item has weight 1, then cap the extra
  // weight any item can earn so the top pick stays at most MAX_WEIGHT_RATIO×
  // more likely than the floor — keeping picks on-brief without locking in one.
  const weights = pool.map((x) => 1 + Math.min(x.score - minScore, MAX_WEIGHT_RATIO - 1))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// Pick a well-fitting product from any of the given categories that hasn't been
// used yet. Instead of always returning the single top scorer (which made every
// edit for a theme reuse the exact same couch/rug/etc.), we build a pool of the
// strongest on-theme candidates and choose from it with weighted randomness.
// This keeps picks on-brief while rotating variety across runs and images.
function pickFromCategories(
  categories: string[],
  profile: StyleProfile,
  antiSignals: string[],
  used: Set<string>,
  match?: RegExp,
  // Budget guardrail: when set, only items at or below this price are eligible,
  // so the curated look stays within the spend the buyer authorized.
  maxPrice?: number,
): ScoredPick | undefined {
  let candidates = ADAIRS_PRODUCTS.filter(
    (p) => categories.includes(p.category) && !used.has(p.id) && (maxPrice === undefined || p.price <= maxPrice),
  )
  if (match) {
    const matched = candidates.filter((p) => match.test(`${p.name} ${p.variant ?? ""}`))
    // Only narrow to the sub-type if it actually exists; otherwise keep the full
    // category so the slot is never left empty.
    if (matched.length > 0) candidates = matched
  }
  if (candidates.length === 0) return undefined

  const scored: ScoredPick[] = candidates
    .map((product) => ({ product, score: scoreProduct(product, profile, antiSignals) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.product.featured !== b.product.featured) return a.product.featured ? -1 : 1
      return Number(a.product.id) - Number(b.product.id)
    })

  const bestScore = scored[0].score
  // Build the rotation pool: items within tolerance of the top score. When we
  // have genuinely on-theme items (bestScore > 0) we never let an off-brief
  // (negative-scoring) item into the pool; when nothing is on-theme we rotate
  // among the equally-neutral top tier so furniture still varies.
  const floor = bestScore > 0 ? Math.max(1, bestScore - ROTATION_TOLERANCE) : bestScore
  let pool = scored.filter((x) => x.score >= floor)

  // If the tight pool is small, widen to NON-CONFLICTING candidates (score >= 0)
  // so neutral, on-brief pieces join the rotation even when only one item
  // carries an explicit signature keyword. This is the key variety fix: for a
  // theme like boho/jungle only one sofa may literally say "olive", but the
  // other plain cream/beige sofas are perfectly valid bases and should rotate in
  // too. Genuinely off-brief (negative-scoring) items still stay excluded
  // whenever we have any on-brief option.
  if (pool.length < MIN_ROTATION_POOL) {
    const acceptable = bestScore > 0 ? scored.filter((x) => x.score >= 0) : scored
    pool = acceptable.slice(0, Math.max(MIN_ROTATION_POOL, pool.length))
  }

  return weightedRandomPick(pool)
}

// Cheapest still-available product across a slot's categories (respecting the
// slot's sub-type match). Used to RESERVE a minimum spend for the slots we
// haven't filled yet, so a budget isn't blown entirely on the hero piece.
function minSlotPrice(slot: CurationSlot, used: Set<string>): number {
  let cands = ADAIRS_PRODUCTS.filter((p) => slot.categories.includes(p.category) && !used.has(p.id))
  if (slot.match) {
    const matched = cands.filter((p) => slot.match!.test(`${p.name} ${p.variant ?? ""}`))
    if (matched.length > 0) cands = matched
  }
  if (cands.length === 0) return 0
  return Math.min(...cands.map((p) => p.price))
}

// Build a cohesive, style-aware list of product IDs for the room.
//
// When `budget` (in dollars) is provided, the whole look is curated to FIT
// within it: each slot may only spend what's left after reserving the minimum
// needed to still fill the remaining slots. This is what makes the buyer's
// budget the true anchor of the agentic mandate — the curated total never
// exceeds the amount they authorize the agent to spend.
export function curateProductIds(stylePrompt: string, room: RoomKind = "living", budget?: number): string[] {
  const key = detectStyleKey(stylePrompt)
  const profile = profileFor(key)
  const antiSignals = key === "neutral" ? [] : conflictingSignatures(key, ownVocabulary(profile))
  const slots = room === "bedroom" ? BEDROOM_SLOTS : LIVING_SLOTS

  const used = new Set<string>()
  const ids: string[] = []
  let spent = 0

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    let maxPrice: number | undefined
    if (budget !== undefined) {
      // Reserve the cheapest option for every slot still ahead of this one so we
      // don't spend so much here that later slots become unaffordable.
      let reserve = 0
      for (let j = i + 1; j < slots.length; j++) reserve += minSlotPrice(slots[j], used)
      maxPrice = Math.max(0, budget - spent - reserve)
    }
    const pick = pickFromCategories(slot.categories, profile, antiSignals, used, slot.match, maxPrice)
    if (pick) {
      used.add(pick.product.id)
      ids.push(pick.product.id)
      spent += pick.product.price
    }
  }

  // Backfill to the curated count from the broadest sensible pool if any slot
  // came up empty. The same scoring applies, so backfill stays on-brief, and the
  // remaining budget is respected so the total never overshoots.
  if (ids.length < CURATED_COUNT) {
    const backfillPool =
      room === "bedroom"
        ? ["Bed Linen", "Cushions", "Throws and Blankets", "Rugs and Mats", "Home Fragrance", "Homewares and Decor"]
        : ["Cushions", "Throws and Blankets", "Rugs and Mats", "Homewares and Decor", "Home Fragrance", "Tableware"]
    while (ids.length < CURATED_COUNT) {
      const remaining = budget === undefined ? undefined : Math.max(0, budget - spent)
      const pick = pickFromCategories(backfillPool, profile, antiSignals, used, undefined, remaining)
      if (!pick) break
      used.add(pick.product.id)
      ids.push(pick.product.id)
      spent += pick.product.price
    }
  }

  return ids.slice(0, CURATED_COUNT)
}

// Full, style-aware analysis used as the deterministic fallback when the AI
// stylist is unavailable, so every brief still produces a distinct edit.
export function curateAnalysis(stylePrompt: string, room: RoomKind = "living", budget?: number): RoomAnalysis {
  const key = detectStyleKey(stylePrompt)
  const profile = profileFor(key)
  const roomType = room === "bedroom" ? "Bedroom" : "Living Room"
  // Tie the gap to BOTH the room type and the requested style so it reads as a
  // tailored, theme-specific recommendation rather than a generic critique.
  const gapFragment = profile.styleGap.charAt(0).toLowerCase() + profile.styleGap.slice(1)
  const styleGap = `To bring this ${roomType.toLowerCase()} toward a ${profile.label.toLowerCase()} feel, ${gapFragment}`
  return {
    roomType,
    detectedStyle: profile.detectedStyle,
    colourPalette: profile.palette,
    styleGap,
    stylistNote: profile.stylistNote,
    recommendedProductIds: curateProductIds(stylePrompt, room, budget),
  }
}
