import { experimental_generateImage as generateImage } from "ai"
import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"

// Reads the full inventory and generates a clean, editorial fashion product
// image for every SKU via the Vercel AI Gateway (OpenAI image model).
// Saves to public/images/products/<SKU>.png

const OUT_DIR = path.join(process.cwd(), "public", "images", "products")
const MODEL = process.env.IMAGE_MODEL || "openai/gpt-image-1"

const INVENTORY = JSON.parse(process.env.INVENTORY_JSON || "[]")

function buildPrompt(p) {
  return `Professional fashion product photography for a contemporary Australian womenswear brand.
Product: ${p.name} in ${p.colour}.
Category: ${p.category} / ${p.subcategory}.
Shot flat-lay or on a minimal invisible mannequin against a pure white seamless background.
Soft directional studio lighting, no harsh shadows, no reflections.
Full product clearly visible, centred in frame.
Style reference: Witchery Australia, Country Road, Seed Heritage — premium but accessible.
Clean, minimal, editorial. No text, no logos, no watermarks, no human models.`
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true })

  const onlyMissing = process.env.ONLY_MISSING === "1"
  const targets = INVENTORY.filter((p) => {
    if (!onlyMissing) return true
    return !existsSync(path.join(OUT_DIR, `${p.sku}.jpg`))
  })

  console.log(`[gen] model=${MODEL} total=${INVENTORY.length} toGenerate=${targets.length}`)

  const CONCURRENCY = Number(process.env.CONCURRENCY || 5)
  let done = 0
  let failed = []

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (p) => {
        const dest = path.join(OUT_DIR, `${p.sku}.jpg`)
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { image } = await generateImage({
              model: MODEL,
              prompt: buildPrompt(p),
              size: "1024x1536",
              providerOptions: { openai: { quality: process.env.QUALITY || "medium" } },
            })
            const jpg = await sharp(Buffer.from(image.uint8Array))
              .resize(900, 1200, { fit: "cover" })
              .jpeg({ quality: 82, mozjpeg: true })
              .toBuffer()
            await writeFile(dest, jpg)
            done++
            console.log(`[gen] ok ${p.sku} (${done}/${targets.length})`)
            return
          } catch (err) {
            console.log(`[gen] fail ${p.sku} attempt ${attempt}: ${err?.message || err}`)
            if (attempt === 3) failed.push(p.sku)
            else await new Promise((r) => setTimeout(r, 2000 * attempt))
          }
        }
      }),
    )
  }

  console.log(`[gen] COMPLETE done=${done} failed=${failed.length} ${failed.join(",")}`)
  if (failed.length) process.exitCode = 1
}

run()
