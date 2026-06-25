// Shared helpers for product image URLs.
//
// Aster & Hem's product CDN (www.adairs.com.au / Scene7) uses hotlink protection, so
// images requested directly from the browser can fail. We route them through a
// same-origin proxy (/api/image-proxy) that adds the right Referer/User-Agent
// server-side. These helpers normalise raw URLs and build the proxy URL, and
// are shared by the ACP feed, the ProductImage component, and the debug route.

// Hostnames we allow the proxy to fetch from. Anything else is rejected so the
// proxy can't be used as an open relay.
export const ALLOWED_IMAGE_HOSTS = [
  "adairs.com.au",
  "www.adairs.com.au",
  "cdn.adairs.com.au",
  "images.adairs.com.au",
] as const

// Returns true for an allowed host, including any *.scene7.com subdomain.
export function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === "scene7.com" || host.endsWith(".scene7.com")) return true
  return ALLOWED_IMAGE_HOSTS.includes(host as (typeof ALLOWED_IMAGE_HOSTS)[number])
}

// Normalise a raw image value from the product catalogue into an absolute URL.
// - null / undefined / empty  -> null (frontend shows a placeholder)
// - protocol-relative "//..." -> prefixed with https:
// - relative "/path"          -> prefixed with the Aster & Hem origin
// - already absolute          -> returned as-is
export function cleanImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (value === "") return null
  if (value.startsWith("//")) return `https:${value}`
  if (value.startsWith("/")) return `https://www.adairs.com.au${value}`
  return value
}

// Build a proxy URL for an image. Returns null when the input is empty so
// callers can render a placeholder instead.
//
// Images route through our own /api/image-proxy, which caches each image into
// Vercel Blob and redirects to the Blob CDN copy. This is reliable in
// production (Aster & Hem blocks Vercel's datacenter IPs, so a direct fetch 502s;
// the proxy populates the cache via wsrv.nl, which IS reachable). See
// app/api/image-proxy/route.ts for the full rationale.
export function proxiedImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (value === "") return null
  // Local/static assets (placeholders, /home/*.png) are served as-is, never
  // sent through the proxy.
  if (value.startsWith("/") && !value.startsWith("//")) return value

  const clean = cleanImageUrl(value)
  if (!clean) return null

  return `/api/image-proxy?url=${encodeURIComponent(clean)}`
}

// Build a fully-EXTERNAL image URL for consumers that cannot send auth headers
// and must not receive any of our secrets — specifically the ChatGPT Custom
// GPT, which embeds image URLs verbatim in its replies and fetches them with no
// headers.
//
// We use wsrv.nl, a free public image CDN. It fetches the Aster & Hem origin
// server-side (from allowed IPs) and serves the result from its own domain, so:
//   - it is NOT behind this project's Vercel Deployment Protection, so the
//     image loads even while the site itself requires Vercel authentication;
//   - it contains NO bypass token or secret, so nothing sensitive is exposed in
//     ChatGPT's visible responses.
export function externalImageUrl(raw: string | null | undefined): string | null {
  const clean = cleanImageUrl(raw)
  if (!clean) return null
  // Local/static assets have no public absolute origin to hand to wsrv.
  if (clean.startsWith("/")) return null
  const src = clean.replace(/^https?:\/\//, "")
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=1000&q=82&output=webp`
}
