import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { put } from "@vercel/blob"
import { getProductById, type AdairsProduct } from "@/lib/products"

// One single image pass with all reference photos — keeps the demo fast
// and reliable instead of one slow call per product.
export const maxDuration = 120

// Image models to try, in order. Nano Banana (flash) is dramatically faster for
// compositing/edits, but a "-preview" model can be unavailable or not enabled in
// a given AI Gateway/region (a common reason generation works in the v0 sandbox
// but fails on the deployed app). We fall back to the stable pro image model so
// production keeps working even if the preview model can't be reached.
const IMAGE_MODELS = ["google/gemini-3.1-flash-image-preview", "google/gemini-3-pro-image"]

// Composite a full styled set of pieces. Speed is kept in check by the fast
// flash image model and by sending small, CDN-optimised reference photos
// (fetched in parallel) rather than full-resolution originals.
const MAX_ITEMS = 6

// Classify a furniture product into the kind that determines its real-world
// scale and where it belongs. Returns null for non-furniture (accessories).
type FurnitureKind =
  | "sofa"
  | "armchair"
  | "coffee-table"
  | "side-table"
  | "console"
  | "ottoman"
  | "bench"
  | "stool"
  | "dining"

function furnitureKind(product: AdairsProduct): FurnitureKind | null {
  if (product.category !== "Furniture") return null
  const t = `${product.name} ${product.variant ?? ""}`.toLowerCase()
  if (/\bcoffee table\b|\bc table\b|nesting|drinks table/.test(t)) return "coffee-table"
  if (/console/.test(t)) return "console"
  if (/side table|bedside/.test(t)) return "side-table"
  if (/\b(sofa|modular|settee|loveseat)\b|\blounge\b(?!\s*chair)/.test(t)) return "sofa"
  if (/dining chair|counter stool/.test(t)) return "dining"
  if (/(armchair|lounge chair|occasional chair|swivel chair|\bchair\b)/.test(t)) return "armchair"
  if (/ottoman|footstool/.test(t)) return "ottoman"
  if (/bench/.test(t)) return "bench"
  if (/stool/.test(t)) return "stool"
  return null
}

// Where a stylist would naturally place each kind of product.
function placementHint(product: AdairsProduct): string {
  const fk = furnitureKind(product)
  if (fk === "sofa")
    return "positioned as the room's MAIN sofa, REPLACING the existing sofa/couch in the same place, orientation and footprint"
  if (fk === "armchair") return "placed as an accent armchair angled beside the sofa"
  if (fk === "coffee-table")
    return "centred in front of the sofa, REPLACING the existing coffee table in the same spot"
  if (fk === "side-table" || fk === "console")
    return "beside the sofa or against a wall, replacing a similar existing table if there is one"
  if (fk === "ottoman") return "in front of the sofa or an armchair as a footrest"
  if (fk === "bench" || fk === "stool" || fk === "dining") return "placed naturally as additional seating"

  const c = `${product.category} ${product.name}`.toLowerCase()
  if (c.includes("rug") || c.includes("mat"))
    return (
      "lying flat and centred on the floor under the main furniture, REPLACING any rug or mat already on the " +
      "floor (remove the old one first) — there must only ever be ONE rug, never a rug stacked on top of another rug"
    )
  if (c.includes("cushion")) return "resting on the sofa, armchair or bed"
  if (c.includes("throw") || c.includes("blanket")) return "draped softly over the arm or back of the sofa or armchair"
  if (c.includes("quilt") || c.includes("linen") || c.includes("sheet") || c.includes("duvet") || c.includes("bed"))
    return "neatly made up on the bed"
  if (c.includes("candle") || c.includes("fragrance") || c.includes("diffuser"))
    return "standing on a coffee table, side table or shelf"
  if (c.includes("lamp")) return "standing on a side table, console or shelf as a light source"
  if (c.includes("vase") || c.includes("plant") || c.includes("pot") || c.includes("basket"))
    return "grounded on the floor, a console or a shelf as an accent"
  return "placed naturally where an interior stylist would position it"
}

