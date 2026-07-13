import { PRODUCTS } from '@/lib/products'
import { searchCatalog } from '@/lib/catalog-search'
import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const maxDuration = 30

const DEMO_TRYON_IMAGE_PATH = '/images/demo-tryon-blazer.png'
const BLAZER_SKU = 'AH-001'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imageFile = formData.get('image') as File
    const userPrompt = formData.get('prompt') as string

    if (!imageFile || !userPrompt) {
      return Response.json({ error: 'Image and prompt required' }, { status: 400 })
    }

    // For demo: always return the Coastline Linen Blazer try-on
    const product = PRODUCTS.find(p => p.sku === BLAZER_SKU)!

    // Simulate processing time (8-10 seconds)
    await new Promise(resolve => setTimeout(resolve, 8000 + Math.random() * 2000))

    // Read the pre-generated demo try-on image
    const imagePath = join(process.cwd(), 'public', DEMO_TRYON_IMAGE_PATH)
    const imageBuffer = readFileSync(imagePath)
    const tryOnImageUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`

    // Search for accessories that complement the blazer
    const accessoryResults = searchCatalog({
      query: 'accessories jewellery bag earrings',
      category: 'Accessories',
      limit: 4,
    })

    const accessories = accessoryResults.products.map(p => ({
      sku: p.sku,
      name: p.name,
      colour: p.colour ?? p.variant,
      price: p.price,
      image: p.image,
      sizes: p.sizes,
      subcategory: p.subcategory,
      description: p.description ?? '',
    }))

    const caption = `That's the Coastline Linen Blazer in Bone — it's effortless and polished. It also pairs beautifully with your Gold Strappy Sandal from your recent purchase — that combination is chic and conference-ready. Here are a few more accessories I'd style with it.`

    return Response.json({
      tryOnImage: tryOnImageUrl,
      caption,
      product: {
        sku: product.sku,
        name: product.name,
        colour: product.colour ?? product.variant,
        price: product.price,
        image: product.image,
        sizes: product.sizes,
        description: product.description ?? '',
      },
      accessories,
    })

  } catch (error: unknown) {
    console.error('[style-me] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown server error'
    return Response.json({ error: message }, { status: 500 })
  }
}
