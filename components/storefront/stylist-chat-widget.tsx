"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Sparkles, Send, X, MessageCircle, Plus, Check, ShoppingBag, ShieldCheck, Camera } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatUsd } from "@/lib/format"
import { LS_CUSTOMER_ID, notifyOrderPlaced } from "@/lib/membership"
import { ProductImage } from "./product-image"
import { AgentCheckoutPanel } from "./agent-checkout-panel"
import { useCart } from "./cart-context"
import type { AgentOrder, Product } from "@/lib/types"

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

// Floating conversational shopping agent. The buyer chats in plain language; the
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
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null)
  // Demo flow state
  const [demoPurchases, setDemoPurchases] = useState<DemoPurchase[]>([])
  const [demoMode, setDemoMode] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const [demoMessages, setDemoMessages] = useState<DemoMessage[]>([])
  const [showUploadPrompt, setShowUploadPrompt] = useState(false)
  const [postPurchaseMsg, setPostPurchaseMsg] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/stylist-chat" }),
  })

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
    if (!value || busy) return
    // Intercept /demo command
    if (value === "/demo") {
      setInput("")
      runDemoFlow()
      return
    }
    setLastOrder(null)
    // Pass the member's customer id per-message so the agent can pull their
    // purchase history. Sent on the message body so it stays current.
    void sendMessage({ text: value }, { body: { customerId } })
    setInput("")
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
      setVisionResult({ analysis: "Sorry, I couldn't analyse that photo. Try again?", recommendations: [], })
    } finally {
      setPhotoUploading(false)
      scrollToEnd()
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handlePhotoUpload(file)
    e.target.value = ""
  }

  function toggleSelect(p: ChatProduct) {
    setSelection((prev) => {
      const next = { ...prev }
      if (next[p.id]) {
        delete next[p.id]
        // Keep the main cart in sync — remove what the shopper deselects in chat.
        removeFromCart(p.id)
      } else {
        next[p.id] = p as Product
        // Mirror the addition into the storefront cart so both stay in sync.
        addToCart(p.id, 1)
      }
      return next
    })
  }

  function addVisionProduct(sku: string) {
    addToCart(sku, 1)
  }

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
            {messages.length === 0 && !demoMode ? (
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
                      <p>Hi Sophie — welcome back to Aster &amp; Hem.</p>
                    ) : isMember ? (
                      <p>
                        Welcome back, {memberName ?? "there"}. Ask me anything about style inspiration or your
                        recent purchases — or try one of these:
                      </p>
                    ) : (
                      <p>
                        Hi, I&apos;m Hem, your Aster &amp; Hem personal stylist. Tell me what you&apos;re shopping for — an
                        occasion, a style, or a piece you love — and I&apos;ll curate an edit you can buy right here. Try
                        one of these:
                      </p>
                    )}
                  </div>
                </div>

                {/* Purchase history cards */}
                {demoPurchases.length > 0 && (
                  <div className="ml-9 flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Here&apos;s what you&apos;ve picked up recently:</p>
                    {demoPurchases.map((p, i) => (
                      <div key={i} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{p.description}</span>
                          <span className="text-muted-foreground">${p.amount.toFixed(0)}</span>
                        </div>
                        <p className="mt-0.5 text-muted-foreground">{p.date}</p>
                      </div>
                    ))}
                    <div className="mt-1 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      <p>You&apos;re building a strong work wardrobe. Want me to find what&apos;s missing — or upload a photo and I&apos;ll style you from there?</p>
                    </div>
                  </div>
                )}

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
                      <p>Hi Sophie — welcome back to Aster &amp; Hem.</p>
                    </div>
                    {demoPurchases.length > 0 && (
                      <div className="w-full flex flex-col gap-2">
                        <p className="text-xs font-medium text-muted-foreground ml-2">Here&apos;s what you&apos;ve picked up recently:</p>
                        {demoPurchases.map((p, i) => (
                          <div key={i} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-foreground">{p.description}</span>
                              <span className="text-muted-foreground">${p.amount.toFixed(0)}</span>
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{p.date}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                      <p>You&apos;re building a strong work wardrobe. Want me to find what&apos;s missing — or upload a photo and I&apos;ll style you from there?</p>
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
                            {products.map((p) => {
                              const added = Boolean(selection[p.id])
                              return (
                                <div
                                  key={p.id}
                                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-background"
                                >
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
                                    <div className="mt-auto flex items-center justify-between pt-1.5">
                                      <span className="font-serif text-sm text-foreground">{formatUsd(p.price)}</span>
                                      <button
                                        type="button"
                                        onClick={() => toggleSelect(p)}
                                        aria-pressed={added}
                                        aria-label={added ? `Remove ${p.name}` : `Add ${p.name}`}
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                                          added
                                            ? "bg-accent text-accent-foreground"
                                            : "border border-border bg-background text-foreground hover:bg-secondary",
                                        )}
                                      >
                                        {added ? (
                                          <>
                                            <Check className="h-3 w-3" aria-hidden="true" />
                                            Added
                                          </>
                                        ) : (
                                          <>
                                            <Plus className="h-3 w-3" aria-hidden="true" />
                                            Add
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
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
                        Order placed securely with Stripe
                      </span>
                      <p className="mt-1.5 leading-relaxed">
                        Done! Your order of {lastOrder.itemCount}{" "}
                        {lastOrder.itemCount === 1 ? "item" : "items"} for{" "}
                        <span className="font-medium">{formatUsd(lastOrder.amount)}</span> is placed — paid securely with
                        Stripe. Anything else I can style for you?
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
                {demoMode && showUploadPrompt && !visionResult && !photoUploading && (
                  <li className="flex items-start">
                    <div className="w-full rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 px-4 py-4 text-center">
                      <Camera className="mx-auto h-6 w-6 text-accent" aria-hidden="true" />
                      <p className="mt-2 text-sm font-medium text-foreground">Upload a photo to continue the demo</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
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
                      <p>You&apos;re all set, Sophie. It&apos;ll be with you soon. Want to see what pairs with it?</p>
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

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit(input)
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
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
              disabled={busy || photoUploading}
              aria-label="Upload a photo for styling"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="e.g. an outfit for a spring wedding"
              aria-label="Message Hem"
              className="h-11 flex-1 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
