"use client"

import { useState } from "react"
import { SiteChrome } from "./site-chrome"
import { Step1Upload } from "./step1-upload"
import { Step2Loading } from "./step2-loading"
import { Step3Recommendations } from "./step3-recommendations"
import { curateAnalysis, type RoomKind } from "@/lib/style-curation"
import type { ShopDestination, MenuKey } from "@/lib/categories"
import type { RoomAnalysis, WizardStep } from "@/lib/types"

// Neutral default shown before any analysis runs.
const FALLBACK_ANALYSIS: RoomAnalysis = curateAnalysis("", "work")

interface WizardProps {
  demoMode: boolean
  onExit?: () => void
  onNavigate?: (key: MenuKey) => void
  onShop?: (dest: ShopDestination) => void
  onEditClub?: () => void
}

export function Wizard({ demoMode, onExit, onNavigate, onShop, onEditClub }: WizardProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [stylePrompt, setStylePrompt] = useState("")
  // The occasion the look is anchored to (work / weekend / evening).
  const [occasion, setOccasion] = useState<RoomKind>("work")
  // Budget anchor (AUD). Curation fits the whole look within it. `null` = no limit.
  const [budget, setBudget] = useState<number | null>(null)
  const [analysis, setAnalysis] = useState<RoomAnalysis>(FALLBACK_ANALYSIS)
  const [wishlist, setWishlist] = useState<string[]>([])
  // Lift the styled room preview so it persists across step navigation instead
  // of regenerating each time step 3 remounts.
  const [styledImage, setStyledImage] = useState<string | null>(null)
  const [placedIds, setPlacedIds] = useState<string[] | null>(null)

  async function handleAnalyse() {
    setStep(2)
    // A fresh analysis means a new room/selection — drop any cached preview.
    setStyledImage(null)
    setPlacedIds(null)
    const startedAt = Date.now()
    try {
      const res = await fetch("/api/analyse-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageDataUrl, stylePrompt, occasion, budget: budget ?? undefined }),
      })
      const data = (await res.json()) as RoomAnalysis
      if (data?.recommendedProductIds?.length) setAnalysis(data)
      else setAnalysis(curateAnalysis(stylePrompt, occasion, budget ?? undefined))
    } catch {
      // Even when the request fails, keep the recommendation on-brief and within budget.
      setAnalysis(curateAnalysis(stylePrompt, occasion, budget ?? undefined))
    } finally {
      // Keep the loading animation visible for a beat
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, 2400 - elapsed)
      setTimeout(() => setStep(3), wait)
    }
  }

  function toggleWishlist(id: string) {
    setWishlist((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteChrome
        onHome={onExit}
        onNavigate={onNavigate}
        onEditClub={onEditClub}
        onSearch={(q) => onShop?.({ type: "search", query: q })}
      />

      <main className="flex-1">
        {step === 1 && (
          <Step1Upload
            imageDataUrl={imageDataUrl}
            stylePrompt={stylePrompt}
            budget={budget}
            occasion={occasion}
            onImageChange={setImageDataUrl}
            onStyleChange={setStylePrompt}
            onBudgetChange={setBudget}
            onOccasionChange={setOccasion}
            onSubmit={handleAnalyse}
          />
        )}

        {step === 2 && <Step2Loading />}

        {step === 3 && (
          <Step3Recommendations
            imageDataUrl={imageDataUrl}
            analysis={analysis}
            budget={budget}
            wishlist={wishlist}
            onToggleWishlist={toggleWishlist}
            styledImage={styledImage}
            placedIds={placedIds}
            onVisualiserResult={(image, ids) => {
              setStyledImage(image)
              setPlacedIds(ids)
            }}
          />
        )}
      </main>
    </div>
  )
}
