import { PRODUCTS } from "./products"
import type { Product } from "./types"

// Aster & Hem — contemporary Australian womenswear navigation.
export type MenuKey = "New In" | "Workwear" | "Weekend" | "Evening" | "Accessories" | "Sale"

export const NAV_MENU: MenuKey[] = ["Workwear", "Weekend", "Evening", "Accessories", "Sale"]

// Each top-level nav menu maps to one or more underlying product categories.
const CATEGORY_GROUPS: Partial<Record<MenuKey, string[]>> = {
  Workwear: ["Workwear"],
  Weekend: ["Weekend"],
  Evening: ["Evening"],
  Accessories: ["Accessories"],
}

const MENU_DESCRIPTIONS: Record<MenuKey, string> = {
  "New In": "The latest arrivals and most-loved pieces to refresh your wardrobe.",
  Workwear: "Tailored blazers, trousers, shirts and dresses for the office and beyond.",
  Weekend: "Relaxed linen, knits and casual dresses for off-duty days.",
  Evening: "Slip dresses, statement layers and occasion-ready pieces.",
  Accessories: "Shoes, bags, scarves and jewellery to complete the look.",
  Sale: "Save on contemporary womenswear across every category.",
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
      return PRODUCTS.filter((p) => p.featured)
    case "Sale":
      return PRODUCTS
    default: {
      const groups = CATEGORY_GROUPS[key] ?? []
      return PRODUCTS.filter((p) => groups.includes(p.category))
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

// The catalogue has no explicit "added" date, so we use the SKU sequence number
// (e.g. AH-085 is newer than AH-001) as a proxy for how new a product is.
function skuNumber(p: Product): number {
  const match = (p.sku ?? p.id).match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

// Returns a new sorted array; never mutates the input. Each comparator falls
// back to SKU order so results are stable across renders.
export function sortProducts(products: Product[], sort: SortKey): Product[] {
  const byId = (a: Product, b: Product) => skuNumber(a) - skuNumber(b)
  const list = [...products]
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => a.price - b.price || byId(a, b))
    case "price-desc":
      return list.sort((a, b) => b.price - a.price || byId(a, b))
    case "newest":
      return list.sort((a, b) => skuNumber(b) - skuNumber(a))
    case "popular":
    default:
      // Featured ("loved") products first, then by SKU for a stable order.
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
      ? PRODUCTS.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.variant.toLowerCase().includes(q) ||
            (p.subcategory ?? "").toLowerCase().includes(q),
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
    products: PRODUCTS.filter((p) => p.category === dest.category),
  }
}
