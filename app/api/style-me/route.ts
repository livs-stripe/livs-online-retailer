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
Return ONLY the SKU code (e.g. AH-001). Nothing else.

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
      maxTokens: 20,
    })

    const skuMatch = matchRes.text.trim().match(/AH-\d{3}/)
    if (!skuMatch) {
      console.error('[style-me] Could not extract SKU from:', matchRes.text)
      return Response.json({ error: 'Could not identify a product from that request' }, { status: 400 })
    }

    const product = PRODUCTS.find(p => p.sku === skuMatch[0])
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

    // Step 3: Virtual try-on using gpt-image-1 via AI SDK
    let tryOnImageUrl: string
    try {
      const imageResult = await generateImage({
        model: "openai/gpt-image-1",
        prompt: {
          images: [userBuffer, garmentBuffer],
          text: `Virtual clothing try-on — EDIT the first image ONLY by changing the clothing.

The first image is the person. The second image is the garment to put on them: ${product.name} in ${product.colour}.

CRITICAL — DO NOT change the person in any way:
- The person's face, facial features, expression, skin tone, hair colour, hair style, body shape, and pose MUST remain IDENTICAL to the first image
- The background, lighting, and composition MUST remain IDENTICAL to the first image
- You are ONLY allowed to edit/replace the clothing on the person's body with the garment shown in the second image
- Think of this as inpainting ONLY the clothing region — everything else is frozen
- The output should look like the exact same photo with only the outfit changed
- Do NOT regenerate or reimagine the person — keep every pixel outside the clothing area unchanged`,
        },
        size: '1024x1024',
      })
      tryOnImageUrl = `data:image/png;base64,${imageResult.image.base64}`
    } catch (imgErr: unknown) {
      const msg = imgErr instanceof Error ? imgErr.message : String(imgErr)
      console.error('[style-me] Image generation failed:', msg)
      return Response.json({ error: `Image generation failed: ${msg}` }, { status: 500 })
    }

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
