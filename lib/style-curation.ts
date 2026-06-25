// Deterministic, style-aware outfit curation for Aster & Hem.
//
// The AI stylist (app/api/analyse-room) is the primary path, but it can fail or
// return nothing. This module maps a free-text style brief (e.g. "minimal",
// "classic", "romantic") to a genuinely different, cohesive OUTFIT by scoring
// each catalogue piece against the chosen aesthetic. Scoring is two-tier:
//   - `signature` words are style-DEFINING (e.g. "blazer"/"tailored" = classic,
//     "floral"/"slip" = romantic). They score strongly AND act as anti-signals
//     for every OTHER style, so a signature piece of one style is actively
//     pushed OUT of a conflicting style's edit.
//   - `signals` are supporting cues (colours, fabrics) that nudge fit but are
//     shared more freely across styles.
// It is fully deterministic so the same brief always yields a coherent edit.

import { PRODUCTS, type AsterHemProduct } from "@/lib/products"
import type { RoomAnalysis } from "@/lib/types"

export type StyleKey =
  | "minimal"
  | "classic"
  | "relaxed"
  | "romantic"
  | "monochrome"
  | "earthy"
  | "neutral"

// The occasion the look is anchored to. Maps loosely to the catalogue's
// Workwear / Weekend / Evening categories. (Named RoomKind for backwards
// compatibility with the wizard's analysis pipeline.)
export type RoomKind = "work" | "weekend" | "evening"

interface StyleProfile {
  label: string
  // Words typed by the customer that select this style.
  aliases: string[]
  // Style-DEFINING words. Strong positive for this style; penalised for others.
  signature: string[]
  // Supporting cues (colours, fabrics). Soft positive, shared across styles.
  signals: string[]
  palette: string[]
  detectedStyle: string
  styleGap: string
  stylistNote: string
  // Whether this aesthetic reads best as a dress-led look rather than separates.
  dressLed?: boolean
}

