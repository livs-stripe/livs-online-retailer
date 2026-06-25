import { NextResponse } from "next/server"
import { ADAIRS_PRODUCTS, type AsterHemProduct } from "@/lib/products"
import { externalImageUrl } from "@/lib/image-url"

// =============================================================================
// Agentic Commerce Protocol (ACP) — shared helpers
// =============================================================================
// These power the /api/acp/* routes that a ChatGPT Custom GPT calls as Actions.
// They are intentionally self-contained so they never touch existing pages,
// components, or the in-app Stripe checkout flow.

// CORS so ChatGPT (and the GPT builder preview) can call the endpoints.
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

// Standard CORS preflight response shared by every ACP route.
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

// JSON response with CORS headers attached.
export function jsonCors(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

// Structured error envelope used by all ACP routes.
export function acpError(code: string, message: string, status: number): NextResponse {
  return jsonCors({ error: true, code, message }, status)
}

// Prices in the catalogue are stored in dollars (e.g. 69.99). ACP responses
// expose both an integer cents value (for math/Stripe) and a display string.
export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// The catalogue has no description field, so synthesise a useful one-liner from
// the structured attributes we do have. Keeps the agent's responses readable.
export function productDescription(p: AsterHemProduct): string {
  const variant = p.variant && p.variant.trim() ? `${p.variant} · ` : ""
  return `${p.name} — ${variant}${p.category} from Aster & Hem, a premium Australian home and linen brand.`
}

// Public, ACP-shaped view of a catalogue product.
export interface AcpProduct {
  id: string
  name: string
  description: string
  price_cents: number
  price_display: string
  category: string
  availability: "in_stock"
  // Fully-external, public image URLs (null when the product has no image).
  // They point at the wsrv.nl CDN — NOT this deployment — so a ChatGPT Custom
  // GPT can render them with no auth headers and without being affected by
  // Vercel Deployment Protection, and so no bypass secret is ever exposed in
  // ChatGPT's visible replies. See externalImageUrl() for the full rationale.
  image_url: string | null
  image_proxy_url: string | null
}

export function toAcpProduct(p: AsterHemProduct): AcpProduct {
  const cents = toCents(p.price)
  const img = externalImageUrl(p.image)
  return {
    id: p.id,
    name: p.variant && p.variant.trim() ? `${p.name} (${p.variant})` : p.name,
    description: productDescription(p),
    price_cents: cents,
    price_display: formatUsd(cents),
    category: p.category,
    availability: "in_stock",
    image_url: img,
    image_proxy_url: img,
  }
}

// Total catalogue size, computed (never hardcoded).
export const TOTAL_PRODUCTS = ADAIRS_PRODUCTS.length

// The public base URL used in the OpenAPI server block. Falls back to the
// Vercel-provided production/deployment URL so the spec never ships a dead
// placeholder host.
export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return "https://your-app.vercel.app"
}
