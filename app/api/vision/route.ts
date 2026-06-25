import { NextResponse } from "next/server"
import OpenAI from "openai"
import inventory from "@/lib/aster-hem-inventory.json"

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const image = formData.get("image") as File
    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    const buffer = await image.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mimeType = image.type

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are Hem, the AI stylist for Aster & Hem — a contemporary Australian womenswear brand specialising in elevated basics and polished workwear for professional women aged 28–45.

The user has uploaded a photo. Your job:
1. Analyse the image: identify occasion, colour palette, garments visible, and overall style direction.
2. Select 1–2 products from the inventory below that complement or complete the look.
3. Be specific — reference what you actually see in the photo.
4. Maximum 3 sentences total. Warm, direct, confident.

Respond ONLY in this exact JSON (no markdown, no extra text):
{
  "analysis": "one sentence describing what you see",
  "recommendations": [
    {
      "sku": "AH-XXX",
      "name": "full product name",
      "colour": "colour",
      "price": 000,
      "reason": "one sentence specific to what you saw"
    }
  ]
}

Inventory: ${JSON.stringify(inventory)}`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 500,
    })

    const content = response.choices[0].message.content ?? ""
    const cleaned = content.replace(/```json\n?|```\n?/g, "").trim()
    return NextResponse.json(JSON.parse(cleaned))
  } catch (error) {
    console.error("Vision API error:", error)
    return NextResponse.json(
      { analysis: "I had trouble analysing that image. Could you try another photo?", recommendations: [] },
      { status: 200 },
    )
  }
}
