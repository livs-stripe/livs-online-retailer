import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import sharp from "sharp"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { getProductById, type AsterHemProduct } from "@/lib/products"

// One single image pass with all reference photos — keeps the demo fast
// and reliable instead of one slow call per product.
export const maxDuration = 120

// Image models to try, in order. Nano Banana (flash) is dramatically faster for
// edits, but a "-preview" model can be unavailable in a given AI Gateway/region.
// We fall back to the stable pro image model so generation keeps working.
const IMAGE_MODELS = ["google/gemini-3.1-flash-image-preview", "google/gemini-3-pro-image"]

// Number of garments/accessories we style onto the person in one pass.
const MAX_ITEMS = 6

// Where each kind of piece sits on the body — gives the model concrete guidance
// so the outfit reads as a coordinated, head-to-toe look.
function placementHint(product: AsterHemProduct): string {
  const sub = (product.subcategory ?? "").toLowerCase()
  const name = product.name.toLowerCase()
  if (sub.includes("blazer") || sub.includes("outerwear") || /coat|jacket|trench/.test(name))
    return "worn as the outer layer over the rest of the outfit"
  if (sub.includes("dress") || sub.includes("jumpsuit") || /dress|jumpsuit/.test(name))
    return "worn as the main one-piece of the outfit"
  if (sub.includes("tops") || sub.includes("knit") || /shirt|top|knit|blouse|tee/.test(name))
    return "worn on the upper body as the top"
  if (sub.includes("trousers") || sub.includes("pants") || sub.includes("skirt") || /trouser|pant|skirt|short/.test(name))
    return "worn on the lower body as the bottom"
  if (sub.includes("shoes") || /heel|flat|boot|sneaker|loafer|mule|sandal/.test(name))
    return "worn on the feet"
  if (sub.includes("bags") || /bag|tote|clutch/.test(name))
    return "carried or worn over the shoulder/arm"
  if (sub.includes("jewellery") || /earring|necklace|bracelet/.test(name))
    return "worn as jewellery"
  if (sub.includes("scarves") || sub.includes("belts") || /scarf|belt/.test(name))
    return "worn as a finishing accessory"
  return "styled naturally as part of the outfit"
}

function describeProduct(product: AsterHemProduct): string {
  return `${product.name} in ${product.colour ?? product.variant ?? ""}`.trim()
}

type GeneratedFile = { base64: string; mediaType?: string }

