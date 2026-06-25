"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { getProductById } from "@/lib/products"
import { MEMBERSHIP_CART_ID } from "@/lib/shipping"
import { notifyOrderPlaced } from "@/lib/membership"
import { QuickCheckoutModal } from "./quick-checkout-modal"
import { MembershipJoinGate } from "./membership-join-gate"
import { CheckoutModeProvider } from "./checkout-mode-context"
import type { CartItem } from "@/lib/types"

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  hasMembership: boolean
  addToCart: (productId: string, qty?: number) => void
  addMembership: () => void
  removeItem: (productId: string) => void
  setQty: (productId: string, qty: number) => void
  clear: () => void
  openCheckout: () => void
}

// Safe no-op fallback so components that reuse the storefront chrome outside the
// provider (e.g. the standalone /linen-lovers/* routes) can still call useCart
// without crashing — they simply get an empty cart and inert actions.
const NOOP: CartContextValue = {
  items: [],
  itemCount: 0,
  hasMembership: false,
  addToCart: () => {},
  addMembership: () => {},
  removeItem: () => {},
  setQty: () => {},
  clear: () => {},
  openCheckout: () => {},
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  return useContext(CartContext) ?? NOOP
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [joinGateOpen, setJoinGateOpen] = useState(false)

  const addToCart = useCallback((productId: string, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId)
      if (existing) {
        return prev.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + qty } : i))
      }
      return [...prev, { productId, quantity: qty }]
    })
    // Don't open checkout here — adding just updates the cart. The user opens the
    // slide-in checkout themselves via the cart icon.
    const p = getProductById(productId)
    if (p) toast.success(`${p.name} added to cart`)
  }, [])

  // Actually adds the Linen Lovers membership as its own cart line and opens the
  // cart so the member can complete the join (and any items they're buying) in
  // one go. Guarded so the membership can't be added twice.
  const startJoin = useCallback(() => {
    setItems((prev) =>
      prev.some((i) => i.productId === MEMBERSHIP_CART_ID)
        ? prev
        : [...prev, { productId: MEMBERSHIP_CART_ID, quantity: 1 }],
    )
    setCheckoutOpen(true)
    toast.success("Linen Lovers membership added to cart")
  }, [])

  // Public entry point for "Join Linen Lovers". Opens an email gate first so a
  // shopper who already has a membership is signed in to their existing account
  // instead of buying a second one (prevents duplicate memberships). Brand-new
  // emails fall through to startJoin via the gate's onProceed.
  const addMembership = useCallback(() => {
    setJoinGateOpen(true)
  }, [])

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
    )
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const clear = useCallback(() => setItems([]), [])
  const openCheckout = useCallback(() => setCheckoutOpen(true), [])

  // Parent-cart checkout finished: clear the cart AND let the My Linen Lovers
  // page know so it can refresh purchases/savings.
  const handleCheckoutComplete = useCallback(() => {
    clear()
    notifyOrderPlaced()
  }, [clear])

  const itemCount = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items])
  const hasMembership = useMemo(() => items.some((i) => i.productId === MEMBERSHIP_CART_ID), [items])

  const value = useMemo(
    () => ({ items, itemCount, hasMembership, addToCart, addMembership, removeItem, setQty, clear, openCheckout }),
    [items, itemCount, hasMembership, addToCart, addMembership, removeItem, setQty, clear, openCheckout],
  )

  return (
    <CheckoutModeProvider>
      <CartContext.Provider value={value}>
        {children}
        <MembershipJoinGate
          open={joinGateOpen}
          onOpenChange={setJoinGateOpen}
          onProceed={() => startJoin()}
        />
        <QuickCheckoutModal
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          cart={items}
          setQty={setQty}
          removeItem={removeItem}
          onComplete={handleCheckoutComplete}
        />
      </CartContext.Provider>
    </CheckoutModeProvider>
  )
}
