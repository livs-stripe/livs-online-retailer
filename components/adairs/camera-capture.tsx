"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, RotateCcw, Check, X, CameraOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CameraCaptureProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (dataUrl: string) => void
}

export function CameraCapture({ open, onOpenChange, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [snapshot, setSnapshot] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  const startStream = useCallback(async () => {
    setError(null)
    setSnapshot(null)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera access isn't supported on this device or browser.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)
    } catch {
      setError("We couldn't access your camera. Please allow camera permission and try again.")
    }
  }, [])

  useEffect(() => {
    if (open) {
      startStream()
    } else {
      stopStream()
      setSnapshot(null)
      setError(null)
    }
    return () => stopStream()
  }, [open, startStream, stopStream])

  function takePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    // 0.85 keeps the photo crisp while shrinking the payload so the AI calls run faster.
    setSnapshot(canvas.toDataURL("image/jpeg", 0.85))
    stopStream()
  }

  function usePhoto() {
    if (snapshot) {
      onCapture(snapshot)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-serif text-xl">Take a room photo</DialogTitle>
          <DialogDescription>Point your camera at the room you&apos;d like styled.</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 pt-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-primary">
            {snapshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshot || "/placeholder.svg"} alt="Captured room" className="h-full w-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
                aria-label="Camera preview"
              />
            )}

            {!ready && !snapshot && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary-foreground/80">
                <Camera className="h-8 w-8 animate-pulse" aria-hidden="true" />
                <span className="text-sm">Starting camera…</span>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center text-primary-foreground">
                <CameraOff className="h-8 w-8" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-primary-foreground/90">{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-3">
          {snapshot ? (
            <>
              <Button variant="outline" onClick={startStream} className="rounded-xl bg-transparent">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retake
              </Button>
              <Button
                onClick={usePhoto}
                className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Use this photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl bg-transparent">
                <X className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
              {error ? (
                <Button onClick={startStream} className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
              ) : (
                <Button
                  onClick={takePhoto}
                  disabled={!ready}
                  className="rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Capture
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
