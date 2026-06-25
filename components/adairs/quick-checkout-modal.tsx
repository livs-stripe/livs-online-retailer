"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js"
import { Lock, Minus, Plus, Trash2, BadgePercent, Check, Loader2, ShoppingBag, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ProductImage } from "./product-image"
import { PaymentIcons } from "./payment-icons"
import { ElementsCheckout } from "./elements-checkout"
import { GiftCardField, type AppliedGiftCard } from "./gift-card-field"
import { useCheckoutMode } from "./checkout-mode-context"
import { getStripePromise } from "@/lib/stripe-client"
import { getProductById, isOnSale } from "@/lib/products"
import { formatAud } from "@/lib/format"
import {
  computeAgentPrice,
  FREE_SHIP_THRESHOLD_MEMBER,
  FREE_SHIP_THRESHOLD_GUEST,
  STANDARD_SHIPPING,
  MEMBERSHIP_CART_ID,
  MEMBERSHIP_PRICE,
  MEMBERSHIP_LABEL,
  MEMBERSHIP_TERM_YEARS,
  MEMBERSHIP_JOIN_DISCOUNT,
  MEMBERSHIP_WELCOME_DELAY_HOURS,
  isValidLinenNumber,
} from "@/lib/shipping"
import { LS_CUSTOMER_ID } from "@/lib/membership"
import type { CartItem } from "@/lib/types"

const round2 = (n: number) => Math.round(n * 100) / 100

interface QuickCheckoutModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cart: CartItem[]
  setQty: (productId: string, qty: number) => void
  removeItem: (productId: string) => void
  onComplete: () => void
}

type Phase = "review" | "payment"