const STYLE_PROFILES: Record<Exclude<StyleKey, "neutral">, StyleProfile> = {
  minimal: {
    label: "Minimalist",
    aliases: ["minimal", "minimalist", "clean", "pared back", "understated", "modern", "sleek", "scandi"],
    signature: ["minimal", "clean", "tailored", "structured", "column", "straight-leg", "crew", "merino"],
    signals: ["bone", "ivory", "white", "stone", "oatmeal", "ecru", "pearl", "sand", "natural", "champagne"],
    palette: ["#EDE7DC", "#D8CFC0", "#B7AE9F", "#2B2A26", "#FAF7F2"],
    detectedStyle: "Minimalist / Pared-back",
    styleGap:
      "lean into clean lines and a quiet bone-and-ivory palette — a tailored blazer, a column dress and one sculptural accessory keep it considered.",
    stylistNote:
      "A pared-back edit — clean tailoring, soft neutrals and quiet shapes that feel modern and effortless.",
  },
  classic: {
    label: "Classic",
    aliases: ["classic", "timeless", "tailored", "elegant", "polished", "preppy", "smart", "workwear"],
    signature: ["blazer", "tailored", "trouser", "shirt", "loafer", "trench", "pinstripe", "straight-leg"],
    signals: ["navy", "camel", "ivory", "white", "tan", "charcoal", "stone", "chalk"],
    palette: ["#1F3A5F", "#B08968", "#F4F1EA", "#2B2A26", "#FFFFFF"],
    detectedStyle: "Classic / Tailored",
    styleGap:
      "build around timeless tailoring — a navy or camel blazer, a straight-leg trouser and a crisp shirt with polished leather accents.",
    stylistNote:
      "A timeless edit — sharp tailoring in navy, camel and ivory with polished leather to finish.",
  },
  relaxed: {
    label: "Relaxed",
    aliases: ["relaxed", "casual", "weekend", "easy", "everyday", "laid back", "off duty", "coastal"],
    signature: ["knit", "linen", "denim", "relaxed", "wide-leg", "oversized", "jumper", "sneaker", "tee"],
    signals: ["sage", "oatmeal", "natural", "olive", "khaki", "denim", "stone", "sky", "ecru", "sand"],
    palette: ["#7C8A4E", "#D9CDB6", "#A7B0BE", "#5C5238", "#F1EADB"],
    detectedStyle: "Relaxed / Off-duty",
    styleGap:
      "soften it for the weekend — an easy knit, a wide-leg or denim base and a relaxed jacket in natural, earthy tones.",
    stylistNote:
      "An easy off-duty edit — soft knits, relaxed denim and natural tones for effortless weekend dressing.",
  },
  romantic: {
    label: "Romantic",
    aliases: ["romantic", "feminine", "soft", "pretty", "floral", "delicate", "date night", "evening"],
    signature: ["floral", "slip", "wrap", "silk", "satin", "ruffle", "midi", "lace", "pleated"],
    signals: ["blush", "dusty rose", "champagne", "rose gold", "pearl", "ivory", "coral", "gold", "terracotta"],
    palette: ["#E7C9C2", "#D8A7A0", "#EBD9C2", "#9C6B5E", "#FAF1EA"],
    detectedStyle: "Romantic / Feminine",
    styleGap:
      "add softness — a floral or silk slip dress, a delicate heel and gold-toned jewellery in blush and champagne tones.",
    stylistNote:
      "A soft, feminine edit — fluid silhouettes, floral and silk in blush and champagne for an elevated romantic mood.",
    dressLed: true,
  },
  monochrome: {
    label: "Monochrome",
    aliases: ["monochrome", "black", "edgy", "sleek", "noir", "city", "all black", "moody"],
    signature: ["black", "leather", "tuxedo", "blazer", "column", "sleek", "tailored"],
    signals: ["charcoal", "midnight", "slate", "silver", "onyx", "graphite", "navy"],
    palette: ["#111111", "#2B2B2B", "#4A4A4A", "#8C8C8C", "#E5E2DD"],
    detectedStyle: "Monochrome / City",
    styleGap:
      "go tonal in black and charcoal — a sharp blazer or column dress with sleek leather accessories for a confident city look.",
    stylistNote:
      "A sharp tonal edit — black, charcoal and sleek leather for a confident, city-ready look.",
  },
  earthy: {
    label: "Earthy Warmth",
    aliases: ["earthy", "warm", "autumn", "terracotta", "spice", "rust", "boho", "natural"],
    signature: ["terracotta", "rust", "caramel", "chocolate", "suede", "knit", "wrap", "tan"],
    signals: ["olive", "camel", "sand", "khaki", "forest", "gold", "oatmeal", "natural"],
    palette: ["#B5651D", "#C97B63", "#7C8A4E", "#5C4A33", "#EDE3D2"],
    detectedStyle: "Earthy / Warm",
    styleGap:
      "warm it up — terracotta, rust and caramel tones in a wrap dress or knit, finished with tan leather and gold.",
    stylistNote:
      "A warm, earthy edit — terracotta, rust and caramel with tan leather for a rich, grounded palette.",
  },
}

// Short, customer-facing taglines for each selectable aesthetic.
const STYLE_DESCRIPTIONS: Record<Exclude<StyleKey, "neutral">, string> = {
  minimal: "Clean lines, soft neutrals & quiet shapes",
  classic: "Timeless tailoring in navy, camel & ivory",
  relaxed: "Easy knits, relaxed denim & natural tones",
  romantic: "Soft silhouettes, florals & silk in blush",
  monochrome: "Black, charcoal & sleek leather",
  earthy: "Terracotta, rust & caramel warmth",
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
  { label: "Up to $600", value: 600 },
  { label: "Up to $1,000", value: 1000 },
  { label: "Up to $1,500", value: 1500 },
  { label: "No budget limit", value: null },
]

export interface StyleOption {
  key: Exclude<StyleKey, "neutral">
  label: string
  description: string
  // Rich phrase fed into the analysis pipeline as the style brief. It contains
  // the aesthetic name so detectStyleKey() resolves it, and descriptive cues so
  // the AI stylist gets strong signal.
  prompt: string
  palette: string[]
}

