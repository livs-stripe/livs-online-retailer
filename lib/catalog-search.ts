// =============================================================================
// Catalog search — powers the Stylist chat agent's `searchCatalog` tool.
// =============================================================================
// Self-contained, deterministic, server-safe search over the Adairs catalogue.
// It maps a free-text shopping query (e.g. "boho cushion for a friend") plus
// optional filters (category, price range) to a small set of genuinely relevant
// products the agent can recommend and the buyer can purchase in-chat.

import { ADAIRS_PRODUCTS, type AdairsProduct } from "@/lib/products"

// The canonical categories in the catalogue (kept in sync via fuzzy matching).
const CATEGORIES = Array.from(new Set(ADAIRS_PRODUCTS.map((p) => p.category)))

// Expand common interior-style words into the concrete colour/material/motif
// vocabulary that actually appears in product names, so a query like "boho"
// surfaces rust/jute/tassel pieces rather than nothing.
const STYLE_SYNONYMS: Record<string, string[]> = {
  boho: ["rust", "mustard", "ochre", "terracotta", "tassel", "fringe", "jute", "rattan", "woven", "natural", "sage"],
  bohemian: ["rust", "mustard", "ochre", "terracotta", "tassel", "fringe", "jute", "rattan", "woven", "natural"],
  coastal: ["blue", "white", "sand", "seafoam", "mint", "teal", "natural", "stripe", "sorrento", "capri"],
  beach: ["blue", "white", "sand", "natural", "stripe"],
  mediterranean: ["blue", "white", "terracotta", "olive", "gold", "stripe", "amalfi", "santorini", "sorrento"],
  scandi: ["white", "cream", "ivory", "boucle", "oak", "natural", "stone", "grey", "pale"],
  scandinavian: ["white", "cream", "ivory", "boucle", "oak", "natural", "stone", "grey"],
  minimal: ["white", "cream", "stone", "natural", "boucle", "grey"],
  modern: ["black", "charcoal", "slate", "grey", "stone", "matte", "graphite"],
  contemporary: ["charcoal", "slate", "grey", "stone", "black"],
  hamptons: ["navy", "white", "stripe", "blue", "ivory", "cream", "gold"],
  classic: ["navy", "white", "stripe", "ivory", "cream"],
  farmhouse: ["jute", "natural", "wool", "oak", "linen", "beige", "washed", "gingham", "wicker"],
  rustic: ["jute", "natural", "wool", "oak", "linen", "beige", "washed", "timber"],
  country: ["gingham", "washed", "linen", "natural", "wicker"],
  japandi: ["bamboo", "oak", "natural", "stone", "boucle", "linen", "undyed", "ash"],
  zen: ["bamboo", "natural", "stone", "linen"],
  luxe: ["velvet", "fur", "chenille", "marble", "brass", "gold", "satin", "plush"],
  glam: ["velvet", "gold", "marble", "brass", "satin"],
  luxury: ["velvet", "fur", "marble", "brass", "gold", "plush"],
  tropical: ["palm", "monstera", "fern", "green", "forest", "leaf", "ivy", "tropic"],
  green: ["green", "forest", "ivy", "sage", "olive"],
  neutral: ["natural", "linen", "boucle", "cream", "stone", "sesame", "white", "oak", "beige", "umber"],
  warm: ["rust", "caramel", "umber", "terracotta", "mustard", "tan", "spice"],
  earthy: ["rust", "caramel", "umber", "terracotta", "olive", "sage", "tan", "natural"],
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
  products: AdairsProduct[]
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
  // Common synonyms → category.
  const map: Record<string, string> = {
    cushion: "Cushions",
    pillow: "Cushions",
    throw: "Throws and Blankets",
    blanket: "Throws and Blankets",
    rug: "Rugs and Mats",
    mat: "Rugs and Mats",
    bedding: "Bed Linen",
    sheet: "Bed Linen",
    quilt: "Bed Linen",
    duvet: "Bed Linen",
    linen: "Bed Linen",
    towel: "Towels and Bath",
    bath: "Towels and Bath",
    lamp: "Lighting",
    light: "Lighting",
    candle: "Home Fragrance",
    diffuser: "Home Fragrance",
    fragrance: "Home Fragrance",
    decor: "Homewares and Decor",
    vase: "Homewares and Decor",
    table: "Furniture",
    sofa: "Furniture",
    chair: "Furniture",
    bed: "Beds and Bedheads",
    plate: "Tableware",
    bowl: "Tableware",
    outdoor: "Outdoor",
    kids: "Kids Bedding and Decor",
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
 * Search the Adairs catalogue for products matching a free-text query and
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
    const text = `${product.name} ${product.variant ?? ""} ${product.category}`.toLowerCase()
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
