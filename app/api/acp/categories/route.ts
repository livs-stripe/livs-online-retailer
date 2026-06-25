import { getCategories } from "@/lib/products"
import { jsonCors, preflight } from "@/lib/acp"

// GET /api/acp/categories — the unique category list so ChatGPT knows what it
// can filter the feed by.

export function OPTIONS() {
  return preflight()
}

export async function GET() {
  return jsonCors({ categories: getCategories() })
}
