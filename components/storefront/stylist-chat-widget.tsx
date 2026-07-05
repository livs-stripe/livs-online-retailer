"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useChat, type UIMessage } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Sparkles, Send, X, MessageCircle, Plus, Check, ShoppingBag, ShieldCheck, Camera } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatUsd } from "@/lib/format"
import { LS_CUSTOMER_ID, notifyOrderPlaced } from "@/lib/membership"
import { ProductImage } from "./product-image"
import { AgentCheckoutPanel } from "./agent-checkout-panel"
import { SizeSelector } from "./size-selector"
import { requiresSize } from "@/lib/sizing"
import { useCart } from "./cart-context"
import type { AgentOrder, Product } from "@/lib/types"

const CHAT_STORAGE_KEY = 'hem-chat-messages'
const DEMO_STATE_KEY = 'hem-demo-state'

function loadPersistedMessages(): UIMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = sessionStorage.getItem(CHAT_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function persistMessages(messages: UIMessage[]) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)) } catch {}
}

function loadDemoState() {
  if (typeof window === 'undefined') return null
  try {
    const stored = sessionStorage.getItem(DEMO_STATE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch { return null }
}

function persistDemoState(state: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state)) } catch {}
}

// Render the lightweight markdown the model emits (**bold** / *italic*) as real
// formatting instead of leaking raw asterisks into the chat bubble.
function renderInlineMarkdown(text: string) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return tokens.map((token, i) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={i}>{token.slice(2, -2)}</strong>
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={i}>{token.slice(1, -1)}</em>
    }
    return token
  })
}

// A product as returned by the searchCatalog tool (mirrors AsterHemProduct).
interface ChatProduct {
  id: string
  name: string
  variant: string
  category: string
  subcategory?: string
  sizes?: string[]
  price: number
  image: string
  url: string
  featured: boolean
}

interface VisionRecommendation {
  sku: string
  name: string
  colour: string
  price: number
  reason: string
}

interface VisionResult {
  analysis: string
  recommendations: VisionRecommendation[]
  imagePreview?: string
}

interface TryOnResult {
  tryOnImage: string
  caption: string
  product: {
    sku: string
    name: string
    colour: string
    price: number
    image: string
    sizes: string[]
    description: string
  }
  accessories?: {
    sku: string
    name: string
    colour: string
    price: number
    image: string
    sizes: string[]
    description: string
  }[]
}

interface DemoPurchase {
  date: string
  items: string[]
  description: string
  amount: number
}

interface DemoMessage {
  id: string
  role: "user" | "assistant"
  text: string
  product?: { sku: string; name: string; colour: string; price: number }
}

const SUGGESTIONS = [
  "What's trending this season",
  "An outfit for a spring wedding",
  "Build me a workwear capsule",
]

// Shown to signed-in members. The recent-order prompt is appended separately,
// but only once we've confirmed the member actually has a recent purchase.
const MEMBER_SUGGESTIONS = [
  "What's trending this season",
  "What goes with my recent order",
  "An outfit for a spring wedding",
]

