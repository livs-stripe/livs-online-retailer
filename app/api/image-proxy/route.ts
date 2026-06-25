import { createHash } from "node:crypto"
import { head, put } from "@vercel/blob"
import { isAllowedImageHost } from "@/lib/image-url"

// Production-robust product image proxy.
//
// THE PROBLEM: Adairs' image CDN sits behind Cloudflare, which BLOCKS
// server-to-server requests from Vercel's datacenter IP ranges. A direct
// server-side fetch therefore works in the v0 dev sandbox (allowed IP) but
// returns 502 in production. Loading wsrv.nl directly from the browser works,
// but relies on a free third-party CDN being up and fast for every page view.
//
// THE FIX: cache each image into Vercel Blob (served from Vercel's own CDN) and
// redirect to it.
//   1. First request for an image: fetch the bytes via wsrv.nl (reachable from
//      datacenter IPs), store them in Blob, then 307-redirect to the Blob URL.
//   2. Every later request: a cheap Blob `head()` finds the cached copy and we
//      redirect straight to it — no third-party hop at all.
//   3. If Blob is unavailable for any reason, we still redirect to wsrv.nl so
//      images never break.
// The redirect itself is tiny and cacheable, so the heavy bytes are always
// served by a CDN, never streamed through this function.

export const runtime = "nodejs"

// wsrv.nl fetches the origin on our behalf from allowed IPs and recompresses to
// a consistent, lightweight webp. Used both as the server-side cache source and
// as the last-resort browser fallback.
function wsrvUrl(absoluteUrl: string): string {
  const src = absoluteUrl.replace(/^https?:\/\//, "")
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=1000&q=82&output=webp`
}

// Stable Blob key for a given source image, so the same product image is only
// ever cached once.
function blobPathname(absoluteUrl: string): string {
  const hash = createHash("sha256").update(absoluteUrl).digest("hex").slice(0, 32)
  return `product-images/${hash}.webp`
}

function redirect(url: string, cacheSeconds: number): Response {
  return new Response(null, {
    status: 307,
    headers: {
      Location: url,
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get("url")

  if (!raw) {
    return new Response("Missing url parameter", { status: 400 })
  }

  let target: URL
  try {
    target = new URL(decodeURIComponent(raw))
  } catch {
    return new Response("Invalid url parameter", { status: 400 })
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new Response("Unsupported protocol", { status: 400 })
  }

  if (!isAllowedImageHost(target.hostname)) {
    return new Response("Host not allowed", { status: 403 })
  }

  const absolute = target.toString()
  const fallback = wsrvUrl(absolute)

  // No Blob token available (shouldn't happen in this project, but be safe):
  // just send the browser to wsrv.nl directly.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return redirect(fallback, 86400)
  }

  const pathname = blobPathname(absolute)

  // 1. Already cached? Redirect straight to the Blob CDN copy.
  try {
    const existing = await head(pathname)
    if (existing?.url) return redirect(existing.url, 31536000)
  } catch {
    // Not cached yet (BlobNotFoundError) — fall through to populate it.
  }

  // 2. Populate the cache: fetch via wsrv (allowed from datacenter IPs), then
    //    store in Blob.
  try {
    const upstream = await fetch(fallback, {
      headers: { Accept: "image/webp,image/*,*/*;q=0.8" },
      cache: "no-store",
    })

    const contentType = upstream.headers.get("content-type") ?? ""
    if (!upstream.ok || !contentType.startsWith("image/")) {
      // Couldn't fetch bytes to cache — let the browser try wsrv directly.
      return redirect(fallback, 3600)
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    const blob = await put(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/webp",
      cacheControlMaxAge: 31536000,
    })
    return redirect(blob.url, 31536000)
  } catch {
    // Anything went wrong caching — still show the image via wsrv.
    return redirect(fallback, 3600)
  }
}
