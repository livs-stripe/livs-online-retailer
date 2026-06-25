// =============================================================================
// Catalog search — powers the Stylist chat agent's `searchCatalog` tool.
// =============================================================================
// Self-contained, deterministic, server-safe search over the Aster & Hem catalogue.
// It maps a free-text shopping query (e.g. "boho cushion for a friend") plus
// optional filters (category, price range) to a small set of genuinely relevant
// products the agent can recommend and the buyer can purchase in-chat.

import { ADAIRS_PRODUCTS, type AsterHemProduct } from "@/lib/products"

// The canonical categories in the catalogue (kept in sync via fuzzy matching).
const CATEGORIES = Array.from(new Set(ADAIRS_PRODUCTS.map((p) => p.category)))

// Expand common fashion-style words into the concrete colour/fabric/garment
// vocabulary that actually appears in product names and descriptions, so a query
// like "minimal" surfaces clean bone/ivory tailoring rather than nothing.
const STYLE_SYNONYMS: Record<string, string[]> = {
  minimal: ["bone", "ivory", "white", "stone", "oatmeal", "ecru", "tailored", "clean", "column", "crew"],
  minimalist: ["bone", "ivory", "white", "stone", "oatmeal", "ecru", "tailored", "clean", "column"],
  classic: ["navy", "camel", "ivory", "blazer", "tailored", "trouser", "shirt", "trench", "loafer"],
  timeless: ["navy", "camel", "ivory", "tailored", "blazer", "trouser"],
  tailored: ["blazer", "trouser", "tailored", "navy", "charcoal", "shirt"],
  workwear: ["blazer", "trouser", "shirt", "tailored", "navy", "charcoal", "loafer"],
  relaxed: ["knit", "linen", "denim", "sage", "oatmeal", "wide-leg", "oversized", "natural", "khaki"],
  casual: ["knit", "linen", "denim", "tee", "relaxed", "natural", "sneaker"],
  weekend: ["knit", "linen", "denim", "casual", "relaxed", "sage", "natural"],
  romantic: ["floral", "slip", "wrap", "silk", "satin", "blush", "champagne", "midi", "dusty rose", "coral"],
  feminine: ["floral", "silk", "slip", "blush", "wrap", "midi", "champagne"],
  evening: ["slip", "silk", "satin", "midnight", "black", "champagne", "gold", "heel"],
  occasion: ["dress", "slip", "silk", "champagne", "heel", "midi"],
  monochrome: ["black", "charcoal", "midnight", "slate", "leather", "sleek", "tuxedo"],
  edgy: ["black", "leather", "charcoal", "midnight", "sleek"],
  earthy: ["terracotta", "rust", "caramel", "chocolate", "tan", "olive", "camel", "suede"],
  warm: ["terracotta", "rust", "caramel", "camel", "tan", "gold"],
  neutral: ["bone", "ivory", "stone", "oatmeal", "camel", "natural", "sand", "ecru", "white"],
}

// Words that carry no search signal — dropped before scoring.
const STOPWORDS = new Set([
  "a", "an", "the", "for", "to", "of", "and", "or", "in", "on", "with", "my", "me", "i", "want", "need",
  "buy", "get", "gift", "present", "friend", "who", "likes", "like", "loves", "love", "some", "something",
  "looking", "find", "show", "please", "thanks", "would", "like", "is", "are", "that", "this", "she", "he",
  "her", "his", "them", "their", "really", "very", "nice", "good", "great", "new", "home", "room", "style",
  "styled", "vibe", "feel", "under", "around", "about",
])

export interface CatalogSearchParams {
  query: string
  category?: string
  maxPrice?: number
  minPrice?: number
  limit?: number
}

export interface CatalogSearchResult {
  products: AsterHemProduct[]
  count: number
  matchedCategory: string | null
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
}

