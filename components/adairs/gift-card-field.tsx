"use client"

import { useState } from "react"
import { Gift, AlertCircle, Check, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatAud } from "@/lib/format"
import { GIFT_CARD_NUMBER_LENGTH } from "@/lib/checkout-config"

export interface AppliedGiftCard {
  couponId: string | null
  balance: number
  last4: string
  demoMode: boolean
}

interface GiftCardFieldProps {
  applied: AppliedGiftCard | null
  onApplied: (card: AppliedGiftCard) => void
  onRemove: () => void
  disabled?: boolean
}

// Gift card redemption entry. On apply it calls /api/gift-card/apply, which
// validates the card server-side and mints a Stripe coupon (Coupons API). The
// returned coupon then discounts the order at checkout.
export function GiftCardField({ applied, onApplied, onRemove, disabled }: GiftCardFieldProps) {
  const [number, setNumber] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function apply() {
    if (number.length !== GIFT_CARD_NUMBER_LENGTH) {
      setError(`Please enter a valid ${GIFT_CARD_NUMBER_LENGTH}-digit gift card number.`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/gift-card/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, pin }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        onApplied({
          couponId: data.couponId ?? null,
          balance: data.balance,
          last4: data.last4,
          demoMode: Boolean(data.demoMode),
        })
        setNumber("")
        setPin("")
      } else {
        setError(data.error ?? "Couldn't apply that gift card.")
      }
    } catch {
      setError("Couldn't apply that gift card. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (applied) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Gift className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            Gift card ****{applied.last4} applied
          </p>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            aria-label="Remove gift card"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          {formatAud(applied.balance)} balance redeemed as a Stripe coupon (Coupons API).
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
        <Gift className="h-4 w-4 text-accent" aria-hidden="true" />
        Aster & Hem Gift Card
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Redeem your gift card balance against this order. The remaining balance is charged to your card.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={number}
          onChange={(e) => {
            setNumber(e.target.value.replace(/[^\d]/g, "").slice(0, GIFT_CARD_NUMBER_LENGTH))
            if (error) setError(null)
          }}
          inputMode="numeric"
          placeholder="Enter gift card number"
          aria-label="Gift card number"
          disabled={loading || disabled}
          className="h-11 flex-1 rounded-xl bg-background"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              apply()
            }
          }}
        />
        <Input
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
            if (error) setError(null)
          }}
          inputMode="numeric"
          placeholder="Enter pin"
          aria-label="Gift card PIN"
          disabled={loading || disabled}
          className="h-11 rounded-xl bg-background sm:w-28"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              apply()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={apply}
          disabled={loading || disabled || number.length === 0}
          className="h-11 rounded-xl px-5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Apply"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          Demo: any 8-digit number works, PIN 0000 is approved.
        </p>
      )}
    </div>
  )
}
