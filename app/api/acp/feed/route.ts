import type { NextRequest } from "next/server"
import { PRODUCTS } from "@/lib/products"
import { TOTAL_PRODUCTS, jsonCors, preflight, toAcpProduct } from "@/lib/acp"

// GET /api/acp/feed — paginated, searchable product feed for ChatGPT.
// With 855 products we NEVER return the whole catalogue: results are always
// keyword/category filtered and paginated.

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 12

export function OPTIONS() {
  return preflight()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") || "").trim()
  const category = (searchParams.get("category") || "").trim()

  // Clamp pagination params to safe ranges.
  const limitRaw = Number.parseInt(searchParams.get("limit") || "", 10)
  const offsetRaw = Number.parseInt(searchParams.get("offset") || "", 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : DEFAULT_LIMIT
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

  const ql = q.toLowerCase()
  const cl = category.toLowerCase()

  let filtered = PRODUCTS
  if (q) {
    filtered = filtered.filter((p) => {
      const haystack = `${p.name} ${p.variant} ${p.category}`.toLowerCase()
      return haystack.includes(ql)
    })
  }
  if (category) {
    filtered = filtered.filter((p) => p.category.toLowerCase() === cl)
  }

  const totalResults = filtered.length
  const page = filtered.slice(offset, offset + limit)
  const nextOffset = offset + limit
  const hasMore = nextOffset < totalResults

  return jsonCors({
    seller: {
      name: "Aster & Hem",
      description: "Premium Australian home and linen brand",
      currency: "usd",
      total_products: TOTAL_PRODUCTS,
    },
    query: { q: q || null, category: category || null, limit, offset },
    total_results: totalResults,
    products: page.map(toAcpProduct),
    pagination: {
      offset,
      limit,
      total_results: totalResults,
      has_more: hasMore,
      next_offset: hasMore ? nextOffset : null,
    },
  })
}
