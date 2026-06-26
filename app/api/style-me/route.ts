import { generateText, generateImage } from 'ai'
import { PRODUCTS } from '@/lib/products'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File
    const userPrompt = formData.get('prompt') as string

    if (!imageFile || !userPrompt) {
      return Response.json({ error: 'Image and prompt required' }, { status: 400 })
    }

    const userBuffer = Buffer.from(await imageFile.arrayBuffer())
    const userMime = imageFile.type || 'image/jpeg'

    // Step 1: Match the user's request to an inventory item
    const matchRes = await generateText({
      model: "openai/gpt-4o-mini",
      prompt: `Match this request to an Aster & Hem product.
Return ONLY raw JSON, no markdown:
{ "sku": "AH-XXX", "name": "...", "colour": "...", "price": 000 }

Inventory:
${JSON.stringify(
  PRODUCTS.map(p => ({
    sku: p.sku,
    name: p.name,
    colour: p.colour,
    category: p.category,
    subcategory: p.subcategory,
  }))
)}

Request: "${userPrompt}"`,
      maxTokens: 80,
    })

    let matched: { sku: string; name: string; colour: string; price: number }
    try {
      let raw = matchRes.text.trim()
      // Strip markdown fences if present
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenceMatch) raw = fenceMatch[1].trim()
      matched = JSON.parse(raw)
    } catch {
      console.error('[style-me] Match response not valid JSON:', matchRes.text)
      return Response.json({ error: 'Could not identify a product from that request', raw: matchRes.text }, { status: 400 })
    }

    const product = PRODUCTS.find(p => p.sku === matched.sku)
    if (!product) {
      return Response.json({ error: 'Product not found in inventory' }, { status: 404 })
    }

    // Step 2: Read the garment product image from filesystem (avoids circular fetch on Vercel)
    let garmentBuffer: Buffer
    try {
      const imagePath = join(process.cwd(), 'public', product.image)
      garmentBuffer = readFileSync(imagePath)
    } catch (fsErr) {
      console.error(`[style-me] Could not read product image: public${product.image}`, fsErr)
      return Response.json({ error: `Could not load product image for ${product.sku}` }, { status: 500 })
    }

    // Step 3: Virtual try-on using gpt-image-1 via AI SDK (routed through Vercel AI Gateway)
    const imageResult = await generateImage({
      model: "openai/gpt-image-1",
      prompt: {
        images: [userBuffer, garmentBuffer],
        text: `Virtual clothing try-on. The first image is a person. The second image is a garment: ${product.name} in ${product.colour}.

Generate a photorealistic image of the SAME person from the first image wearing the garment from the second image.

Rules:
- Preserve EXACTLY: face, hair, skin tone, body pose, background, lighting
- Change ONLY: the clothing to show them wearing the garment
- Result must look like a natural photograph, not a composite
- Do not alter the person's identity or any non-clothing element`,
      },
      size: '1024x1024',
    })

    const tryOnImageUrl = `data:image/png;base64,${imageResult.image.base64}`

    // Step 4: Generate a stylist caption
    const captionRes = await generateText({
      model: "openai/gpt-4o-mini",
      prompt: `You are Hem, AI stylist for Aster & Hem — contemporary Australian womenswear.
The customer just saw a virtual try-on of: ${product.name} in ${product.colour} (A$${product.price}).
Category: ${product.category}.
Their request: "${userPrompt}"

Write exactly 1–2 warm sentences: specific to this product, how to style it or why it works.
Sound like a stylist, not a product description. No more than 2 sentences.`,
      maxTokens: 80,
    })

    const caption = captionRes.text.trim() ||
      `That's the ${product.name} in ${product.colour} — A$${product.price}.`

    return Response.json({
      tryOnImage: tryOnImageUrl,
      caption,
      product: {
        sku: product.sku,
        name: product.name,
        colour: product.colour,
        price: product.price,
        image: product.image,
        sizes: product.sizes,
        description: product.description,
      },
    })

  } catch (error: unknown) {
    console.error('[style-me] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown server error'
    return Response.json({ error: message }, { status: 500 })
  }
}
