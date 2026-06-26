import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { PRODUCTS } from '@/lib/products'
import { NextRequest } from 'next/server'

export const maxDuration = 60

const gateway = createOpenAI({
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.VERCEL_OIDC_TOKEN ?? '',
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File
    const userPrompt = formData.get('prompt') as string

    if (!imageFile || !userPrompt) {
      return Response.json({ error: 'Image and prompt required' }, { status: 400 })
    }

    const userBuffer = Buffer.from(await imageFile.arrayBuffer())
    const userBase64 = userBuffer.toString('base64')
    const userMime = imageFile.type || 'image/jpeg'

    const matchRes = await generateText({
      model: gateway('openai/gpt-4o-mini'),
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
      matched = JSON.parse(matchRes.text.trim())
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
      console.error(`[style-me] Garment fetch failed: ${baseUrl}${product.image} → ${garmentRes.status}`)
      return Response.json({ error: `Could not load product image for ${product.sku}` }, { status: 500 })
    }

    const garmentBase64 = Buffer.from(await garmentRes.arrayBuffer()).toString('base64')

    const geminiResult = await generateText({
      model: gateway('google/gemini-3.1-flash-image-preview'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Virtual clothing try-on.

Image 1 (first image): the person
Image 2 (second image): the garment — ${product.name} in ${product.colour}

Generate a photorealistic image of the SAME person from Image 1 wearing the garment from Image 2.

Rules:
- Preserve EXACTLY: face, hair, skin tone, body pose, background, lighting
- Change ONLY: the clothing
- Result must look like a natural photograph, not a composited image
- Do not alter the person's identity or any non-clothing element`,
            },
            {
              type: 'image',
              image: userBuffer,
              mimeType: userMime as 'image/jpeg' | 'image/png' | 'image/webp',
            },
            {
              type: 'image',
              image: Buffer.from(garmentBase64, 'base64'),
              mimeType: 'image/jpeg',
            },
          ],
        },
      ],
      providerOptions: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
        openai: {
          responseModalities: ['text', 'image'],
        },
      },
    })

    let tryOnImageUrl: string | null = null

    if ((geminiResult as any).files?.length) {
      const imgFile = (geminiResult as any).files.find((f: any) => f.mimeType?.startsWith('image/'))
      if (imgFile?.base64) {
        tryOnImageUrl = `data:${imgFile.mimeType};base64,${imgFile.base64}`
      }
    }

    if (!tryOnImageUrl) {
      for (const part of (geminiResult as any).content ?? []) {
        if (
          (part.type === 'file' || part.type === 'image') &&
          'data' in part &&
          typeof part.data === 'string'
        ) {
          const mime = ('mediaType' in part ? part.mediaType : 'image/png') ?? 'image/png'
          tryOnImageUrl = `data:${mime};base64,${part.data}`
          break
        }
      }
    }

    if (!tryOnImageUrl) {
      console.error('[style-me] No image in Gemini response. Content:', JSON.stringify((geminiResult as any).content?.slice(0, 2)))
      console.error('[style-me] Files:', JSON.stringify((geminiResult as any).files))
      return Response.json({
        error: 'Gemini returned no image. The model may not support image generation through this gateway configuration.'
      }, { status: 500 })
    }

    const captionRes = await generateText({
      model: gateway('openai/gpt-4o-mini'),
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