// Real-world size of each product so the model scales it correctly relative to
// the room's furniture. The catalog `variant` is often a weight (e.g. "300g")
// or pack size rather than a physical dimension, so we anchor sizes here.
function scaleHint(product: AdairsProduct): string {
  const fk = furnitureKind(product)
  if (fk === "sofa")
    return "LARGE — a full-size sofa roughly 200–260 cm wide and 85 cm tall, the biggest piece of seating in the room"
  if (fk === "armchair") return "a single armchair roughly 75–95 cm wide and 80 cm tall"
  if (fk === "coffee-table")
    return "a low coffee table roughly 110–130 cm long and 40 cm tall, sitting in front of the sofa"
  if (fk === "side-table") return "a small side table roughly 40–55 cm wide and 50–60 cm tall"
  if (fk === "console") return "a console table roughly 120–150 cm wide and 75 cm tall"
  if (fk === "ottoman") return "an ottoman/footstool roughly 50–80 cm wide and 40 cm tall"
  if (fk === "bench") return "a bench seat roughly 100–140 cm wide and 45 cm tall"
  if (fk === "stool" || fk === "dining") return "a stool or chair roughly 45–55 cm wide"

  const c = `${product.category} ${product.name}`.toLowerCase()
  if (c.includes("rug") || c.includes("mat"))
    return "approx 200 x 290 cm — a large floor rug that the sofa and coffee table sit on top of"
  if (c.includes("cushion"))
    return "approx 50 x 50 cm — a standard scatter cushion, about the width of a single sofa seat cushion"
  if (c.includes("throw") || c.includes("blanket"))
    return "approx 130 x 170 cm of soft fabric — a single throw blanket, folded or draped, not covering the whole sofa"
  if (c.includes("quilt") || c.includes("linen") || c.includes("sheet") || c.includes("duvet"))
    return "queen-bed sized bedding"
  if (c.includes("candle"))
    return "SMALL — roughly 10–13 cm tall and 12 cm wide, about the size of a coffee mug. It must sit easily on a tray and be far smaller than a cushion or a tissue box"
  if (c.includes("diffuser") || c.includes("fragrance"))
    return "SMALL — a 200–300 ml bottle roughly 15–20 cm tall, about the size of a small water bottle"
  if (c.includes("lamp")) return "a table lamp roughly 40–55 cm tall"
  if (c.includes("vessel") || c.includes("bowl"))
    return "SMALL — roughly 20 cm in diameter, a decorative bowl that fits comfortably on a coffee table"
  if (c.includes("vase")) return "SMALL to medium — roughly 20–35 cm tall, a tabletop vase"
  if (c.includes("basket")) return "a floor basket roughly 35–45 cm tall"
  if (c.includes("plant") || c.includes("pot")) return "a potted plant roughly 30–60 cm tall"
  // Fall back to the catalog dimension if it looks like a real measurement.
  if (/\d+\s*x\s*\d+/i.test(product.variant) || /\bcm\b/i.test(product.variant))
    return `approx ${product.variant}`
  return "a small accent piece, kept modest in scale relative to the furniture"
}

// A concise text description used when a product's reference photo can't be
// loaded, so the model can still render the item accurately from words. The
// product name and variant already encode colour/material/style (e.g. "Leiden
// Umber Boucle Cushion").
function describeProduct(product: AdairsProduct): string {
  const variant = product.variant?.trim()
  return variant && !/^\d/.test(variant) ? `${product.name} (${variant})` : product.name
}

