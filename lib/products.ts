// Aster & Hem Product Catalogue
// Contemporary Australian womenswear — elevated basics and polished workwear.
// 100-item demo inventory. Product images live at /public/images/products/<SKU>.jpg
//
// NOTE: The export is still named ADAIRS_PRODUCTS / AdairsProduct for backwards
// compatibility with the many modules that import it. The data is now the
// Aster & Hem catalogue.

import inventory from "./aster-hem-inventory.json"

export interface AdairsProduct {
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

export const ADAIRS_PRODUCTS: AdairsProduct[] = (inventory as InventoryItem[]).map((item) => ({
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
export const PRODUCTS_BY_SKU: Record<string, AdairsProduct> = Object.fromEntries(
  ADAIRS_PRODUCTS.map((p) => [p.id, p]),
)

export function getProductBySku(sku: string): AdairsProduct | undefined {
  return PRODUCTS_BY_SKU[sku]
}