export function QuickCheckoutModal({
  open,
  onOpenChange,
  cart,
  setQty,
  removeItem,
  onComplete,
}: QuickCheckoutModalProps) {
  const [phase, setPhase] = useState<Phase>("review")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  // When the cart contains the Linen Lovers membership we run a subscription-mode
  // Checkout; these hold the IDs returned so we can confirm the join afterwards.
  const [joinSessionId, setJoinSessionId] = useState<string | null>(null)
  const [joinCustomerId, setJoinCustomerId] = useState<string | null>(null)
  // A redeemed Adairs gift card (validated server-side and turned into a Stripe
  // coupon). It discounts the order; the remaining balance is charged via the
  // selected payment API.
  const [giftCard, setGiftCard] = useState<AppliedGiftCard | null>(null)

  // Linen Lovers detection. A signed-in member has their Stripe customer id in
  // localStorage; a guest can look theirs up by email to unlock member pricing.
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [memberEmail, setMemberEmail] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState("")
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupNotFound, setLookupNotFound] = useState(false)

  const stripePromise = useMemo(() => getStripePromise(), [])

  // The storefront-wide checkout mode chosen via the floating toggle. The
  // Elements (Payment Element) flow is used for ordinary purchases; joining
  // Linen Lovers always uses embedded subscription Checkout since custom payment
  // methods and PaymentIntents can't create the 2-year subscription.
  const { mode } = useCheckoutMode()

  // On open: detect a signed-in member and reset transient checkout state.
  useEffect(() => {
    if (!open) return
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_CUSTOMER_ID) : null
    if (saved) {
      setCustomerId(saved)
      setIsMember(true)
    } else {
      setCustomerId(null)
      setIsMember(false)
    }
    setMemberEmail(null)
    setEmailInput("")
    setLookupError(null)
    setLookupNotFound(false)
  }, [open])

  // Once the order is confirmed the cart is already empty, so don't linger on
  // the success screen — auto-close the pop-out shortly after. (The joining flow
  // redirects to My Linen Lovers instead, so it never reaches this state.)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => handleOpenChange(false), 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  // The membership is a sentinel cart line, not a catalog product, so split it
  // out: products drive the goods pricing while the membership drives the join.
  const isJoining = useMemo(() => cart.some((i) => i.productId === MEMBERSHIP_CART_ID), [cart])
  const productCart = useMemo(() => cart.filter((i) => i.productId !== MEMBERSHIP_CART_ID), [cart])

  // Use the Payment Element flow only for ordinary purchases (never the join).
  const elementsMode = mode === "elements" && !isJoining

  const priceItems = useMemo(
    () =>
      productCart.map((item) => {
        const p = getProductById(item.productId)
        return { price: p?.price ?? 0, quantity: item.quantity, onSale: p ? isOnSale(p) : false }
      }),
    [productCart],
  )

  const price = useMemo(() => {
    const base = computeAgentPrice({ items: priceItems, fulfillment: "delivery", isMember })
    // Joining adds the paid 2-year membership fee and the member free-shipping
    // threshold. The $20 welcome reward is NOT applied here — it arrives within
    // 48 hours of joining, so it never discounts this order.
    const membershipFee = isJoining ? MEMBERSHIP_PRICE : 0
    const effectiveMember = isMember || isJoining
    const freeShipThreshold = effectiveMember ? FREE_SHIP_THRESHOLD_MEMBER : FREE_SHIP_THRESHOLD_GUEST
    const hasGoods = priceItems.length > 0
    const shippingFree = !hasGoods || base.subtotal >= freeShipThreshold
    const shipping = hasGoods && !shippingFree ? STANDARD_SHIPPING : 0
    const total = round2(base.subtotal - base.memberDiscount + membershipFee + shipping)
    return {
      subtotal: base.subtotal,
      memberDiscount: base.memberDiscount,
      membershipFee,
      shipping,
      shippingFree,
      freeShipThreshold,
      total,
    }
  }, [priceItems, isMember, isJoining])

  // The gift card never applies to a membership join; for ordinary orders it's
  // capped at the order total, and the card collects whatever remains.
  const giftCardApplied = !isJoining && giftCard ? round2(Math.min(giftCard.balance, price.total)) : 0
  const payable = round2(Math.max(0, price.total - giftCardApplied))

  // Returning to the order view invalidates any started Stripe session so a
  // stale client secret is never reused after the order changes.
  const backToReview = useCallback(() => {
    setPhase("review")
    setClientSecret(null)
    setError(null)
    setLoading(false)
    setJoinSessionId(null)
    setJoinCustomerId(null)
  }, [])

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset checkout phase on close; member detection re-runs on next open.
      setPhase("review")
      setClientSecret(null)
      setError(null)
      setLoading(false)
      setDone(false)
      setJoinSessionId(null)
      setJoinCustomerId(null)
      setGiftCard(null)
    }
    onOpenChange(next)
  }

  async function lookupMember() {
    const value = emailInput.trim()
    // Accept EITHER a Linen Lovers number (e.g. "LL-123") OR the join email, so
    // members can apply their discount in the room-stylist checkout the same way
    // they can elsewhere on the site.
    const looksLikeMemberId = isValidLinenNumber(value) && !value.includes("@")
    if (!looksLikeMemberId && !value.includes("@")) {
      setLookupError("Enter your member number (e.g. LL-123) or email.")
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    setLookupNotFound(false)
    try {
      const res = await fetch("/api/membership/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(looksLikeMemberId ? { memberId: value } : { email: value }),
      })
      const data = await res.json()
      if (res.ok && data.customerId) {
        setCustomerId(data.customerId)
        setIsMember(true)
        // Only surface an email in the "applied for …" label; for a member-number
        // lookup there may be no email, and we never want to show the LL number here.
        setMemberEmail(data.email ?? null)
        toast.success("Linen Lovers discount applied")
      } else {
        setLookupNotFound(true)
      }
    } catch {
      setLookupError("Couldn't check that email. Please try again.")
    } finally {
      setLookupLoading(false)
    }
  }

  const handlePaid = useCallback(() => {
    // Joining: persist the new member and go straight to My Linen Lovers. The
    // session_id lets that page confirm the membership and bill any cart
    // products on a separate invoice — no intermediate welcome page.
    if (isJoining) {
      if (joinCustomerId) localStorage.setItem(LS_CUSTOMER_ID, joinCustomerId)
      onComplete()
      if (joinSessionId) {
        window.location.assign(`/linen-lovers/membership?session_id=${encodeURIComponent(joinSessionId)}`)
        return
      }
    }
    setDone(true)
    onComplete()
  }, [isJoining, joinCustomerId, joinSessionId, onComplete])

  async function startPayment() {
    setPhase("payment")
    // The Elements flow creates its own PaymentIntent inside <ElementsCheckout>,
    // so there's no Checkout Session to fetch here.
    if (elementsMode) {
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // Joining flow: subscription-mode Checkout that creates the customer +
      // 2-year auto-renewing subscription. The subscription's first invoice is
      // membership-only ($19.95); any cart products are billed on a SEPARATE
      // one-time invoice after completion (see /api/checkout-session).
      if (isJoining) {
        const res = await fetch("/api/membership/join-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cartItems: productCart,
            shipping: price.shipping,
            shippingLabel: price.shippingFree ? "Free standard shipping — Linen Lovers" : "Standard Delivery",
          }),
        })
        const data = await res.json()
        if (data.clientSecret && stripePromise) {
          setClientSecret(data.clientSecret)
          setJoinSessionId(data.sessionId ?? null)
          setJoinCustomerId(data.customerId ?? null)
        } else {
          setError(data.error ?? "We couldn't start secure checkout. Please try again.")
        }
        return
      }

      const savedCustomerId = customerId ?? (typeof window !== "undefined" ? localStorage.getItem(LS_CUSTOMER_ID) : null)
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: cart,
          shipping: price.shipping,
          shippingLabel: price.shippingFree ? "Free standard shipping — Linen Lovers" : "Standard Delivery",
          discountAmount: price.memberDiscount,
          discountLabel: "Linen Lovers member discount",
          membershipFee: 0,
          customerId: savedCustomerId,
          // Member savings recorded on the PaymentIntent so the dashboard can
          // total "Saved with membership" from real purchases over time.
          memberDiscountAmount: price.memberDiscount,
          // The redeemed gift card coupon (Coupons API). The Checkout Session
          // applies it as a discount so the card collects the remaining balance.
          giftCardCouponId: giftCard?.couponId ?? null,
        }),
      })
      const data = await res.json()
      // The saved member id was stale (customer no longer exists in Stripe).
      // Clear it so future checkouts run cleanly as a guest instead of failing.
      if (data.customerInvalid && typeof window !== "undefined") {
        localStorage.removeItem(LS_CUSTOMER_ID)
        setCustomerId(null)
      }
      if (data.clientSecret && stripePromise) {
        setClientSecret(data.clientSecret)
      } else {
        setError(data.error ?? "We couldn't start secure checkout. Please try again.")
      }
    } catch {
      setError("We couldn't start secure checkout. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const isEmpty = cart.length === 0

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
            <SheetTitle className="text-base font-medium text-foreground">Secure Checkout</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
                <Check className="h-7 w-7 text-accent" aria-hidden="true" />
              </span>
              <h3 className="font-serif text-2xl text-foreground">
                {isJoining ? "Welcome to Linen Lovers" : "Order confirmed"}
              </h3>
              <p className="max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
                {isJoining
                  ? `Your ${MEMBERSHIP_TERM_YEARS}-year membership is active and renews automatically. Enjoy members-only pricing and free-shipping perks.`
                  : isMember
                    ? "Thanks, Linen Lover! Your member savings have been added to your account so you can track how much you save over time."
                    : "Thanks for your order! A confirmation is on its way to your email."}
              </p>
              <Button
                onClick={() => handleOpenChange(false)}
                className="mt-2 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
              >
                Continue shopping
              </Button>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            </div>
          ) : phase === "review" ? (
            <div className="flex flex-col gap-5">
              {/* Cart line items */}
              <ul className="flex flex-col gap-3">
                {cart.map((item) => {
                  if (item.productId === MEMBERSHIP_CART_ID) {
                    return (
                      <li key={item.productId} className="flex items-center gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-linen/30 bg-linen/10 text-linen">
                          <Sparkles className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{MEMBERSHIP_LABEL}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {MEMBERSHIP_TERM_YEARS}-year membership · auto-renews
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{formatAud(MEMBERSHIP_PRICE)}</span>
                          <button
                            type="button"
                            onClick={() => removeItem(item.productId)}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label="Remove Linen Lovers membership"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    )
                  }
                  const p = getProductById(item.productId)
                  if (!p) return null
                  return (
                    <li key={item.productId} className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border">
                        <ProductImage src={p.image} alt={p.name} name={p.name} sizes="56px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-sm text-foreground">{formatAud(p.price)}</span>
                          {isOnSale(p) && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Sale
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQty(item.productId, item.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
                          aria-label={`Decrease ${p.name} quantity`}
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <span className="w-5 text-center text-sm tabular-nums text-foreground">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.productId, item.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
                          aria-label={`Increase ${p.name} quantity`}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          aria-label={`Remove ${p.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Linen Lovers */}
              <div className="rounded-2xl border border-border bg-card p-4">
                {isJoining ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="h-4 w-4 shrink-0 text-linen" aria-hidden="true" />
                      You&apos;re joining Linen Lovers
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Your {MEMBERSHIP_TERM_YEARS}-year membership starts at checkout and renews automatically. Your{" "}
                      {formatAud(MEMBERSHIP_JOIN_DISCOUNT)} welcome reward arrives within {MEMBERSHIP_WELCOME_DELAY_HOURS}{" "}
                      hours of joining.
                    </p>
                  </div>
                ) : isMember ? (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <BadgePercent className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      Linen Lovers discount applied{memberEmail ? ` for ${memberEmail}` : ""} — 10% off full price, 5%
                      off sale.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <BadgePercent className="h-4 w-4 text-accent" aria-hidden="true" />
                      Already a Linen Lover?
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Enter your member number (e.g. LL-123) or email to apply your member discount (10% off full price,
                      5% off sale items) and track your savings.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value)
                          if (lookupError) setLookupError(null)
                          if (lookupNotFound) setLookupNotFound(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            lookupMember()
                          }
                        }}
                        placeholder="LL-123 or you@email.com"
                        aria-label="Linen Lovers number or email"
                        disabled={lookupLoading}
                        className="h-10 flex-1 rounded-xl bg-background"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={lookupMember}
                        disabled={lookupLoading || emailInput.trim().length === 0}
                        className="h-10 rounded-xl px-4"
                      >
                        {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Apply"}
                      </Button>
                    </div>
                    {lookupError && <p className="text-[11px] text-destructive">{lookupError}</p>}
                    {lookupNotFound && (
                      <p className="text-[11px] text-muted-foreground">
                        No membership found for that number or email. You can continue as a guest or join Linen Lovers
                        to start saving.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Gift card — redeemed as a Stripe coupon, not a payment method */}
              {!isJoining && (
                <GiftCardField
                  applied={giftCard}
                  onApplied={setGiftCard}
                  onRemove={() => setGiftCard(null)}
                  disabled={loading}
                />
              )}

              {/* Price breakdown */}
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="text-foreground">{formatAud(price.subtotal)}</dd>
                </div>
                {price.memberDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-accent">Linen Lovers discount</dt>
                    <dd className="text-accent">{`\u2212${formatAud(price.memberDiscount)}`}</dd>
                  </div>
                )}
                {price.membershipFee > 0 && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{`Membership (${MEMBERSHIP_TERM_YEARS}-year)`}</dt>
                    <dd className="text-foreground">{formatAud(price.membershipFee)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="text-foreground">{price.shipping === 0 ? "Free" : formatAud(price.shipping)}</dd>
                </div>
                {!isMember && !isJoining && !price.shippingFree && (
                  <p className="text-[11px] text-muted-foreground">
                    Linen Lovers get free standard delivery on orders over {formatAud(FREE_SHIP_THRESHOLD_MEMBER)}.
                  </p>
                )}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 font-medium">
                  <dt className="text-foreground">{giftCardApplied > 0 ? "Order total" : "Total"}</dt>
                  <dd className="font-serif text-lg text-foreground">{formatAud(price.total)}</dd>
                </div>
                {giftCardApplied > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <dt className="flex items-center gap-1.5 text-accent">
                        Gift card
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium">Coupons API</span>
                      </dt>
                      <dd className="text-accent">{`\u2212${formatAud(giftCardApplied)}`}</dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2 font-medium">
                      <dt className="flex items-center gap-1.5 text-foreground">
                        Pay by card
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {elementsMode ? "PaymentIntents API" : "Checkout Sessions API"}
                        </span>
                      </dt>
                      <dd className="font-serif text-lg text-foreground">{formatAud(payable)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Always-visible itemized summary so every cart item stays in view —
                  Stripe's own checkout collapses line items under "View details",
                  which hid the products behind the membership subscription. */}
              <PaymentSummary
                productCart={productCart}
                price={price}
                isJoining={isJoining}
                giftCardApplied={giftCardApplied}
                payable={payable}
              />
              {elementsMode ? (
                <ElementsCheckout
                  total={payable}
                  giftCardAmount={giftCardApplied}
                  payload={{
                    cartItems: productCart,
                    shipping: price.shipping,
                    shippingLabel: price.shippingFree ? "Free standard shipping — Linen Lovers" : "Standard Delivery",
                    discountAmount: price.memberDiscount,
                    discountLabel: "Linen Lovers member discount",
                    membershipFee: 0,
                    customerId,
                    memberDiscountAmount: price.memberDiscount,
                    giftCardCouponId: giftCard?.couponId ?? null,
                    giftCardAmount: giftCardApplied,
                  }}
                  onPaid={handlePaid}
                />
              ) : loading ? (
                <div className="flex flex-col gap-3">
                  <div className="animate-shimmer h-12 rounded-xl" />
                  <div className="animate-shimmer h-12 rounded-xl" />
                  <div className="animate-shimmer h-12 w-1/2 rounded-xl" />
                </div>
              ) : error || !clientSecret || !stripePromise ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {error ?? "We couldn't start secure checkout. Please try again."}
                  </p>
                  <Button variant="outline" onClick={startPayment} className="rounded-full">
                    Try again
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl">
                  <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete: handlePaid }}>
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && !isEmpty && (
          <div className="border-t border-border px-5 py-4">
            {phase === "review" ? (
              <div className="flex flex-col gap-3">
                <Button
                  onClick={startPayment}
                  className="h-12 rounded-xl bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                  Continue to payment {`\u00B7`} {formatAud(payable)}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <PaymentIcons />
                {!loading && (
                  <button
                    type="button"
                    onClick={backToReview}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to order
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// A compact, always-visible recap of everything being purchased, shown above the
// Stripe payment UI during the payment phase. Stripe's embedded checkout collapses
// its own line items behind a "View details" toggle (and a membership subscription
// can dominate that summary), so we surface the full itemized order ourselves to
// guarantee every product, the membership, discounts and the total stay in view.
function PaymentSummary({
  productCart,
  price,
  isJoining,
  giftCardApplied,
  payable,
}: {
  productCart: CartItem[]
  price: {
    subtotal: number
    memberDiscount: number
    membershipFee: number
    shipping: number
    shippingFree: boolean
    total: number
  }
  isJoining: boolean
  giftCardApplied: number
  payable: number
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Order summary</p>
      <ul className="flex flex-col gap-2.5">
        {productCart.map((item) => {
          const p = getProductById(item.productId)
          if (!p) return null
          return (
            <li key={item.productId} className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border">
                <ProductImage src={p.image} alt={p.name} name={p.name} sizes="40px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-foreground">
                {formatAud(p.price * item.quantity)}
              </span>
            </li>
          )
        })}
        {isJoining && (
          <li className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-linen/30 bg-linen/10 text-linen">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{MEMBERSHIP_LABEL}</p>
              <p className="text-xs text-muted-foreground">{MEMBERSHIP_TERM_YEARS}-year · auto-renews</p>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-foreground">{formatAud(price.membershipFee)}</span>
          </li>
        )}
      </ul>

      <dl className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-foreground">{formatAud(price.subtotal)}</dd>
        </div>
        {price.membershipFee > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{`Membership (${MEMBERSHIP_TERM_YEARS}-year)`}</dt>
            <dd className="text-foreground">{formatAud(price.membershipFee)}</dd>
          </div>
        )}
        {price.memberDiscount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-accent">Linen Lovers discount</dt>
            <dd className="text-accent">{`\u2212${formatAud(price.memberDiscount)}`}</dd>
          </div>
        )}
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="text-foreground">{price.shipping === 0 ? "Free" : formatAud(price.shipping)}</dd>
        </div>
        {giftCardApplied > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-accent">Gift card</dt>
            <dd className="text-accent">{`\u2212${formatAud(giftCardApplied)}`}</dd>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2 font-medium">
          <dt className="text-foreground">Total</dt>
          <dd className="font-serif text-base text-foreground">{formatAud(payable)}</dd>
        </div>
      </dl>
    </div>
  )
}
