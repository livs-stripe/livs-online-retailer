import { ADAIRS_PRODUCTS } from "./products"
import type { Product } from "./types"

export type MenuKey = "Clearance" | "New In" | "Bedroom" | "Bathroom" | "Living" | "Kids" | "Furniture" | "Sale"

export const NAV_MENU: MenuKey[] = [
  "Clearance",
  "New In",
  "Bedroom",
  "Bathroom",
  "Living",
  "Kids",
  "Furniture",
  "Sale",
]

// Each nav menu maps to one or more underlying product categories
const CATEGORY_GROUPS: Partial<Record<MenuKey, string[]>> = {
  Bedroom: ["Bed Linen", "Throws and Blankets", "Beds and Bedheads"],
  Bathroom: ["Towels and Bath"],
  Living: ["Cushions", "Rugs and Mats", "Throws and Blankets", "Home Fragrance", "Lighting", "Homewares and Decor", "Tableware"],
  Kids: ["Kids Bedding and Decor"],
  Furniture: ["Furniture", "Beds and Bedheads", "Outdoor"],
}

const MENU_DESCRIPTIONS: Record<MenuKey, string> = {
  Clearance: "Final reductions across the range — while stocks last.",
  "New In": "The latest arrivals and most-loved pieces to refresh your space.",
  Bedroom: "Bed linen, quilt covers, throws and bedheads to layer your bedroom.",
  Bathroom: "Plush towels, bath mats and everything to elevate your bathroom.",
  Living: "Cushions, rugs, lighting and decor to style every living space.",
  Kids: "Bedding, decor and playful pieces for kids' rooms.",
  Furniture: "Sofas, tables, bedheads and statement pieces for every room.",
  Sale: "Save up to 50% on homewares across every category.",
}

export type ShopDestination =
  | { type: "menu"; key: MenuKey }
  | { type: "category"; category: string; title: string; description?: string }
  | { type: "search"; query: string }

export interface ShopView {
  title: string
  description: string
  products: Product[]
}

function getProductsForMenu(key: MenuKey): Product[] {
  switch (key) {
    case "New In":
      return ADAIRS_PRODUCTS.filter((p) => p.featured)
    case "Sale":
      return ADAIRS_PRODUCTS
    case "Clearance":
      return [...ADAIRS_PRODUCTS].sort((a, b) => a.price - b.price).slice(0, 120)
    default: {
      const groups = CATEGORY_GROUPS[key] ?? []
      return ADAIRS_PRODUCTS.filter((p) => groups.includes(p.category))
    }
  }
}

// Sorting ------------------------------------------------------------------

export type SortKey = "popular" | "price-asc" | "price-desc" | "newest"

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "popular", label: "Most popular" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest arrivals" },
]

export const DEFAULT_SORT: SortKey = "popular"

// The catalog has no explicit "added" date, but product image paths embed the
// shoot year (e.g. ".../2026_images/..."). We use that as a proxy for how new a
// product is. Older catalog images without a year fall back to 0.
function productYear(p: Product): number {
  const match = p.image.match(/\/(\d{4})_images\//)
  return match ? Number(match[1]) : 0
}

// Returns a new sorted array; never mutates the input. Each comparator falls
// back to id order so results are stable across renders.
export function sortProducts(products: Product[], sort: SortKey): Product[] {
  const byId = (a: Product, b: Product) => Number(a.id) - Number(b.id)
  const list = [...products]
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.price - b.price || byId(a, b))
    case "price-desc":
      return list.sort((a, b) => b.price - a.price || byId(a, b))
    case "newest":
      return list.sort((a, b) => productYear(b) - productYear(a) || Number(b.id) - Number(a.id))
    case "popular":
    default:
      // Featured ("loved") products first, then by id for a stable order.
      return list.sort((a, b) => Number(b.featured) - Number(a.featured) || byId(a, b))
  }
}

export function resolveShop(dest: ShopDestination): ShopView {
  if (dest.type === "menu") {
    return {
      title: dest.key,
      description: MENU_DESCRIPTIONS[dest.key],
      products: getProductsForMenu(dest.key),
    }
  }
  if (dest.type === "search") {
    const q = dest.query.trim().toLowerCase()
    const products = q
      ? ADAIRS_PRODUCTS.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.variant.toLowerCase().includes(q),
        )
      : []
    return {
      title: `Search results for “${dest.query.trim()}”`,
      description: products.length
        ? `${products.length} ${products.length === 1 ? "product" : "products"} matching your search.`
        : "No products matched your search — try a different term.",
      products,
    }
  }
  return {
    title: dest.title,
    description: dest.description ?? `Shop our ${dest.title.toLowerCase()} collection.`,
    products: ADAIRS_PRODUCTS.filter((p) => p.category === dest.category),
  }
}
