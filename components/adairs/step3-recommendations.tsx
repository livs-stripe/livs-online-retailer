"use client"

import { useMemo, useState } from "react"
import { Quote, Wand2 } from "lucide-react"
import { ProductCard } from "./product-card"
import { RoomVisualiser } from "./room-visualiser"
import { useCart } from "./cart-context"
import { getProductById } from "@/lib/products"
import { curateProductIds } from "@/lib/style-curation"
import type { RoomAnalysis } from "@/lib/types"

interface Step3Props {
  imageDataUrl: string | null
  analysis: RoomAnalysis
  // Buyer's budget anchor (AUD); null = no limit.
  budget: number | null
  wishlist: string[]
  onToggleWishlist: (id: string) => void
  // Lifted styled-image cache so navigating back doesn't regenerate the preview.
  styledImage: string | null
  placedIds: string[] | null
  onVisualiserResult: (image: string, placedIds: string[]) => void
}

export function Step3Recommendations({
  imageDataUrl,
  analysis,
  budget,
  wishlist,
  onToggleWishlist,
  styledImage,
  placedIds,
  onVisualiserResult,
}: Step3Props) {
  // The shared storefront cart — "Add" buttons here drop pieces into the same
  // top-right cart used across the site.
  const { items, addToCart, removeItem } = useCart()
  // When the buyer conversationally re-styles the look, this holds the agent's
  // updated product set. It overrides the original AI recommendation.
  const [overrideIds, setOverrideIds] = useState<string[] | null>(null)
  // Bumped to force the visualiser to render a fresh styled image (used by the
  // "Redesign room" button).
  const [regenerateKey, setRegenerateKey] = useState(0)

  // The active look — the agent's re-styled set if present, else the original
  // AI recommendation.
  const activeProducts = useMemo(() => {
    const ids = overrideIds ?? analysis.recommendedProductIds
    return ids.map((id) => getProductById(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
  }, [overrideIds, analysis.recommendedProductIds])

  const visualiseIds = useMemo(() => activeProducts.map((p) => p.id), [activeProducts])

  // Show only the pieces actually present in the image. After a manual re-style
  // the lifted placedIds are stale (they describe the previous render), so we
  // show the exact new look and let the buyer hit "Redo" to re-render it.
  const curatedProducts = useMemo(() => {
    if (overrideIds) return activeProducts
    if (!placedIds) return activeProducts
    const placed = new Set(placedIds)
    return activeProducts.filter((p) => placed.has(p.id))
  }, [overrideIds, placedIds, activeProducts])

  // Style brief + occasion passed to the re-style agent so swaps stay on-theme
  // and garment slots resolve correctly.
  const occasion: "work" | "weekend" | "evening" = analysis.roomType.toLowerCase().includes("evening")
    ? "evening"
    : analysis.roomType.toLowerCase().includes("weekend")
      ? "weekend"
      : "work"

  const cartIds = new Set(items.map((c) => c.productId))

  // Add/remove a single piece from the shared cart.
  function toggleCart(id: string) {
    if (cartIds.has(id)) removeItem(id)
    else addToCart(id)
  }

  // "Redesign room" — re-curate a brand-new on-theme look within the same budget,
  // then trigger a fresh styled-image render of it.
  function handleRedesign() {
    const ids = curateProductIds(analysis.detectedStyle, occasion, budget ?? undefined)
    setOverrideIds(ids)
    setRegenerateKey((k) => k + 1)
  }

  return (
    <div className="animate-fade-up mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Left — Room analysis */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          {imageDataUrl && (
            <RoomVisualiser
              imageDataUrl={imageDataUrl}
              productIds={visualiseIds}
              cachedImage={styledImage}
              cachedPlacedIds={placedIds}
              onResult={onVisualiserResult}
              regenerateKey={regenerateKey}
            />
          )}

          <button
            type="button"
            onClick={handleRedesign}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Restyle the look
          </button>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            Generate a fresh take{budget !== null ? " — still within your budget" : ""}
          </p>

          <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Hem&apos;s Style Read</p>

            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Occasion</dt>
                <dd className="font-medium text-foreground">{analysis.roomType}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Detected style</dt>
                <dd className="font-medium text-foreground">{analysis.detectedStyle}</dd>
              </div>
              <div>
                <dt className="mb-2 text-muted-foreground">Colour palette</dt>
                <dd className="flex gap-2">
                  {analysis.colourPalette.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="h-8 w-8 rounded-full border border-border shadow-sm"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-muted-foreground">Style gap</dt>
                <dd className="leading-relaxed text-foreground">{analysis.styleGap}</dd>
              </div>
            </dl>

            <figure className="mt-5 rounded-xl bg-secondary/60 p-4">
              <Quote className="h-4 w-4 text-accent" aria-hidden="true" />
              <blockquote className="mt-2 font-serif text-base italic leading-relaxed text-foreground">
                {analysis.stylistNote}
              </blockquote>
              <figcaption className="mt-2 text-xs text-muted-foreground">— Hem, your Aster &amp; Hem stylist</figcaption>
            </figure>
          </div>
        </div>

        {/* Right — Products */}
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-3xl text-foreground">Your Curated Edit</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {curatedProducts.length} pieces styled into your look above
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            {curatedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                inCart={cartIds.has(product.id)}
                wishlisted={wishlist.includes(product.id)}
                onToggleCart={() => toggleCart(product.id)}
                onToggleWishlist={() => onToggleWishlist(product.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
