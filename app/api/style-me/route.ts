import OpenAI, { toFile } from 'openai'
import { PRODUCTS } from '@/lib/products'
import { NextRequest } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File
    const userPrompt = formData.get('prompt') as string

    if (!imageFile || !userPrompt) {
      return Response.json({ error: 'Image and prompt required' }, { status: 400 })
    }

    const userBuffer = await imageFile.arrayBuffer()
    const userBase64 = Buffer.from(userBuffer).toString('base64')

    const matchRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You match user requests to Aster & Hem products.
Return ONLY raw JSON — no markdown, no explanation:
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
)}`,
        },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 80,
    })

    let matched: { sku: string; name: string; colour: string; price: number }
    try {
      matched = JSON.parse(matchRes.choices[0].message.content ?? '{}')
    } catch {
      return Response.json({ error: 'Could not identify a product from that request' }, { status: 400 })
    }

    const product = PRODUCTS.find(p => p.sku === matched.sku)
    if (!product) {
      return Response.json({ error: 'Product not found in inventory' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const garmentRes = await fetch(`${baseUrl}${product.image}`)

    if (!garmentRes.ok) {
      console.error(`[style-me] Garment image fetch failed: ${baseUrl}${product.image} → ${garmentRes.status}`)
      return Response.json(
        { error: `Could not load product image for ${product.sku}` },
        { status: 500 }
      )
    }

    const garmentBuffer = await garmentRes.arrayBuffer()

    const personFile = await toFile(
      Buffer.from(userBase64, 'base64'),
      'person.png',
      { type: 'image/png' }
    )

    const garmentFile = await toFile(
      Buffer.from(garmentBuffer),
      'garment.png',
      { type: 'image/png' }
    )

    const editResponse = await openai.images.edit({
      model: 'gpt-image-1',
      image: [personFile, garmentFile],
      prompt: `Virtual clothing try-on.
The first image shows a person. The second image shows a garment: ${product.name} in ${product.colour}.
Place the garment from the second image onto the person in the first image.
Preserve exactly: the person's face, hair colour and style, skin tone, body position, pose, and background.
Change only: the clothing — replace what they are currently wearing with the ${product.name}.
The result must look like a natural, photorealistic photograph of the same person wearing the new garment.
Do not alter their face, identity, or any non-clothing part of the image.`,
      n: 1,
      size: '1024x1536',
    })

    const imageData = editResponse.data[0]
    const tryOnImageUrl =
      imageData.url ??
      (imageData.b64_json
        ? `data:image/png;base64,${imageData.b64_json}`
        : null)

    if (!tryOnImageUrl) {
      return Response.json({ error: 'OpenAI returned no image' }, { status: 500 })
    }

    const captionRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are Hem, the AI stylist for Aster & Hem — a contemporary Australian
womenswear brand. You've just shown the user a virtual try-on of a specific product.
Write exactly 1–2 sentences: warm, direct, specific to this item.
Tell her how to wear it or why it works for her. Sound like a stylist, not a product description.
Do not describe what's visible in the image.`,
        },
        {
          role: 'user',
          content: `Product: ${product.name} in ${product.colour} (A$${product.price}).
Category: ${product.category} / ${product.subcategory}.
User's request was: "${userPrompt}"`,
        },
      ],
      max_tokens: 80,
    })

    const caption =
      captionRes.choices[0].message.content ??
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