// Adairs sits behind Cloudflare, which BLOCKS server-to-server image requests
// coming from Vercel's datacenter IP ranges (the function works in the v0 dev
// sandbox but fails in production for exactly this reason). The wsrv.nl image
// proxy fetches the origin on our behalf from allowed IPs and resizes it, so it
// works reliably from production. This is the primary reference source.
function proxyUrl(url: string): string {
  // wsrv accepts the source without the protocol; resize + recompress for speed.
  // 768px keeps the request light but preserves enough detail for the model to
  // reproduce the item's true silhouette, legs, arms and proportions instead of
  // falling back to recolouring the existing furniture.
  const src = url.replace(/^https?:\/\//, "")
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=768&q=80&output=jpg`
}

// Direct request to Adairs' own Cloudflare image CDN. Works in the dev sandbox
// (allowed IPs) and is used as a fallback if the proxy is unavailable.
function optimisedUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.endsWith("adairs.com.au") && !u.pathname.startsWith("/cdn-cgi/")) {
      return `${u.origin}/cdn-cgi/image/width=768,quality=80,format=auto${u.pathname}${u.search}`
    }
  } catch {
    // fall through to original
  }
  return url
}

async function fetchAsDataUrl(url: string, ms: number): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    })
    if (!res.ok) return null
    const mediaType = res.headers.get("content-type") ?? "image/jpeg"
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${mediaType};base64,${buffer.toString("base64")}`
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Fetch a product's real photo as a data URL, with a hard timeout so a slow
// CDN response can never hang the whole request. Order matters:
//   1. wsrv.nl proxy — the only source reliably reachable from prod (Cloudflare
//      blocks direct datacenter requests to Adairs).
//   2. Adairs' optimised CDN — works in the dev sandbox.
//   3. Adairs original — last-resort fallback.
async function fetchReference(url: string): Promise<string | null> {
  // Race every source in parallel and take the FIRST success. This is both
  // faster and far more resilient than sequential fallbacks: if any one source
  // is reachable from the current environment, we get the photo.
  const sources = [proxyUrl(url), optimisedUrl(url), url].filter(
    (u, i, arr) => arr.indexOf(u) === i,
  )
  const attempts = sources.map((u) => fetchAsDataUrl(u, 8000))
  return new Promise<string | null>((resolve) => {
    let remaining = attempts.length
    for (const attempt of attempts) {
      attempt.then((result) => {
        if (result) resolve(result)
        else if (--remaining === 0) resolve(null)
      })
    }
  })
}

type GeneratedFile = { base64: string; mediaType?: string }

// Try each image model in turn. Returns the first generated image, or throws an
// aggregated error describing every model that failed so the real cause is
// visible instead of a generic "Visualisation failed".
async function generateRoomImage(
  content: Array<{ type: "text"; text: string } | { type: "image"; image: string }>,
): Promise<GeneratedFile> {
  const failures: string[] = []
  for (const model of IMAGE_MODELS) {
    try {
      const result = await generateText({ model, messages: [{ role: "user", content }] })
      const file = result.files?.find((f) => f.mediaType?.startsWith("image/"))
      if (file) return { base64: file.base64, mediaType: file.mediaType }
      failures.push(`${model}: returned no image`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push(`${model}: ${message}`)
    }
  }
  throw new Error(failures.join(" | "))
}

export async function POST(req: NextRequest) {
  let imageBase64 = ""
  let productIds: string[] = []

  try {
    const body = await req.json()
    imageBase64 = body.imageBase64 ?? ""
    productIds = Array.isArray(body.productIds) ? [...new Set(body.productIds as string[])] : []
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!imageBase64) {
    return NextResponse.json({ error: "Missing room image" }, { status: 400 })
  }

  // Priority for which pieces make the placement cut (we only composite
  // MAX_ITEMS for speed). Themed furniture and the rug are the highest-impact
  // pieces, so they are guaranteed in even if the list was ordered differently.
  function placementPriority(p: AdairsProduct): number {
    if (furnitureKind(p) === "sofa") return 0
    if (furnitureKind(p)) return 1 // other furniture (coffee table, etc.)
    const c = `${p.category}`.toLowerCase()
    if (c.includes("rug") || c.includes("mat")) return 2
    return 3 // accessories (cushions, throws, decor, lighting)
  }

  const products = productIds
    .map((id) => getProductById(id))
    .filter((p): p is AdairsProduct => Boolean(p))
    // Stable sort by placement priority, then keep only the top MAX_ITEMS so the
    // themed sofa, table and rug are always the ones that get rendered.
    .map((p, i) => ({ p, i }))
    .sort((a, b) => placementPriority(a.p) - placementPriority(b.p) || a.i - b.i)
    .map(({ p }) => p)
    .slice(0, MAX_ITEMS)

  if (products.length === 0) {
    return NextResponse.json({ error: "No valid products to place" }, { status: 400 })
  }

  try {
    // Pre-fetch every product's real photo (in parallel, each with a timeout)
    // so the model can reproduce the actual items rather than inventing them.
    // This is BEST-EFFORT: if some (or all) fetches fail — e.g. Vercel's
    // serverless egress can't reach the image host in production — we still
    // generate the room from rich text descriptions instead of hard-failing.
    const references = await Promise.all(products.map((p) => fetchReference(p.image)))

    // We place ALL selected products. Each may or may not have a loaded photo.
    const placeable = products.map((product, i) => ({ product, reference: references[i] }))
    const withRefs = placeable.filter(
      (x): x is { product: AdairsProduct; reference: string } => Boolean(x.reference),
    )

    // Reference images appear in the message AFTER the room photo, in the order
    // of `withRefs`. Map each product to its 1-based reference image number so
    // the prompt can point the model at the exact photo.
    const refNumberById = new Map<string, number>()
    withRefs.forEach((x, idx) => refNumberById.set(x.product.id, idx + 1))

    // Build a single prompt that lists every item.
    const itemLines = placeable
      .map(({ product }, idx) => {
        // Furniture (sofa, chairs, tables) REPLACES the room's existing
        // equivalent piece so the styled look matches the theme; accessories
        // are simply ADDED on top of the untouched room. A rug is special: it
        // is ADDED, but if a rug/mat already exists it must REPLACE it rather
        // than stack on top of it.
        const isRug = /\b(rug|mat)\b/.test(`${product.category} ${product.name}`.toLowerCase())
        const action = furnitureKind(product)
          ? "REPLACE the existing equivalent piece with"
          : isRug
            ? "ADD, but REPLACE any rug/mat already on the floor (only one rug total — never over an existing rug),"
            : "ADD"
        const refNumber = refNumberById.get(product.id)
        const appearance = refNumber
          ? `Its EXACT appearance — shape, silhouette, arms, legs, seat/back proportions, colour, ` +
            `fabric and texture — is shown in the image labelled "REFERENCE IMAGE ${refNumber}". ` +
            `Reproduce THAT item faithfully; do not copy the form of whatever is already in the room.`
          : `No reference photo is provided — render a realistic ${product.category.toLowerCase()} ` +
            `that matches this exact description: "${describeProduct(product)}".`
        return (
          `${idx + 1}. ${action} "${product.name}" (${product.category}). ` +
          `REAL SIZE: ${scaleHint(product)}. ` +
          `PLACEMENT: ${placementHint(product)}. ` +
          appearance
        )
      })
      .join("\n")

    const refNote = withRefs.length
      ? "Images are provided below, each preceded by a text label saying what it is. The first is the " +
        "customer's real room; each following image is the official Adairs product photo named in its label. " +
        "Match each item to its own labelled reference photo and reproduce that exact product.\n\n"
      : "The image provided is the customer's real room.\n\n"

    // Is a rug/mat actually being placed this run? The rug constraint is only
    // relevant when one is in the set, so we tailor the top-priority block.
    const placingRug = placeable.some(({ product }) =>
      /\b(rug|mat)\b/.test(`${product.category} ${product.name}`.toLowerCase()),
    )

    // The two constraints the user cares about most are easy for the model to
    // miss when buried in a long prompt, so we restate them FIRST, in a short,
    // unmissable block, then again in detail in the background-lock section.
    const topConstraints =
      "===== TWO HARD RULES — READ FIRST, NEVER BREAK =====\n" +
      "1. NEVER ADD A WINDOW. Do not create, draw, paint or imagine any new window, glass pane, window frame, " +
      "skylight or glass door anywhere. Every wall that is solid in the original photo MUST stay solid. The windows " +
      "in the output must be identical in number, size, shape and position to the original — add none.\n" +
      (placingRug
        ? "2. ONE RUG ONLY. If the room already has a rug or floor mat, REMOVE it and put the new rug in its place. " +
          "NEVER lay a new rug on top of, overlapping or layered over an existing rug. The final image must contain " +
          "exactly one rug.\n\n"
        : "2. DO NOT ADD A RUG. No rug is in the item list, so do not introduce any new rug or floor mat. Leave the " +
          "floor and any existing rug exactly as they are.\n\n")

    const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
      {
        type: "text",
        text:
          "You are a photorealistic interior styling tool for Adairs. Your ONLY job is to composite the listed " +
          "Adairs products into the customer's existing room photo. Treat the room photo as a FIXED, LOCKED " +
          "background that you are compositing onto — like adding layers in Photoshop, NOT regenerating the scene.\n" +
          refNote +
          topConstraints +
          `Add/place ALL of the following ${placeable.length} item(s):\n${itemLines}\n\n` +
          "===== BACKGROUND LOCK (most important — never violate) =====\n" +
          "- ABSOLUTELY NO NEW WINDOWS. Never add, draw, paint or imagine any window, glass pane, window frame, " +
          "skylight or glass door that is not already visible in the original photo. A blank/solid wall MUST stay a " +
          "blank solid wall — do not turn any wall, or any part of a wall, into a window. The number, size, shape " +
          "and position of windows in the output must be EXACTLY the same as the original photo.\n" +
          "- Keep the ENTIRE background and architecture byte-for-byte identical: walls, wall colour, paint, " +
          "windows, doors, skirting boards, floor, flooring material, ceiling, existing light fixtures, plants, " +
          "and the exact lighting, shadows, exposure, white balance and camera angle/perspective.\n" +
          "- DO NOT invent, add, hallucinate or imagine ANY architectural or fixed elements. Specifically NEVER add: " +
          "new windows, extra doorways, air-conditioning units, heaters, vents, radiators, ceiling fans, " +
          "downlights, wall art, shelving, skylights, fireplaces, columns, rugs-on-walls, or any structural feature " +
          "that is not already visible in the original photo.\n" +
          "- DO NOT remove, move, resize, recolour or redecorate any existing wall, window, door or fixture.\n" +
          "- NEVER recolour, repaint, tint, re-skin, restyle or change the material/finish of ANY existing item " +
          "in the room to match the theme. An existing coffee table, cabinet, chair or object that is NOT in the " +
          "replace list below MUST keep its EXACT original colour, wood tone, material, pattern and finish — even " +
          "if it clashes with the chosen style. For example, if the customer picks a jungle/green theme, a brown " +
          "wooden table stays brown; do NOT turn it green. The theme is expressed ONLY through the new Adairs items " +
          "you add, never by colourising what is already there.\n" +
          "- Existing items may be partially out of frame (e.g. half a coffee table at the edge). Leave such partial " +
          "items exactly as they are — same colour, same crop — do not complete, extend, recolour or replace them " +
          "unless an item in the replace list explicitly takes their place.\n" +
          "- DO NOT change the room's dimensions, proportions, or the position of the camera. No new perspective, " +
          "no zoom, no crop, no re-framing.\n" +
          "- DO NOT rotate, flip, mirror, pan or spin the room or the camera in any way. The viewpoint must stay " +
          "EXACTLY as shot: the same walls stay on the same sides, the same wall stays in the background, and the " +
          "floor/ceiling stay in the same place. The output must look like the identical photograph with items " +
          "added — never a different angle or a rotated/mirrored version of the room.\n" +
          "- Every existing item AND every newly placed item must keep the SAME orientation and facing direction " +
          "as the room's perspective. A sofa that faces the camera keeps facing the camera; do not turn, swivel or " +
          "re-angle furniture. Do not mirror or horizontally flip any item or the scene.\n" +
          "- The ONLY pixels that may change are those occupied by the listed Adairs items (and the existing " +
          "furniture piece a listed item explicitly REPLACES). Everything else must remain exactly as in the original.\n\n" +
          "===== HOW TO PLACE THE ITEMS =====\n" +
          "- Include EVERY listed item — do not skip any. Do NOT add any item that is not in the list.\n" +
          "- For items WITH a reference photo, reproduce them as a FAITHFUL copy: identical shape, colour, pattern, " +
          "texture, weave and material. Do not invent generic look-alikes. For items WITHOUT a reference photo, " +
          "render them accurately from the written description.\n" +
          "- Items marked REPLACE (sofas, armchairs, coffee/side tables) must SWAP OUT the room's existing " +
          "equivalent piece: fully REMOVE that old furniture piece (its shape, colour and material) and render the " +
          "NEW Adairs product in its place. Take ONLY the new item's APPEARANCE — its colour, fabric, material, " +
          "texture and design — from its reference photo. Take its ORIENTATION, FACING DIRECTION and CAMERA ANGLE " +
          "ENTIRELY from the existing piece it replaces, NOT from the reference photo. The reference photo is a " +
          "catalogue shot taken from its own angle; IGNORE that angle. If the existing sofa faces the camera and is " +
          "seen front-on, the new sofa must also face the camera front-on; if the existing sofa is angled or seen " +
          "from the side, match that exact same angle. NEVER rotate, turn, swivel, re-angle, mirror or flip the new " +
          "piece relative to the one it replaces — it must sit in the SAME position, the SAME orientation, the SAME " +
          "facing direction and the SAME footprint, scaled correctly, as if the old piece was simply reupholstered " +
          "into the new design without ever being moved or turned. This is a full object swap of appearance only — " +
          "do NOT merely recolour, re-texture or re-skin the existing piece, and do NOT leave the old piece behind " +
          "or add a duplicate. If the room has no matching piece, place the new item where an interior stylist " +
          "naturally would, facing the same way the room's seating faces, without altering the background.\n" +
          "- Items marked ADD (rugs, cushions, throws, decor, lighting) are layered on top of the scene. Cushions " +
          "and throws sit on the new sofa/seating.\n" +
          "- RUG RULE: there must be at most ONE rug on the floor in the final image. If the room ALREADY has a rug " +
          "or floor mat, you must REMOVE/REPLACE that existing rug with the new one in the same area — NEVER place a " +
          "new rug on top of, overlapping, or layered over an existing rug. Do not add a second rug.\n" +
          "- SCALE IS CRITICAL. Size every item to the REAL SIZE noted above, measured against the room. A sofa is " +
          "the largest seating; a coffee table is low and sits in front of it. Small decor (candles, vessels, vases, " +
          "diffusers) must look small — a candle should never be larger than a cushion and must never dominate or " +
          "exceed the size of the table it sits on. If something would look oversized, make it smaller.\n" +
          "- Place small tabletop items fully ON TOP of a surface (tray, coffee table, side table or shelf), resting " +
          "naturally with correct contact shadows — never floating or sitting on the floor unless it is a rug or basket.\n" +
          "- Give every added item realistic contact shadows consistent with the room's existing light direction, so " +
          "it sits naturally in the scene without altering the surrounding pixels.\n" +
          "Return only the edited photograph of the room with the items composited in and the original background " +
          "fully preserved.",
      },
      { type: "text", text: "THE CUSTOMER'S REAL ROOM (locked background) is the next image:" },
      { type: "image", image: imageBase64 },
      // Label each product photo immediately before it so the model maps the
      // reference to the right item by position, not by counting. This is the
      // key signal that stops it from recolouring the existing furniture
      // instead of swapping in the actual product shown.
      ...withRefs.flatMap((x, idx) => [
        {
          type: "text" as const,
          text: `REFERENCE IMAGE ${idx + 1} — the official Adairs photo of "${x.product.name}". The next image shows EXACTLY what this item looks like:`,
        },
        { type: "image" as const, image: x.reference },
      ]),
    ]

    // Generate the styled image, trying the fast model first then falling back.
    let file: GeneratedFile
    try {
      file = await generateRoomImage(content)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.log("[v0] visualise-room generation failed:", detail)
      return NextResponse.json({ error: "Image generation failed", detail }, { status: 502 })
    }

    const placedProductIds = placeable.map((x) => x.product.id)

    // Upload the generated image to Vercel Blob and return a short URL instead
    // of an inline base64 data URL. Serverless function responses are capped at
    // ~4.5 MB, and a generated image easily exceeds that — which is why this
    // works in local dev but fails in production. The Blob URL keeps the JSON
    // response tiny and reliable.
    try {
      const extension = file.mediaType?.split("/")[1]?.split("+")[0] || "png"
      const buffer = Buffer.from(file.base64, "base64")
      const blob = await put(`room-visualisations/${Date.now()}-${crypto.randomUUID()}.${extension}`, buffer, {
        access: "public",
        contentType: file.mediaType || "image/png",
      })
      return NextResponse.json({ image: blob.url, placedProductIds })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.log("[v0] visualise-room blob upload failed:", detail)
      return NextResponse.json({ error: "Could not save generated image", detail }, { status: 500 })
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.log("[v0] visualise-room error:", detail)
    return NextResponse.json({ error: "Visualisation failed", detail }, { status: 500 })
  }
}