// The selectable aesthetics shown to the customer (one per defined profile).
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
  signals: ["natural", "linen", "knit", "ivory", "stone", "bone", "white", "camel", "oatmeal", "sand"],
  palette: ["#B08968", "#E8DDD0", "#2C2925", "#8B7355", "#F5F0EB"],
  detectedStyle: "Contemporary Neutral",
  styleGap:
    "layer in elevated neutrals — a tailored piece, an easy base and one considered accessory to pull the look together.",
  stylistNote:
    "A versatile neutral edit — elevated basics and soft earthy tones that work season after season.",
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

function hasWord(text: string, word: string): boolean {
  return wordMatcher(word).test(text)
}

// All the searchable text for a product — name, colour, subcategory and the
// editorial description carry the strongest style signal.
function productText(product: AsterHemProduct): string {
  return `${product.name} ${product.colour ?? product.variant ?? ""} ${product.subcategory ?? ""} ${
    product.description ?? ""
  }`.toLowerCase()
}

// Score a product's fit for a style. Positive = on-brief; negative = it reads as
// a different (conflicting) style and should be kept out of this edit.
function scoreProduct(product: AsterHemProduct, profile: StyleProfile, antiSignals: string[]): number {
  const text = productText(product)
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

// A slot in the outfit, matched by garment SUBCATEGORY so every look has a
// complete head-to-toe shape (a layer, a base, shoes, a bag and an accessory).
interface CurationSlot {
  subcategories: string[]
}

// Garment-type slots that compose a complete look. Two shapes:
//   - SEPARATES: a layer, a top, a bottom, shoes, a bag, an accessory.
//   - DRESS_LED: a dress as the hero, plus a layer, shoes, a bag and jewellery.
const LAYER = ["Blazers & Jackets", "Outerwear"]
const TOP = ["Tops & Shirts", "Casual Tops & Knits", "Tops"]
const BOTTOM = ["Trousers & Skirts", "Pants & Shorts"]
const DRESS = ["Dresses", "Casual Dresses", "Jumpsuits & Sets"]
const SHOES = ["Shoes"]
const BAG = ["Bags"]
const JEWELLERY = ["Jewellery"]
const EXTRA = ["Scarves & Belts", "Jewellery"]

const SEPARATES_SLOTS: CurationSlot[] = [
  { subcategories: LAYER },
  { subcategories: TOP },
  { subcategories: BOTTOM },
  { subcategories: SHOES },
  { subcategories: BAG },
  { subcategories: EXTRA },
]

const DRESS_SLOTS: CurationSlot[] = [
  { subcategories: DRESS },
  { subcategories: LAYER },
  { subcategories: SHOES },
  { subcategories: BAG },
  { subcategories: JEWELLERY },
  { subcategories: EXTRA },
]

const CURATED_COUNT = 6

interface ScoredPick {
  product: AsterHemProduct
  score: number
}

const ROTATION_TOLERANCE = 2
const MIN_ROTATION_POOL = 5
const MAX_WEIGHT_RATIO = 3

function weightedRandomPick(pool: ScoredPick[]): ScoredPick {
  const minScore = Math.min(...pool.map((x) => x.score))
  const weights = pool.map((x) => 1 + Math.min(x.score - minScore, MAX_WEIGHT_RATIO - 1))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// Pick a well-fitting product from any of the given subcategories that hasn't
// been used yet, choosing from a pool of the strongest on-theme candidates with
// weighted randomness so picks stay on-brief while rotating variety.
function pickFromSubcategories(
  subcategories: string[],
  profile: StyleProfile,
  antiSignals: string[],
  used: Set<string>,
  maxPrice?: number,
): ScoredPick | undefined {
  const candidates = PRODUCTS.filter(
    (p) =>
      subcategories.includes(p.subcategory ?? "") &&
      !used.has(p.id) &&
      (maxPrice === undefined || p.price <= maxPrice),
  )
  if (candidates.length === 0) return undefined

  const scored: ScoredPick[] = candidates
    .map((product) => ({ product, score: scoreProduct(product, profile, antiSignals) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (a.product.featured !== b.product.featured) return a.product.featured ? -1 : 1
      return a.product.id.localeCompare(b.product.id)
    })

  const bestScore = scored[0].score
  const floor = bestScore > 0 ? Math.max(1, bestScore - ROTATION_TOLERANCE) : bestScore
  let pool = scored.filter((x) => x.score >= floor)
  if (pool.length < MIN_ROTATION_POOL) {
    const acceptable = bestScore > 0 ? scored.filter((x) => x.score >= 0) : scored
    pool = acceptable.slice(0, Math.max(MIN_ROTATION_POOL, pool.length))
  }
  return weightedRandomPick(pool)
}

// Cheapest still-available product across a slot's subcategories. Used to
// RESERVE a minimum spend for the slots we haven't filled yet, so a budget
// isn't blown entirely on the hero piece.
function minSlotPrice(slot: CurationSlot, used: Set<string>): number {
  const cands = PRODUCTS.filter(
    (p) => slot.subcategories.includes(p.subcategory ?? "") && !used.has(p.id),
  )
  if (cands.length === 0) return 0
  return Math.min(...cands.map((p) => p.price))
}

function slotsFor(profile: StyleProfile, occasion: RoomKind): CurationSlot[] {
  if (profile.dressLed || occasion === "evening") return DRESS_SLOTS
  return SEPARATES_SLOTS
}

// Build a cohesive, style-aware list of product IDs for one complete look.
//
// When `budget` (in dollars) is provided, the whole look is curated to FIT
// within it: each slot may only spend what's left after reserving the minimum
// needed to still fill the remaining slots. This makes the buyer's budget the
// true anchor of the agentic mandate — the curated total never exceeds it.
export function curateProductIds(stylePrompt: string, occasion: RoomKind = "work", budget?: number): string[] {
  const key = detectStyleKey(stylePrompt)
  const profile = profileFor(key)
  const antiSignals = key === "neutral" ? [] : conflictingSignatures(key, ownVocabulary(profile))
  const slots = slotsFor(profile, occasion)

  const used = new Set<string>()
  const ids: string[] = []
  let spent = 0

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    let maxPrice: number | undefined
    if (budget !== undefined) {
      let reserve = 0
      for (let j = i + 1; j < slots.length; j++) reserve += minSlotPrice(slots[j], used)
      maxPrice = Math.max(0, budget - spent - reserve)
    }
    const pick = pickFromSubcategories(slot.subcategories, profile, antiSignals, used, maxPrice)
    if (pick) {
      used.add(pick.product.id)
      ids.push(pick.product.id)
      spent += pick.product.price
    }
  }

  // Backfill to the curated count from the broadest sensible pool if any slot
  // came up empty, staying on-brief and within the remaining budget.
  if (ids.length < CURATED_COUNT) {
    const backfillPool = [...TOP, ...BOTTOM, ...DRESS, ...SHOES, ...BAG, ...EXTRA, ...LAYER]
    while (ids.length < CURATED_COUNT) {
      const remaining = budget === undefined ? undefined : Math.max(0, budget - spent)
      const pick = pickFromSubcategories(backfillPool, profile, antiSignals, used, remaining)
      if (!pick) break
      used.add(pick.product.id)
      ids.push(pick.product.id)
      spent += pick.product.price
    }
  }

  return ids.slice(0, CURATED_COUNT)
}

const OCCASION_LABEL: Record<RoomKind, string> = {
  work: "Workwear Edit",
  weekend: "Weekend Edit",
  evening: "Evening Edit",
}

// Full, style-aware analysis used as the deterministic fallback when the AI
// stylist is unavailable, so every brief still produces a distinct edit.
export function curateAnalysis(stylePrompt: string, occasion: RoomKind = "work", budget?: number): RoomAnalysis {
  const key = detectStyleKey(stylePrompt)
  const profile = profileFor(key)
  const roomType = OCCASION_LABEL[occasion]
  const styleGap = `To bring your look toward a ${profile.label.toLowerCase()} feel, ${profile.styleGap}`
  return {
    roomType,
    detectedStyle: profile.detectedStyle,
    colourPalette: profile.palette,
    styleGap,
    stylistNote: profile.stylistNote,
    recommendedProductIds: curateProductIds(stylePrompt, occasion, budget),
  }
}