// Load a product's local image (public/images/products/<sku>.jpg) as a data URL
// so the model can reproduce the actual garment's colour, fabric and silhouette.
async function loadReference(product: AsterHemProduct): Promise<string | null> {
  try {
    // product.image is like "/images/products/AH-001.jpg"
    const rel = product.image.replace(/^\//, "")
    const filePath = path.join(process.cwd(), "public", rel)
    const buffer = await readFile(filePath)
    // Recompress small for a light prompt payload.
    const jpg = await sharp(buffer).resize(640, 853, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer()
    return `data:image/jpeg;base64,${jpg.toString("base64")}`
  } catch (err) {
    console.log("[v0] visualise: could not load reference for", product.id, err)
    return null
  }
}

// Try each image model in turn. Returns the first generated image, or throws an
// aggregated error describing every model that failed.
async function generateLookImage(
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
    return NextResponse.json({ error: "Missing photo" }, { status: 400 })
  }

  const products = productIds
    .map((id) => getProductById(id))
    .filter((p): p is AsterHemProduct => Boolean(p))
    .slice(0, MAX_ITEMS)

  if (products.length === 0) {
    return NextResponse.json({ error: "No valid products to style" }, { status: 400 })
  }

  try {
    // Load every product's local photo in parallel so the model can reproduce
    // the actual garments rather than inventing them.
    const references = await Promise.all(products.map((p) => loadReference(p)))
    const placeable = products.map((product, i) => ({ product, reference: references[i] }))
    const withRefs = placeable.filter(
      (x): x is { product: AsterHemProduct; reference: string } => Boolean(x.reference),
    )

    const refNumberById = new Map<string, number>()
    withRefs.forEach((x, idx) => refNumberById.set(x.product.id, idx + 1))

    const itemLines = placeable
      .map(({ product }, idx) => {
        const refNumber = refNumberById.get(product.id)
        const appearance = refNumber
          ? `Its EXACT appearance — colour, fabric, texture, pattern, cut and silhouette — is shown in ` +
            `"REFERENCE IMAGE ${refNumber}". Reproduce THAT garment faithfully.`
          : `No reference photo is provided — render it accurately from this description: "${describeProduct(product)}".`
        return `${idx + 1}. ${product.name} (${product.colour ?? product.variant}) — ${placementHint(product)}. ${appearance}`
      })
      .join("\n")

    const content: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
      {
        type: "text",
        text:
          "You are a photorealistic fashion styling tool for Aster & Hem. Your job is to dress the PERSON in the " +
          "customer's photo in the listed Aster & Hem outfit, producing a realistic full-look try-on.\n\n" +
          "===== HARD RULES — NEVER BREAK =====\n" +
          "1. KEEP THE PERSON'S IDENTITY. Preserve their exact face, skin tone, hair, body shape, proportions and " +
          "pose. Do not beautify, slim, age, change ethnicity, or alter their face in any way.\n" +
          "2. KEEP THE BACKGROUND. Preserve the original background, setting, lighting, shadows, exposure, white " +
          "balance and camera angle. Do not change the scene.\n" +
          "3. ONLY change the person's CLOTHING and accessories — replace whatever outfit they are currently wearing " +
          "with the listed Aster & Hem pieces. If the photo shows an outfit/wardrobe rather than a person, render a " +
          "realistic model wearing the full look against a clean, softly-lit studio background instead.\n\n" +
          `Dress the person in ALL of the following ${placeable.length} piece(s) as ONE coordinated outfit:\n${itemLines}\n\n` +
          "===== HOW TO STYLE =====\n" +
          "- Reproduce each garment as a FAITHFUL copy of its reference photo: identical colour, fabric, texture, " +
          "pattern and cut. Do not invent generic look-alikes.\n" +
          "- Fit each piece naturally to the person's body with realistic drape, folds, seams and contact shadows.\n" +
          "- Layer correctly: tops under jackets/blazers; bottoms below tops; shoes on the feet; bag carried " +
          "naturally; jewellery and accessories placed where they belong.\n" +
          "- The final image must look like a single, professionally-styled fashion photograph of this person " +
          "wearing the complete Aster & Hem look.\n" +
          "Return only the edited photograph.",
      },
      { type: "text", text: "THE CUSTOMER'S PHOTO (keep the person and background) is the next image:" },
      { type: "image", image: imageBase64 },
      ...withRefs.flatMap((x, idx) => [
        {
          type: "text" as const,
          text: `REFERENCE IMAGE ${idx + 1} — the official Aster & Hem photo of "${x.product.name}". The next image shows EXACTLY what this piece looks like:`,
        },
        { type: "image" as const, image: x.reference },
      ]),
    ]

    let file: GeneratedFile
    try {
      file = await generateLookImage(content)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.log("[v0] visualise-room generation failed:", detail)
      return NextResponse.json({ error: "Image generation failed", detail }, { status: 502 })
    }

    const placedProductIds = placeable.map((x) => x.product.id)

    // Downscale + recompress the generated image so the JSON response stays well
    // under the serverless ~4.5 MB cap, then return it as a data URL. This avoids
    // any dependency on Blob storage for the demo.
    try {
      const buffer = Buffer.from(file.base64, "base64")
      const jpg = await sharp(buffer).resize(1024, 1536, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer()
      const dataUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`
      return NextResponse.json({ image: dataUrl, placedProductIds })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.log("[v0] visualise-room post-processing failed:", detail)
      // Fall back to returning the raw generated image.
      const mediaType = file.mediaType || "image/png"
      return NextResponse.json({ image: `data:${mediaType};base64,${file.base64}`, placedProductIds })
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.log("[v0] visualise-room error:", detail)
    return NextResponse.json({ error: "Visualisation failed", detail }, { status: 500 })
  }
}