// Product tile used in chat search results — keeps size picker hidden until tapped.
function ProductTile({
  product: p,
  added,
  sizeSelected,
  onSizeSelect,
  onToggle,
}: {
  product: ChatProduct
  added: boolean
  sizeSelected: string | null
  onSizeSelect: (size: string) => void
  onToggle: () => void
}) {
  const [sizePickerOpen, setSizePickerOpen] = useState(false)
  const needsSize = requiresSize(p)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="relative aspect-square w-full bg-secondary">
        <ProductImage
          src={p.image}
          alt={`${p.name} — ${p.variant}`}
          name={p.name}
          sizes="180px"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
          {p.name}
        </p>
        <p className="text-[11px] text-muted-foreground">{p.variant}</p>
        <span className="font-serif text-sm text-foreground">{formatUsd(p.price)}</span>
        {needsSize && !added && sizePickerOpen && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(p.sizes ?? []).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  onSizeSelect(size)
                  setSizePickerOpen(false)
                }}
                className={cn(
                  "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                  sizeSelected === size
                    ? "border-[#C4714A] bg-[#C4714A]/10 text-[#C4714A]"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                )}
              >
                {size}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1.5">
          <button
            type="button"
            onClick={() => {
              if (added) {
                onToggle()
              } else if (needsSize && !sizeSelected) {
                setSizePickerOpen(!sizePickerOpen)
              } else {
                onToggle()
              }
            }}
            aria-pressed={added}
            aria-label={added ? `Remove ${p.name}` : `Add ${p.name}`}
            className={cn(
              "inline-flex w-full items-center justify-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
              added
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-background text-foreground hover:bg-secondary",
            )}
          >
            {added ? (
              <>
                <Check className="h-3 w-3" aria-hidden="true" />
                Added{sizeSelected ? ` · ${sizeSelected}` : ''}
              </>
            ) : sizeSelected ? (
              <>
                <Plus className="h-3 w-3" aria-hidden="true" />
                Add · {sizeSelected}
              </>
            ) : (
              "Select size"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Floating conversational shopping agent. The buyer chats in plain language; the
const TRYON_LOADING_MESSAGES = [
  "Styling your look...",
  "Matching the fabric and cut...",
  "Checking the colour palette...",
  "Adjusting the silhouette...",
  "Layering the details...",
  "Perfecting the drape...",
  "Almost there...",
  "Adding the finishing touches...",
]

function TryOnLoadingAnimation() {
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % TRYON_LOADING_MESSAGES.length)
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
        <span className="italic">Trying it on for you — give me 10–15 seconds...</span>
      </div>
      <div className="rounded-xl overflow-hidden border border-[#E8E3DA]">
        <div
          className="h-80 w-full relative flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #F5F0E8 0%, #E8E3DA 50%, #F5F0E8 100%)',
            backgroundSize: '400% 400%',
            animation: 'ah-gradient-shift 3s ease infinite',
          }}
        >
          <div className="flex flex-col items-center gap-4 px-6">
            <div className="relative w-16 h-16">
              <div
                className="absolute inset-0 rounded-full border-2 border-[#C4714A]/30"
                style={{ animation: 'ah-spin-slow 3s linear infinite' }}
              />
              <div
                className="absolute inset-1 rounded-full border-2 border-transparent border-t-[#C4714A]"
                style={{ animation: 'ah-spin-slow 1.5s linear infinite' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-[#C4714A]" />
              </div>
            </div>
            <p
              key={msgIndex}
              className="text-xs text-[#1C1C1C]/60 text-center font-medium transition-opacity duration-500"
              style={{ animation: 'ah-fade-cycle 1.5s ease-in-out infinite' }}
            >
              {TRYON_LOADING_MESSAGES[msgIndex]}
            </p>
          </div>
        </div>
        <div className="p-3 bg-[#F5F0E8] flex items-center gap-2">
          <div className="w-12 h-16 rounded-lg bg-[#E8E3DA] animate-pulse" />
          <div className="flex-1">
            <div className="h-3 w-28 bg-[#E8E3DA] rounded animate-pulse mb-2" />
            <div className="h-3 w-16 bg-[#E8E3DA] rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

// agent searches the live catalogue, shows shoppable product cards, asks smart
// follow-ups, and completes the purchase in-chat via Stripe agentic checkout.
export function StylistChatWidget({ externalOpen }: { externalOpen?: boolean } = {}) {
  const [open, setOpen] = useState(false)

  // Allow external trigger to open the panel
  useEffect(() => {
    if (externalOpen) setOpen(true)
  }, [externalOpen])
  const [input, setInput] = useState("")
  // The signed-in Edit Club member's Stripe customer id (from localStorage).
  // When present, the agent can pull their purchase history for personalised picks.
  const [customerId, setCustomerId] = useState<string | null>(null)
  // The member's first name (from their Edit Club membership) for the greeting.
  const [memberName, setMemberName] = useState<string | null>(null)
  // Items the buyer has added for purchase, keyed by product id.
  const [selection, setSelection] = useState<Record<string, Product>>({})
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [lastOrder, setLastOrder] = useState<AgentOrder | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [visionResult, setVisionResult] = useState<VisionResult | null>(() => {
    const saved = loadDemoState()
    return saved?.visionResult ?? null
  })
  // Demo flow state
  const [demoPurchases, setDemoPurchases] = useState<DemoPurchase[]>([])
  const [demoMode, setDemoMode] = useState(() => {
    const saved = loadDemoState()
    return saved?.demoMode ?? false
  })
  const [demoStep, setDemoStep] = useState(() => {
    const saved = loadDemoState()
    return saved?.demoStep ?? 0
  })
  const [demoMessages, setDemoMessages] = useState<DemoMessage[]>(() => {
    const saved = loadDemoState()
    return saved?.demoMessages ?? []
  })
  const [showUploadPrompt, setShowUploadPrompt] = useState(() => {
    const saved = loadDemoState()
    return saved?.showUploadPrompt ?? false
  })
  const [postPurchaseMsg, setPostPurchaseMsg] = useState(() => {
    const saved = loadDemoState()
    return saved?.postPurchaseMsg ?? false
  })
  // Try-on state
  const [stagedPhoto, setStagedPhoto] = useState<File | null>(null)
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnExpanded, setTryOnExpanded] = useState(false)
  const [tryOnResult, setTryOnResult] = useState<TryOnResult | null>(() => {
    const saved = loadDemoState()
    return saved?.tryOnResult ?? null
  })
  // Track selected sizes per product (keyed by product id)
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [initialMessages] = useState<UIMessage[]>(() => loadPersistedMessages())

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/stylist-chat" }),
    initialMessages: initialMessages.length > 0 ? initialMessages : undefined,
  })

  // Persist AI chat messages to sessionStorage
  useEffect(() => {
    if (messages.length > 0) persistMessages(messages)
  }, [messages])

  // Persist demo state to sessionStorage
  useEffect(() => {
    persistDemoState({ demoMode, demoStep, demoMessages, showUploadPrompt, postPurchaseMsg, visionResult, tryOnResult })
  }, [demoMode, demoStep, demoMessages, showUploadPrompt, postPurchaseMsg, visionResult, tryOnResult])

  // The storefront cart. Items the shopper adds in chat are mirrored here so the
  // chat selection and the main cart stay in sync. (On the standalone membership
  // route the widget renders outside the CartProvider, where these are no-ops.)
  const { addToCart, removeItem: removeFromCart } = useCart()

  const busy = status === "streaming" || status === "submitted"

  const selectedItems = useMemo(() => Object.values(selection), [selection])
  const selectedTotal = useMemo(() => selectedItems.reduce((s, p) => s + p.price, 0), [selectedItems])

  function scrollToEnd() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    })
  }

  useEffect(() => {
    if (open) scrollToEnd()
  }, [messages, open])

  // Detect a signed-in member. Re-check when the panel opens so a sign-in that
  // happened after mount is picked up.
  useEffect(() => {
    if (typeof window === "undefined") return
    setCustomerId(localStorage.getItem(LS_CUSTOMER_ID))
  }, [open])

  // When a member opens the panel, pull their Edit Club membership so we can
  // greet them by name. Cleared for signed-out shoppers.
  useEffect(() => {
    if (!open) return
    if (!customerId) {
      setMemberName(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/membership?customerId=${encodeURIComponent(customerId)}`)
        if (!res.ok) return
        const data = (await res.json()) as {
          customer?: { name?: string | null }
        }
        if (cancelled) return
        const firstName = data.customer?.name?.trim().split(/\s+/)[0] ?? null
        setMemberName(firstName)
      } catch {
        // Leave greeting at its safe default on failure.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, customerId])

  // Fetch Sophie Carter's purchase history for the demo greeting
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/demo/purchases")
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setDemoPurchases(data.purchases ?? [])
      } catch {
        // Non-critical — greeting works without purchase history
      }
    })()
    return () => { cancelled = true }
  }, [open])

  // /demo command handler — runs the scripted stage flow
  function runDemoFlow() {
    setDemoMode(true)
    setDemoStep(1)
    setDemoMessages([])
    setVisionResult(null)
    setShowUploadPrompt(false)
    setPostPurchaseMsg(false)

    // Step 2: after 1.5s inject user message
    setTimeout(() => {
      setDemoMessages((prev) => [
        ...prev,
        { id: "demo-user-1", role: "user", text: "I have a big work presentation next week, not sure what to wear" },
      ])
      setDemoStep(2)

      // Step 3: after another 1.5s, Hem responds
      setTimeout(() => {
        setDemoMessages((prev) => [
          ...prev,
          {
            id: "demo-hem-1",
            role: "assistant",
            text: "You already have the Blazer and Trousers — the gap is a polished knit underneath. The Merino Knit Crew in Ivory ($159) completes the look. Want me to add it to your bag?",
            product: { sku: "AH-005", name: "The Merino Knit Crew", colour: "Ivory", price: 159 },
          },
        ])
        setDemoStep(3)

        // Step 4: after 2s, show upload prompt
        setTimeout(() => {
          setShowUploadPrompt(true)
          setDemoStep(4)
          scrollToEnd()
        }, 2000)

        scrollToEnd()
      }, 1500)

      scrollToEnd()
    }, 1500)
  }

  const isMember = Boolean(customerId)

  // Suggestion chips: signed-out shoppers get the generic set; members get the
  // member set.
  const suggestions = useMemo(() => {
    return isMember ? MEMBER_SUGGESTIONS : SUGGESTIONS
  }, [isMember])

  function submit(text: string) {
    const value = text.trim()
    if (!value && !stagedPhoto) return
    if (busy || tryOnLoading) return
    // Intercept /demo command
    if (value === "/demo") {
      setInput("")
      runDemoFlow()
      return
    }
    setLastOrder(null)

    // If there's a staged photo, route to try-on
    if (stagedPhoto) {
      const prompt = value || "Style me for work"
      handleStyleMe(stagedPhoto, prompt)
      setInput("")
      return
    }

    // Regular text message to the AI agent
    void sendMessage({ text: value }, { body: { customerId } })
    setInput("")
  }

  async function handleStyleMe(imageFile: File, userText: string) {
    setTryOnLoading(true)
    setTryOnResult(null)
    setStagedPhoto(null)
    scrollToEnd()
    try {
      const formData = new FormData()
      formData.append("image", imageFile)
      formData.append("prompt", userText)
      const res = await fetch("/api/style-me", { method: "POST", body: formData })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        console.error("[style-me] Error:", res.status, errBody)
        throw new Error(errBody?.error || `Try-on failed: ${res.status}`)
      }
      const data: TryOnResult = await res.json()
      setTryOnResult(data)
    } catch {
      setTryOnResult(null)
      setVisionResult({ analysis: "I couldn't generate a try-on right now — want me to show you the product details instead?", recommendations: [] })
    } finally {
      setTryOnLoading(false)
      scrollToEnd()
    }
  }

  async function handlePhotoUpload(file: File) {
    setPhotoUploading(true)
    setVisionResult(null)
    scrollToEnd()
    try {
      const formData = new FormData()
      formData.append("image", file)
      const preview = URL.createObjectURL(file)
      const res = await fetch("/api/vision", { method: "POST", body: formData })
      if (!res.ok) throw new Error("Vision API failed")
      const data = await res.json()
      setVisionResult({ ...data, imagePreview: preview })
    } catch {
      setVisionResult({ analysis: "Sorry, I couldn't analyse that photo. Try again?", recommendations: [] })
    } finally {
      setPhotoUploading(false)
      scrollToEnd()
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { e.target.value = ""; return }

    // In demo mode with upload prompt showing, go straight to try-on with the Blazer
    if (demoMode && showUploadPrompt) {
      handleStyleMe(file, "How would I look in the Coastline Linen Blazer?")
      e.target.value = ""
      return
    }

    setStagedPhoto(file)
    textInputRef.current?.focus()
    e.target.value = ""
  }

  function toggleSelect(p: ChatProduct) {
    const needsSize = requiresSize(p)
    const size = selectedSizes[p.id] ?? null
    if (needsSize && !size) return

    setSelection((prev) => {
      const next = { ...prev }
      if (next[p.id]) {
        delete next[p.id]
        removeFromCart(p.id)
      } else {
        next[p.id] = { ...p, selectedSize: size } as Product & { selectedSize?: string }
        addToCart(p.id, 1)
      }
      return next
    })
  }

  function addVisionProduct(sku: string) {
    addToCart(sku, 1)
  }

  const clearChatHistory = useCallback(() => {
    try {
      sessionStorage.removeItem(CHAT_STORAGE_KEY)
      sessionStorage.removeItem(DEMO_STATE_KEY)
    } catch {}
    setDemoMode(false)
    setDemoStep(0)
    setDemoMessages([])
    setVisionResult(null)
    setTryOnResult(null)
    setShowUploadPrompt(false)
    setPostPurchaseMsg(false)
    setLastOrder(null)
    setStagedPhoto(null)
    window.location.reload()
  }, [])

  const hasRestoredSession = initialMessages.length > 0

  function onOrderComplete(order: AgentOrder) {
    setLastOrder(order)
    // These items were just paid for in-chat, so drop them from the main cart
    // too — otherwise they'd linger there and could be purchased again.
    for (const p of selectedItems) removeFromCart(p.id)
    setSelection({})
    setCheckoutOpen(false)
    // Let the My Edit Club page refresh its purchases and member savings.
    notifyOrderPlaced()
    // Step 8 of demo flow — post-purchase suggestion
    if (demoMode) {
      setPostPurchaseMsg(true)
      setDemoStep(8)
      scrollToEnd()
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg transition-transform hover:scale-105"
          aria-label="Chat with Hem, your personal stylist"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Chat with Hem
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-card shadow-2xl sm:bottom-5 sm:right-5 sm:h-[640px] sm:max-h-[calc(100dvh-2.5rem)] sm:w-[400px] sm:rounded-2xl sm:border sm:border-border">
          {/* In-chat Stripe agentic checkout — overlays the chat interior */}
          {checkoutOpen && (
            <div className="absolute inset-0 z-10">
              <AgentCheckoutPanel
                products={selectedItems}
                budget={null}
                onBack={() => setCheckoutOpen(false)}
                onComplete={onOrderComplete}
              />
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-[#1C1C1C] px-4 py-3 text-[#F5F0E8]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1C1C1C] border border-[#F5F0E8]/30 text-[#F5F0E8] font-serif text-sm font-semibold">
                H
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Hem · Personal Stylist</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-accent-foreground/15"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
            {hasRestoredSession && (
              <div className="text-xs text-center text-[#C4714A] py-2 mb-3 border-b border-[#E8E3DA]">
                Continuing your conversation from earlier this session
              </div>
            )}
            {messages.length === 0 && !demoMode && !hasRestoredSession ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1C1C1C] text-[#F5F0E8] font-serif text-xs font-semibold">
                    H
                  </span>
                  <div className="rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Hem
                    </span>
                    {demoPurchases.length > 0 ? (
                      <p>Hi Olivia — welcome back to Aster &amp; Hem.</p>
                    ) : isMember ? (
                      <p>Hi Olivia — welcome back to Aster &amp; Hem.</p>
                    ) : (
                      <p>
                        Hi Olivia — welcome back to Aster &amp; Hem.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pl-9">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {/* Demo mode: Sophie Carter greeting at top of conversation */}
                {demoMode && demoStep >= 1 && (
                  <li className="flex flex-col items-start gap-2">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Hem
                      </span>
                      <p>Hi Olivia — welcome back to Aster &amp; Hem. Want me to find what&apos;s missing from your wardrobe — or upload a photo and I&apos;ll style you from there?</p>
                    </div>
                  </li>
                )}

                {messages.map((m) => (
                  <li key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        if (!part.text.trim()) return null
                        return (
                          <div
                            key={i}
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                              m.role === "user"
                                ? "rounded-br-sm bg-foreground text-background"
                                : "rounded-tl-sm bg-secondary text-foreground",
                            )}
                          >
                            {m.role === "assistant" && (
                              <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                                <Sparkles className="h-3 w-3" aria-hidden="true" />
                                Hem
                              </span>
                            )}
                            <p className="text-pretty whitespace-pre-wrap">{renderInlineMarkdown(part.text)}</p>
                          </div>
                        )
                      }

                      if (part.type === "tool-getPurchaseHistory") {
                        const done = part.state === "output-available"
                        const out = done ? (part.output as { loggedIn?: boolean; count?: number }) : null
                        const label =
                          !done || out?.loggedIn
                            ? "Checking your recent orders…"
                            : "Sign in to personalise from your orders"
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2.5 text-xs text-muted-foreground"
                          >
                            <ShoppingBag
                              className={cn("h-3.5 w-3.5 text-accent", !done && "animate-pulse")}
                              aria-hidden="true"
                            />
                            {label}
                          </div>
                        )
                      }

                      if (part.type === "tool-searchCatalog") {
                        if (part.state !== "output-available") {
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2.5 text-xs text-muted-foreground"
                            >
                              <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
                              Searching the Aster & Hem catalogue…
                            </div>
                          )
                        }
                        const products = (part.output as { products?: ChatProduct[] })?.products ?? []
                        if (products.length === 0) return null
                        return (
                          <div key={i} className="grid w-full grid-cols-2 gap-2">
                            {products.map((p) => (
                              <ProductTile
                                key={p.id}
                                product={p}
                                added={Boolean(selection[p.id])}
                                sizeSelected={selectedSizes[p.id] ?? null}
                                onSizeSelect={(size) => setSelectedSizes(prev => ({ ...prev, [p.id]: size }))}
                                onToggle={() => toggleSelect(p)}
                              />
                            ))}
                          </div>
                        )
                      }

                      return null
                    })}
                  </li>
                ))}

                {busy && (
                  <li className="flex items-start">
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
                      Styling…
                    </div>
                  </li>
                )}

                {lastOrder && (
                  <li className="flex items-start">
                    <div className="w-full rounded-2xl border border-accent/40 bg-accent/5 px-3.5 py-3 text-sm text-foreground">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Order confirmed
                      </span>
                      <p className="mt-1.5 leading-relaxed">
                        Congratulations on your purchase! Your {lastOrder.itemCount === 1 ? "item is" : "items are"} on the way to you shortly. Check your email for a copy of your receipt.
                      </p>
                    </div>
                  </li>
                )}

                {photoUploading && (
                  <li className="flex items-start">
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                      <Camera className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
                      Analysing your photo…
                    </div>
                  </li>
                )}

                {tryOnLoading && (
                  <li className="flex items-start">
                    <TryOnLoadingAnimation />
                  </li>
                )}

                {tryOnResult && (
                  <li className="flex flex-col items-start gap-2">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Hem
                      </span>
                      <p className="text-pretty">{tryOnResult.caption}</p>
                    </div>
                    <div className="w-full rounded-xl overflow-hidden border border-[#E8E3DA]">
                      <div className="relative bg-[#F5F0E8] cursor-pointer" onClick={() => setTryOnExpanded(true)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tryOnResult.tryOnImage}
                          alt="Virtual try-on"
                          className="w-full object-cover object-top"
                          style={{ maxHeight: '520px' }}
                        />
                        <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                          <span>✦</span>
                          <span>Virtual try-on</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 p-3 bg-[#F5F0E8]">
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-24 shrink-0 rounded-lg border border-[#E8E3DA] overflow-hidden relative">
                            <ProductImage
                              src={tryOnResult.product.image}
                              alt={tryOnResult.product.name}
                              name={tryOnResult.product.name}
                              sizes="80px"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1C1C1C] leading-tight">
                              {tryOnResult.product.name}
                            </p>
                            <p className="text-xs text-[#1C1C1C]/50 mt-0.5">
                              {tryOnResult.product.colour}
                            </p>
                            <p className="text-sm font-semibold text-[#C4714A] mt-1">
                              ${tryOnResult.product.price} AUD
                            </p>
                          </div>
                        </div>
                        {!selection[tryOnResult.product.sku] ? (
                          selectedSizes[tryOnResult.product.sku] ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const p = tryOnResult.product
                                setSelection((prev) => ({
                                  ...prev,
                                  [p.sku]: {
                                    id: p.sku,
                                    sku: p.sku,
                                    name: p.name,
                                    variant: p.colour,
                                    colour: p.colour,
                                    category: "",
                                    price: p.price,
                                    url: "#",
                                    image: p.image,
                                    featured: false,
                                    sizes: p.sizes,
                                    description: p.description,
                                  } as Product,
                                }))
                                addToCart(p.sku, 1)
                              }}
                              className="w-full bg-[#1C1C1C] text-[#F5F0E8] text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#C4714A] transition-colors"
                            >
                              Add to bag · {selectedSizes[tryOnResult.product.sku]}
                            </button>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {(tryOnResult.product.sizes ?? []).map((size) => (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedSizes(prev => ({ ...prev, [tryOnResult.product.sku]: size }))
                                  }}
                                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          )
                        ) : (
                          <div className="w-full bg-accent/10 text-accent text-xs font-medium px-3 py-2 rounded-lg text-center flex items-center justify-center gap-1">
                            <Check className="h-3 w-3" /> Added · {selectedSizes[tryOnResult.product.sku]}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Accessories recommendations */}
                    {tryOnResult.accessories && tryOnResult.accessories.length > 0 && (
                      <div className="w-full mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Accessories to complete the look:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {tryOnResult.accessories.map((acc) => (
                            <ProductTile
                              key={acc.sku}
                              product={{
                                id: acc.sku,
                                name: acc.name,
                                variant: acc.colour,
                                category: 'Accessories',
                                price: acc.price,
                                image: acc.image,
                                url: '#',
                                featured: false,
                                sizes: acc.sizes,
                              } as ChatProduct}
                              added={Boolean(selection[acc.sku])}
                              sizeSelected={selectedSizes[acc.sku] ?? null}
                              onSizeSelect={(size) => setSelectedSizes(prev => ({ ...prev, [acc.sku]: size }))}
                              onToggle={() => toggleSelect({
                                id: acc.sku,
                                name: acc.name,
                                variant: acc.colour,
                                category: 'Accessories',
                                price: acc.price,
                                image: acc.image,
                                url: '#',
                                featured: false,
                                sizes: acc.sizes,
                              } as ChatProduct)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                )}

                {visionResult && (
                  <li className="flex flex-col items-start gap-2">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Hem
                      </span>
                      <p className="text-pretty">{visionResult.analysis}</p>
                    </div>
                    {visionResult.recommendations.length > 0 && (
                      <div className="grid w-full grid-cols-2 gap-2">
                        {visionResult.recommendations.map((rec) => (
                          <div
                            key={rec.sku}
                            className="flex flex-col overflow-hidden rounded-xl border border-border bg-background"
                          >
                            <div className="relative aspect-square w-full bg-secondary">
                              <ProductImage
                                src={`/images/products/${rec.sku}.jpg`}
                                alt={`${rec.name} — ${rec.colour}`}
                                name={rec.name}
                                sizes="180px"
                              />
                            </div>
                            <div className="flex flex-1 flex-col gap-1 p-2.5">
                              <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                                {rec.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{rec.colour}</p>
                              <p className="text-[11px] text-muted-foreground italic">{rec.reason}</p>
                              <div className="mt-auto flex items-center justify-between pt-1.5">
                                <span className="font-serif text-sm text-foreground">{formatUsd(rec.price)}</span>
                                <button
                                  type="button"
                                  onClick={() => addVisionProduct(rec.sku)}
                                  aria-label={`Add ${rec.name} to bag`}
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                                >
                                  <Plus className="h-3 w-3" aria-hidden="true" />
                                  Add to bag
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                )}

                {/* Demo flow messages */}
                {demoMode && demoMessages.map((dm) => (
                  <li key={dm.id} className={cn("flex flex-col gap-2", dm.role === "user" ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      dm.role === "user"
                        ? "rounded-br-sm bg-foreground text-background"
                        : "rounded-tl-sm bg-secondary text-foreground",
                    )}>
                      {dm.role === "assistant" && (
                        <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          Hem
                        </span>
                      )}
                      <p className="text-pretty whitespace-pre-wrap">{dm.text}</p>
                    </div>
                    {dm.product && (
                      <div className="w-full max-w-[200px] flex flex-col overflow-hidden rounded-xl border border-border bg-background">
                        <div className="relative aspect-square w-full bg-secondary">
                          <ProductImage
                            src={`/images/products/${dm.product.sku}.jpg`}
                            alt={`${dm.product.name} — ${dm.product.colour}`}
                            name={dm.product.name}
                            sizes="180px"
                          />
                        </div>
                        <div className="flex flex-col gap-1 p-2.5">
                          <p className="text-xs font-medium text-foreground">{dm.product.name}</p>
                          <p className="text-[11px] text-muted-foreground">{dm.product.colour}</p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="font-serif text-sm text-foreground">${dm.product.price}</span>
                            <button
                              type="button"
                              onClick={() => { addToCart(dm.product!.sku, 1); setSelection((prev) => ({ ...prev, [dm.product!.sku]: { id: dm.product!.sku, sku: dm.product!.sku, name: dm.product!.name, variant: dm.product!.colour, colour: dm.product!.colour, category: "Workwear", subcategory: "Tops & Shirts", price: dm.product!.price, url: "#", image: `/images/products/${dm.product!.sku}.jpg`, featured: false, sizes: ["XS","S","M","L","XL"], description: "" } as Product }) ) }}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                            >
                              <Plus className="h-3 w-3" aria-hidden="true" />
                              Add to bag
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                ))}

                {/* Demo upload prompt overlay */}
                {demoMode && showUploadPrompt && !tryOnResult && !tryOnLoading && !visionResult && !photoUploading && (
                  <li className="flex items-start">
                    <div className="w-full rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 px-4 py-4 text-center">
                      <Camera className="mx-auto h-6 w-6 text-accent" aria-hidden="true" />
                      <p className="mt-2 text-sm font-medium text-foreground">Upload a photo of yourself to try on the Blazer</p>
                      <p className="mt-1 text-xs text-muted-foreground">Same face, same pose — just wearing the product</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        Choose photo
                      </button>
                    </div>
                  </li>
                )}

                {/* Post-purchase demo message (Step 8) */}
                {demoMode && postPurchaseMsg && (
                  <li className="flex items-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-accent">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Hem
                      </span>
                      <p>You&apos;re all set, Olivia. It&apos;ll be with you soon. Want to see what pairs with it?</p>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Selection / checkout bar */}
          {selectedItems.length > 0 && (
            <div className="border-t border-border bg-secondary/50 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className="flex w-full items-center justify-between gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  Checkout {selectedItems.length} {selectedItems.length === 1 ? "item" : "items"}
                </span>
                <span className="font-serif">{formatUsd(selectedTotal)}</span>
              </button>
            </div>
          )}

          {/* Staged photo preview */}
          {stagedPhoto && (
            <div className="border-t border-border px-3 pt-2 pb-1">
              <div className="flex items-center gap-2 text-xs text-[#1C1C1C]/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(stagedPhoto)}
                  alt=""
                  className="w-8 h-8 object-cover rounded-md"
                />
                <span className="text-[#C4714A]">
                  try: &ldquo;Which accessories would you recommend with this outfit?&rdquo;
                </span>
                <button
                  type="button"
                  onClick={() => setStagedPhoto(null)}
                  className="ml-auto text-[#1C1C1C]/30 hover:text-[#C4714A] transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit(input)
            }}
            className="flex flex-col gap-1.5 border-t border-border p-3"
          >
            <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || photoUploading || tryOnLoading}
              aria-label="Upload a photo for styling"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              ref={textInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy || tryOnLoading}
              placeholder={stagedPhoto ? "e.g. How would I look in the Coastline Linen Blazer?" : "e.g. an outfit for a spring wedding"}
              aria-label="Message Hem"
              className="h-11 flex-1 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={(busy || tryOnLoading) || (!input.trim() && !stagedPhoto)}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
            </div>
          </form>
        </div>
      )}

      {/* Expanded try-on image lightbox */}
      {tryOnExpanded && tryOnResult && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setTryOnExpanded(false)}
        >
          <div className="relative max-w-lg w-full max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tryOnResult.tryOnImage}
              alt="Virtual try-on expanded"
              className="w-full h-full object-contain bg-[#F5F0E8]"
            />
            <button
              type="button"
              onClick={() => setTryOnExpanded(false)}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1">
              <span>✦</span>
              <span>Virtual try-on</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