// Resolve a loose category string ("cushions", "throw", "rug") to a real
// catalogue category, or null when nothing matches.
function resolveCategory(input?: string): string | null {
  if (!input) return null
  const q = normalize(input).trim()
  if (!q) return null
  // Exact-ish match first.
  const exact = CATEGORIES.find((c) => normalize(c) === q)
  if (exact) return exact
  // Singular/partial containment either direction.
  const partial = CATEGORIES.find((c) => {
    const cn = normalize(c)
    return cn.includes(q) || q.includes(cn) || cn.includes(q.replace(/s$/, ""))
  })
  if (partial) return partial
  // Common synonyms → occasion category. Garment-type queries (a dress, a
  // blazer) are intentionally NOT forced into a category here, since those span
  // multiple occasions — keyword scoring handles them. Only map words that
  // clearly imply one of the four real categories.
  const map: Record<string, string> = {
    work: "Workwear",
    office: "Workwear",
    professional: "Workwear",
    business: "Workwear",
    weekend: "Weekend",
    casual: "Weekend",
    "off-duty": "Weekend",
    everyday: "Weekend",
    evening: "Evening",
    occasion: "Evening",
    party: "Evening",
    cocktail: "Evening",
    formal: "Evening",
    wedding: "Evening",
    accessory: "Accessories",
    accessories: "Accessories",
    shoe: "Accessories",
    shoes: "Accessories",
    heel: "Accessories",
    bag: "Accessories",
    tote: "Accessories",
    clutch: "Accessories",
    jewellery: "Accessories",
    jewelry: "Accessories",
    scarf: "Accessories",
    belt: "Accessories",
  }
  for (const [k, v] of Object.entries(map)) {
    if (q.includes(k)) return v
  }
  return null
}

// Build the weighted set of search tokens from the query, expanding any style
// words into their concrete product-name vocabulary.
function buildTokens(query: string): { word: string; weight: number }[] {
  const raw = normalize(query)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))

  const tokens = new Map<string, number>()
  for (const w of raw) {
    tokens.set(w, Math.max(tokens.get(w) ?? 0, 2))
    const syns = STYLE_SYNONYMS[w]
    if (syns) {
      for (const s of syns) tokens.set(s, Math.max(tokens.get(s) ?? 0, 1))
    }
  }
  return Array.from(tokens, ([word, weight]) => ({ word, weight }))
}

function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(haystack)
}

/**
 * Search the Aster & Hem catalogue for products matching a free-text query and
 * optional filters. Deterministic and dependency-free so it can run inside an
 * AI tool call on the server.
 */
export function searchCatalog(params: CatalogSearchParams): CatalogSearchResult {
  const limit = Math.min(Math.max(params.limit ?? 6, 1), 10)
  const matchedCategory = resolveCategory(params.category)
  const tokens = buildTokens(params.query ?? "")

  let pool = ADAIRS_PRODUCTS.filter((p) => {
    if (matchedCategory && p.category !== matchedCategory) return false
    if (params.maxPrice !== undefined && p.price > params.maxPrice) return false
    if (params.minPrice !== undefined && p.price < params.minPrice) return false
    return true
  })

  // If a category filter wiped out everything (e.g. price too low), relax price.
  if (pool.length === 0 && matchedCategory) {
    pool = ADAIRS_PRODUCTS.filter((p) => p.category === matchedCategory)
  }

  const scored = pool.map((product) => {
    const text = `${product.name} ${product.colour ?? product.variant ?? ""} ${product.category} ${
      product.subcategory ?? ""
    } ${product.description ?? ""}`.toLowerCase()
    let score = 0
    for (const { word, weight } of tokens) {
      if (hasWord(text, word)) score += weight
    }
    return { product, score }
  })

  const anyMatch = scored.some((s) => s.score > 0)

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.product.featured !== b.product.featured) return a.product.featured ? -1 : 1
    return a.product.price - b.product.price
  })

  // When the query produced no keyword matches at all but a category was
  // resolved, fall back to the best-known (featured, then cheapest) items in
  // that category so the agent always has something relevant to show.
  const top = (anyMatch ? scored.filter((s) => s.score > 0) : scored).slice(0, limit)

  return {
    products: top.map((s) => s.product),
    count: top.length,
    matchedCategory,
  }
}
