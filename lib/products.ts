// Aster & Hem Product Catalogue
// Contemporary Australian womenswear — elevated basics and polished workwear.
// 100-item demo inventory. Product images live at /public/images/products/<SKU>.jpg
//
// NOTE: The export is still named ADAIRS_PRODUCTS / AsterHemProduct for backwards
// compatibility with the many modules that import it. The data is now the
// Aster & Hem catalogue.

import inventory from "./aster-hem-inventory.json"

export interface AsterHemProduct {
  id: string
  sku: string
  name: string
  variant: string
  colour: string
  category: string
  subcategory: string
  price: number
  url: string
  image: string
  featured: boolean
  sizes: string[]
  description: string
}

interface InventoryItem {
  sku: string
  name: string
  colour: string
  price: number
  category: string
  subcategory: string
  description: string
  sizes: string[]
}

// A curated set of hero pieces surfaced in "New In" and on the homepage.
const FEATURED_SKUS = new Set<string>([
  "AH-001",
  "AH-002",
  "AH-003",
  "AH-004",
  "AH-005",
  "AH-007",
  "AH-010",
  "AH-011",
  "AH-018",
  "AH-027",
  "AH-041",
  "AH-053",
  "AH-059",
  "AH-064",
  "AH-066",
  "AH-072",
  "AH-085",
])

export const ADAIRS_PRODUCTS: AsterHemProduct[] = (inventory as InventoryItem[]).map((item) => ({
  id: item.sku,
  sku: item.sku,
  name: item.name,
  variant: item.colour,
  colour: item.colour,
  category: item.category,
  subcategory: item.subcategory,
  price: item.price,
  url: `#${item.sku}`,
  image: `/images/products/${item.sku}.jpg`,
  featured: FEATURED_SKUS.has(item.sku),
  sizes: item.sizes,
  description: item.description,
}))

// Convenience lookup by SKU/id — used by the stylist agent's vision feature and
// in-chat product cards.
export const PRODUCTS_BY_SKU: Record<string, AsterHemProduct> = Object.fromEntries(
  ADAIRS_PRODUCTS.map((p) => [p.id, p]),
)

export function getProductBySku(sku: string): AsterHemProduct | undefined {
  return PRODUCTS_BY_SKU[sku]
}

// Lookup a single product by id (id === sku in this catalogue).
export function getProductById(id: string): AsterHemProduct | undefined {
  return PRODUCTS_BY_SKU[id]
}

// All unique top-level categories (Workwear, Weekend, Evening, Accessories).
export const getCategories = (): string[] => [...new Set(ADAIRS_PRODUCTS.map((p) => p.category))]

// Filter by category.
export const getByCategory = (cat: string): AsterHemProduct[] =>
  ADAIRS_PRODUCTS.filter((p) => p.category === cat)

// Featured / "new in" hero pieces.
export const getFeatured = (): AsterHemProduct[] => ADAIRS_PRODUCTS.filter((p) => p.featured)

// Search by name, colour or category.
export const searchProducts = (q: string): AsterHemProduct[] => {
  const term = q.toLowerCase()
  return ADAIRS_PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      p.colour.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term),
  )
}

// Deterministic demo "on sale" flag. The catalogue has no real sale data, so we
// mark a stable ~1-in-3 subset of products as on sale based on the numeric part
// of their SKU (e.g. "AH-003"). This drives the tiered The Edit Club member
// discount (10% off full price, 5% off sale items) and the "Sale" badge.
export function isOnSale(product: Pick<AsterHemProduct, "id">): boolean {
  const n = Number.parseInt(String(product.id).replace(/\D/g, ""), 10)
  if (Number.isNaN(n)) return false
  return n % 3 === 0
}

// Builds compact, Stripe-metadata-safe summaries of an order's line items so a
// purchase can later be read back at the product level (e.g. by Hem to
// recommend complementary pieces). Both fields are capped to Stripe's 500-char
// metadata value limit.
export function summarizeCartItems(cartItems: { productId: string; quantity: number }[]): {
  items: string
  categories: string
} {
  const names: string[] = []
  const categories = new Set<string>()
  for (const item of cartItems) {
    const product = getProductById(item.productId)
    if (!product) continue
    names.push(item.quantity > 1 ? `${product.name} x${item.quantity}` : product.name)
    categories.add(product.category)
  }
  return {
    items: names.join(" | ").slice(0, 500),
    categories: Array.from(categories).join(", ").slice(0, 500),
  }
}

// Shared type alias used across components.
export type Product = AsterHemProduct
