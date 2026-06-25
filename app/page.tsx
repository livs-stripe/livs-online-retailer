import { AsterHemApp } from "@/components/storefront/aster-hem-app"

export default function HomePage() {
  const hasAi = Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY)
  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  const demoMode = !hasAi || !hasStripe

  return <AsterHemApp demoMode={demoMode} />
}
