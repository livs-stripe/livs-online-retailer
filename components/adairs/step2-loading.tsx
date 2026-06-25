"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"

// Status headlines cycle to give a sense of forward momentum.
const PHASES = [
  "Scanning your room...",
  "Reading the light and colours...",
  "Matching your style...",
  "Curating your collection...",
  "Adding the finishing touches...",
]

// Interior-styling quotes/tips scroll past to keep the wait engaging.
const TIPS = [
  "Layer at least three cushion sizes for an inviting, collected look.",
  "Odd-numbered groupings feel more natural than even ones.",
  "A single textured throw can warm up an entire room.",
  "Mirrors bounce light and make small spaces feel larger.",
  "Anchor a room with one hero piece, then build around it.",
  "Mixing materials — linen, timber, ceramic — adds depth.",
  "Warm metallics like brass bring a subtle touch of luxe.",
  "Greenery instantly makes a space feel fresh and alive.",
  "Hang artwork at eye level — roughly 145cm to the centre.",
  "Let your rug be large enough to sit under the front legs of your sofa.",
  "Stick to a palette of three to five colours for a cohesive feel.",
  "Vary heights on shelves and tables to create visual rhythm.",
  "A floor lamp in a dark corner instantly opens up a room.",
  "Drape curtains from ceiling to floor to make windows feel taller.",
  "Repeat a colour at least three times across a room to tie it together.",
  "Leave a little breathing room — not every surface needs styling.",
  "Layer lighting: ambient, task and accent for warmth after dark.",
  "Natural textures like jute and rattan add instant relaxed character.",
  "Style coffee tables in groups: a tray, a book stack and something living.",
  "Choose one statement texture per room so it feels considered, not busy.",
  "Soft, rounded shapes balance out hard architectural lines.",
  "A scented candle or diffuser makes a space feel finished and lived-in.",
]

const CHECKLIST = [
  "Identifying furniture and palette",
  "Matching your style preferences",
  "Curating your Adairs collection",
]

export function Step2Loading() {
  const [progress, setProgress] = useState(6)
  const [phase, setPhase] = useState(0)
  // Start on a random tip so the order feels fresh every time.
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [checked, setChecked] = useState(0)

  // Smoothly ease the progress bar toward (but never quite reaching) 100%.
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 96 ? 96 : p + Math.max(1, Math.round((100 - p) * 0.06))))
    }, 220)
    return () => clearInterval(id)
  }, [])

  // Rotate the headline phrases.
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1600)
    return () => clearInterval(id)
  }, [])

  // Rotate the styling tips at a relaxed pace so each is easy to read.
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4600)
    return () => clearInterval(id)
  }, [])

  // Tick the checklist forward.
  useEffect(() => {
    const timers = CHECKLIST.map((_, i) =>
      setTimeout(() => setChecked((v) => Math.max(v, i + 1)), 900 * (i + 1)),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
      {/* Blurred shimmer mock grid behind */}
      <div className="pointer-events-none absolute inset-0 -z-0 px-4 pt-10 opacity-40 blur-sm" aria-hidden="true">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-44 rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-10 max-w-md">
        <div className="overflow-hidden rounded-2xl border border-border bg-card/95 p-8 text-center shadow-md backdrop-blur">
          <span className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-accent/15">
            <Sparkles className="h-6 w-6 text-accent" aria-hidden="true" />
          </span>

          {/* Cycling headline */}
          <div className="mt-5 h-8" aria-live="polite">
            <h2 key={phase} className="animate-fade-up font-serif text-2xl text-foreground">
              {PHASES[phase]}
            </h2>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground">{progress}%</p>
          </div>

          {/* Scrolling styling tip */}
          <div className="mt-5 min-h-16 rounded-xl bg-accent/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Styling tip</p>
            <p
              key={tip}
              className="mt-1 animate-fade-up text-sm italic leading-relaxed text-muted-foreground"
            >
              {`"${TIPS[tip]}"`}
            </p>
          </div>

          {/* Checklist */}
          <ul className="mt-6 flex flex-col gap-3 text-left">
            {CHECKLIST.map((b, i) => {
              const done = i < checked
              return (
                <li
                  key={b}
                  className="flex items-center gap-2 text-sm leading-relaxed transition-all duration-500"
                  style={{ opacity: done ? 1 : 0.4, transform: done ? "translateY(0)" : "translateY(4px)" }}
                >
                  <span
                    className={
                      done
                        ? "flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground"
                        : "flex h-4 w-4 items-center justify-center rounded-full border border-border"
                    }
                    aria-hidden="true"
                  >
                    {done ? "✓" : ""}
                  </span>
                  <span className={done ? "text-foreground" : "text-muted-foreground"}>{b}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
