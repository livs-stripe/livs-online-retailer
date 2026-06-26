import Replicate from 'replicate'
import OpenAI from 'openai'
import { PRODUCTS } from '@/lib/products'
import { NextRequest } from 'next/server'

export const maxDuration = 60

function getGarmentCategory(sku: string): 'tops' | 'bottoms' | 'one-pieces' {
  const product = PRODUCTS.find(p => p.sku === sku)
  if (!product) return 'tops'

  const sub = product.subcategory.toLowerCase()
  const name = product.name.toLowerCase()

  if (
    sub.includes('dress') ||
    sub.includes('jumpsuit') ||
    sub.includes('co-ord') ||
    name.includes('dress') ||
    name.includes('jumpsuit') ||
    name.includes('gown') ||
    name.includes('maxi')
  ) return 'one-pieces'

  if (
    sub.includes('trouser') ||
    sub.includes('skirt') ||
    sub.includes('pant') ||
    sub.includes('short') ||
    sub.includes('denim') ||
    name.includes('trouser') ||
    name.includes('skirt') ||
    name.includes('pant') ||
    name.includes('short') ||
    name.includes('culotte') ||
    name.includes('flare') ||
    name.includes('cigarette') ||
    name.includes('cargo')
  ) return 'bottoms'

  return 'tops'
}

export async function POST(req: NextRequest) {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const formData = await req.formData()
  const imageFile = formData.get('image') as File
  const userPrompt = formData.get('prompt') as string

  if (!imageFile || !userPrompt) {
    return Response.json({ error: 'Image and prompt required' }, { status: 400 })
  }

  const userImageBuffer = await imageFile.arrayBuffer()
  const userImageBase64 = Buffer.from(userImageBuffer).toString('base64')
  const userImageDataUri = `data:${imageFile.type};base64,${userImageBase64}`

  const productMatchResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are identifying which product from the Aster & Hem inventory the user wants to try on. Match their request to the most relevant product.
If they name a specific product, return that exact product.
If the request is general (e.g. "style me for work"), pick the most contextually appropriate item from the Workwear category.

Return ONLY raw JSON, no markdown:
{"sku":"AH-XXX","name":"full product name","colour":"colour","price":000}

Inventory: ${JSON.stringify(PRODUCTS.map(p => ({
  sku: p.sku, name: p.name, colour: p.colour,
  category: p.category, subcategory: p.subcategory, price: p.price
})))}`
      },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 100
  })

  let targetProduct: { sku: string; name: string; colour: string; price: number }
  try {
    targetProduct = JSON.parse(productMatchResponse.choices[0].message.content ?? '{}')
  } catch {
    return Response.json({ error: 'Could not identify product' }, { status: 400 })
  }

  const fullProduct = PRODUCTS.find(p => p.sku === targetProduct.sku)
  if (!fullProduct) {
    return Response.json({ error: 'Product not found' }, { status: 404 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const garmentImagePath = `${baseUrl}${fullProduct.image}`
  const garmentImageResponse = await fetch(garmentImagePath)
  if (!garmentImageResponse.ok) {
    return Response.json({ error: 'Could not load garment image' }, { status: 500 })
  }
  const garmentImageBuffer = await garmentImageResponse.arrayBuffer()
  const garmentImageBase64 = Buffer.from(garmentImageBuffer).toString('base64')
  const garmentImageDataUri = `data:image/jpeg;base64,${garmentImageBase64}`

  const garmentCategory = getGarmentCategory(fullProduct.sku)

  let tryOnImageUrl: string | null = null
  try {
    const output = await replicate.run(
      'fashn/tryon' as `${string}/${string}`,
      {
        input: {
          model_image: userImageDataUri,
          garment_image: garmentImageDataUri,
          category: garmentCategory,
          garment_photo_type: 'flat-lay',
          num_samples: 1,
          guidance_scale: 2.5,
          timesteps: 50,
          nsfw_filter: true,
        }
      }
    )
    const result = output as string[] | string | { [key: string]: unknown }
    if (Array.isArray(result)) {
      tryOnImageUrl = result[0] ?? null
    } else if (typeof result === 'string') {
      tryOnImageUrl = result
    } else if (result && typeof result === 'object' && 'output' in result) {
      const inner = (result as { output: string | string[] }).output
      tryOnImageUrl = Array.isArray(inner) ? inner[0] : inner
    }
  } catch (e) {
    // Fallback: try IDM-VTON if fashn is unavailable
    try {
      const output = await replicate.run(
        'cuuupid/idm-vton' as `${string}/${string}`,
        {
          input: {
            human_img: userImageDataUri,
            garm_img: garmentImageDataUri,
            category: garmentCategory === 'one-pieces' ? 'dresses' : garmentCategory === 'bottoms' ? 'lower_body' : 'upper_body',
          }
        }
      )
      const result = output as string[] | string
      tryOnImageUrl = Array.isArray(result) ? result[0] : (typeof result === 'string' ? result : null)
    } catch {
      return Response.json({ error: 'Try-on generation failed' }, { status: 500 })
    }
  }

  if (!tryOnImageUrl) {
    return Response.json({ error: 'Try-on generation failed' }, { status: 500 })
  }

  const captionResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are Hem, the AI stylist for Aster & Hem. You have just shown the user a virtual try-on of a specific product — they can see themselves wearing it.
Write 1–2 sentences of warm, specific styling commentary. Reference why this item works for them or how to style it further.
Do NOT say "as you can see" or describe the image. Speak directly about the item and their look. Be a stylist, not a narrator.`
      },
      {
        role: 'user',
        content: `Product: ${fullProduct.name} in ${fullProduct.colour}. User asked: "${userPrompt}". Category: ${fullProduct.category}. Description: ${fullProduct.description}`
      }
    ],
    max_tokens: 80
  })

  const caption = captionResponse.choices[0].message.content ??
    `${fullProduct.name} in ${fullProduct.colour} — $${fullProduct.price} AUD.`

  return Response.json({
    tryOnImage: tryOnImageUrl,
    caption,
    product: {
      sku: fullProduct.sku,
      name: fullProduct.name,
      colour: fullProduct.colour,
      price: fullProduct.price,
      image: fullProduct.image,
      sizes: fullProduct.sizes,
      description: fullProduct.description,
    }
  })
}
