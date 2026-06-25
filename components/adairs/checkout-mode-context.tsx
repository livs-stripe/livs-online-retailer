"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_CHECKOUT_MODE, LS_CHECKOUT_MODE, type CheckoutMode } from "@/lib/checkout-config"

interface CheckoutModeContextValue {
  mode: CheckoutMode
  setMode: (mode: CheckoutMode) => void
}

const CheckoutModeContext = createContext<CheckoutModeContextValue>({
  mode: DEFAULT_CHECKOUT_MODE,
  setMode: () => {},
})

export function useCheckoutMode(): CheckoutModeContextValue {
  return useContext(CheckoutModeContext)
}

// Provides the storefront-wide checkout mode (embedded Checkout vs. Elements).
// The choice is persisted to localStorage so it survives reloads while
// demoing both flows side by side.
export function CheckoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<CheckoutMode>(DEFAULT_CHECKOUT_MODE)

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = localStorage.getItem(LS_CHECKOUT_MODE)
    if (saved === "embedded" || saved === "elements") setModeState(saved)
  }, [])

  const setMode = useCallback((next: CheckoutMode) => {
    setModeState(next)
    if (typeof window !== "undefined") localStorage.setItem(LS_CHECKOUT_MODE, next)
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return <CheckoutModeContext.Provider value={value}>{children}</CheckoutModeContext.Provider>
}
