"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Sparkles, RotateCcw, ImageOff, MoveHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface RoomVisualiserProps {
  imageDataUrl: string
  productIds: string[]
  // A previously generated styled image (lifted to the parent) so navigating
  // away and back doesn't re-trigger an expensive regeneration.
  cachedImage?: string | null
  // The product IDs composited into the cached image, restored on remount.
  cachedPlacedIds?: string[] | null
  // Reports back the styled image + the exact product IDs that were composited,
  // so the parent can cache them and show only the pieces actually present.
  onResult?: (image: string, placedIds: string[]) => void
  // Bumped by the parent (e.g. "Redesign room") to force a fresh render of the
  // current selection. The initial value is ignored; only changes regenerate.
  regenerateKey?: number
}

// Status messages shown as the progress bar fills
const PROGRESS_STAGES = [
  "Reading your photo…",
  "Mapping your pose & proportions…",
  "Dressing you in the look…",
  "Matching colours & fabrics…",
  "Adding finishing touches…",
]

export function RoomVisualiser({
  imageDataUrl,
  productIds,
  cachedImage,
  cachedPlacedIds,
  onResult,
  regenerateKey,
}: RoomVisualiserProps) {
  // Start from the cached result (if any) so a remount shows it instantly
  // without loading or regenerating.
  const [loading, setLoading] = useState(!cachedImage)
  const [styledImage, setStyledImage] = useState<string | null>(cachedImage ?? null)
  const [error, setError] = useState<string | null>(null)
  const [sliderPos, setSliderPos] = useState(50)
  const [progress, setProgress] = useState(0)
  // How many pieces were actually composited into the styled image.
  const [placedCount, setPlacedCount] = useState(cachedPlacedIds?.length ?? 0)

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  // Capture the product set used for the very first auto-render so it doesn't
  // re-run every time the cart changes — the user can hit "Redo" for that.
  const initialIdsRef = useRef(productIds)
  // If we already have a cached image, treat the auto-generate as done.
  const hasRunRef = useRef(Boolean(cachedImage))
  // Keep the latest callback without forcing `generate` to be re-created.
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const hasResult = Boolean(styledImage)

  // Drive the progress bar from `loading` via an effect so React owns the
  // interval lifecycle. This keeps the bar animating even when React Strict
  // Mode (dev) unmounts/remounts the component mid-request.
  useEffect(() => {
    if (!loading) {
      setProgress(100)
      return
    }
    setProgress(0)
    const id = setInterval(() => {
      setProgress((p) => (p >= 95 ? 95 : p + (95 - p) * 0.045))
    }, 220)
    return () => clearInterval(id)
  }, [loading])

  const generate = useCallback(async (ids: string[]) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/visualise-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageDataUrl, productIds: ids }),
      })
      const data = await res.json().catch(() => null)
      if (data?.image) {
        setStyledImage(data.image)
        // Sync the displayed collection to the items actually placed in the image,
        // and lift the result to the parent so it survives navigation.
        const placedIds = Array.isArray(data.placedProductIds) ? (data.placedProductIds as string[]) : []
        setPlacedCount(placedIds.length)
        onResultRef.current?.(data.image as string, placedIds)
      } else {
        // Surface the real server-side reason (e.g. model unavailable, timeout)
        // so production failures are diagnosable instead of always generic.
        const detail = data?.detail || data?.error
        setError(
          detail
            ? `We couldn't generate a preview: ${detail}`
            : "We couldn't generate a preview. Please try again.",
        )
      }
      setSliderPos(50)
    } catch (err) {
      const detail = err instanceof Error ? err.message : ""
      setError(
        detail
          ? `We couldn't generate a preview: ${detail}`
          : "We couldn't generate a preview. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }, [imageDataUrl])

  // Auto-generate the styled room as soon as the step opens.
  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true
    if (initialIdsRef.current.length > 0) {
      void generate(initialIdsRef.current)
    } else {
      setLoading(false)
    }
  }, [generate])

  // "Redesign room" — when the parent bumps regenerateKey, render a fresh
  // styled image for the CURRENT selection. The initial value is skipped so
  // this never double-fires alongside the auto-generate above.
  const regenSeenRef = useRef(regenerateKey)
  // Keep the latest productIds without making the effect depend on them, so a
  // redesign always uses the live selection but only fires on key changes.
  const productIdsRef = useRef(productIds)
  productIdsRef.current = productIds
  useEffect(() => {
    if (regenerateKey === undefined) return
    if (regenSeenRef.current === regenerateKey) return
    regenSeenRef.current = regenerateKey
    if (productIdsRef.current.length > 0) void generate(productIdsRef.current)
  }, [regenerateKey, generate])

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setSliderPos(Math.min(100, Math.max(0, pct)))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!hasResult) return
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    updateFromClientX(e.clientX)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setSliderPos((p) => Math.max(0, p - 5))
    if (e.key === "ArrowRight") setSliderPos((p) => Math.min(100, p + 5))
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div
        ref={containerRef}
        className={cn(
          "relative aspect-[3/4] w-full select-none overflow-hidden bg-secondary",
          hasResult && !loading && "cursor-ew-resize touch-none",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* AFTER layer (full background) */}
        {styledImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={styledImage || "/placeholder.svg"}
            alt="You styled in the Aster & Hem look"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* BEFORE layer (clipped to the left of the handle) */}
        <div
          className="absolute inset-0"
          style={{ clipPath: hasResult ? `inset(0 ${100 - sliderPos}% 0 0)` : undefined }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl || "/placeholder.svg"}
            alt="Your photo before styling"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        {/* Labels */}
        {hasResult && !loading && (
          <>
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
              Before
            </span>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-background shadow-sm">
              After
            </span>
          </>
        )}

        {/* Drag handle */}
        {hasResult && !loading && (
          <div
            role="slider"
            tabIndex={0}
            aria-label="Drag to compare before and after"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(sliderPos)}
            onKeyDown={onKeyDown}
            className="absolute top-0 bottom-0 z-10 -ml-0.5 w-1 cursor-ew-resize bg-background/90 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md">
              <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
        )}

        {/* Loading progress */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 px-8 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-accent" aria-hidden="true" />
              {PROGRESS_STAGES[Math.min(PROGRESS_STAGES.length - 1, Math.floor((progress / 100) * PROGRESS_STAGES.length))]}
            </p>
            <div className="w-full max-w-xs">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                aria-label="Styling progress"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs font-medium tabular-nums text-muted-foreground">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Styling the look onto your photo…"
            : hasResult
              ? `Drag the slider to compare — styled with ${placedCount} ${
                  placedCount === 1 ? "piece" : "pieces"
                } below.`
              : "Add a few pieces to see them styled on you."}
        </p>
        {hasResult && (
          <button
            type="button"
            onClick={() => generate(productIds)}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            aria-label="Regenerate styled preview with current selection"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Redo
          </button>
        )}
      </div>

      {error && !loading && (
        <div className="flex flex-col items-center gap-2 px-4 pb-4">
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-destructive">
            <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
            {error}
          </p>
          <button
            type="button"
            onClick={() => generate(productIds)}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
