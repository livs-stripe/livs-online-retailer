"use client"

import type React from "react"
import { useRef, useState } from "react"
import { UploadCloud, ImageIcon, ArrowRight, X, Camera, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { CameraCapture } from "@/components/storefront/camera-capture"
import { STYLE_OPTIONS, BUDGET_OPTIONS, type RoomKind } from "@/lib/style-curation"
import { downscaleImageDataUrl } from "@/lib/image-utils"

interface Step1UploadProps {
  imageDataUrl: string | null
  stylePrompt: string
  budget: number | null
  occasion: RoomKind
  onImageChange: (dataUrl: string | null) => void
  onStyleChange: (value: string) => void
  onBudgetChange: (value: number | null) => void
  onOccasionChange: (value: RoomKind) => void
  onSubmit: () => void
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]

const OCCASION_OPTIONS: { key: RoomKind; label: string }[] = [
  { key: "work", label: "Workwear" },
  { key: "weekend", label: "Weekend" },
  { key: "evening", label: "Evening" },
]

export function Step1Upload({
  imageDataUrl,
  stylePrompt,
  budget,
  occasion,
  onImageChange,
  onStyleChange,
  onBudgetChange,
  onOccasionChange,
  onSubmit,
}: Step1UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)

  function handleFile(file: File | undefined) {
    if (!file || !ACCEPTED.includes(file.type)) return
    const reader = new FileReader()
    reader.onload = async () => {
      // Downscale large photos before they enter the pipeline so the AI calls
      // run much faster. Falls back to the original on any failure.
      const compressed = await downscaleImageDataUrl(reader.result as string)
      onImageChange(compressed)
    }
    reader.readAsDataURL(file)
  }

  const canSubmit = Boolean(imageDataUrl) && stylePrompt.trim().length > 0
  const selectedStyle = STYLE_OPTIONS.find((option) => option.prompt === stylePrompt)

  return (
    <div className="animate-fade-up mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">Meet Hem · AI Personal Stylist</p>
        <h1 className="mt-3 text-balance font-serif text-4xl leading-tight text-foreground sm:text-5xl">
          Your style, curated.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
          Upload a photo of yourself, an outfit you love, or your wardrobe, and tell Hem your style. Hem will curate a
          personalised Aster &amp; Hem edit just for you — ready to wear and purchase in seconds.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-6">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {imageDataUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl || "/placeholder.svg"} alt="Your style preview" className="h-72 w-full object-cover" />
              <button
                type="button"
                onClick={() => onImageChange(null)}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  inputRef.current?.click()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                handleFile(e.dataTransfer.files?.[0])
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent/60 bg-card px-6 py-14 text-center transition-colors hover:bg-accent/5",
                dragging && "border-accent bg-accent/10",
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
                <UploadCloud className="h-6 w-6 text-accent" aria-hidden="true" />
              </span>
              <span className="font-medium text-foreground">Drag &amp; drop your photo</span>
              <span className="text-sm text-muted-foreground">JPEG, PNG or WebP — up to 10MB</span>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  Browse files
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCameraOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      e.stopPropagation()
                      setCameraOpen(true)
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-accent/60 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/10"
                >
                  <Camera className="h-4 w-4 text-accent" aria-hidden="true" />
                  Use camera
                </span>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground">What&apos;s the occasion?</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell Hem where you&apos;ll wear it so the edit suits the moment.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose the occasion">
            {OCCASION_OPTIONS.map((option) => {
              const selected = occasion === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onOccasionChange(option.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:border-accent/60 hover:bg-accent/5",
                  )}
                >
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground">Choose your style</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the aesthetic you love — Hem matches it to the perfect Aster &amp; Hem pieces.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose your style">
            {STYLE_OPTIONS.map((option) => {
              const selected = stylePrompt === option.prompt
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onStyleChange(option.prompt)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:border-accent/60 hover:bg-accent/5",
                  )}
                >
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {option.label}
                </button>
              )
            })}
          </div>
          {selectedStyle && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selectedStyle.description}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground">Set your budget</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Your stylist curates the whole look to fit — and it becomes the spend cap you authorise at checkout.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Set your budget">
            {BUDGET_OPTIONS.map((option) => {
              const selected = budget === option.value
              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onBudgetChange(option.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:border-accent/60 hover:bg-accent/5",
                  )}
                >
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <Button
          size="lg"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="h-12 rounded-xl bg-accent text-base font-medium text-accent-foreground hover:bg-accent/90"
        >
          Style Me with Hem
          <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <CameraCapture open={cameraOpen} onOpenChange={setCameraOpen} onCapture={onImageChange} />
    </div>
  )
}
