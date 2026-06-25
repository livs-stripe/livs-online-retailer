"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { LS_CUSTOMER_ID } from "@/lib/membership"

const BENEFITS = [
  "Save up to 10% always",
  "Free standard delivery (on orders over $50)",
  "Extended returns (90 days)",
  "$20 welcome reward",
  "Exclusive offers",
  "Birthday reward",
]

/**
 * Edit Club membership promo, styled to drop into the product grid as a
 * single tile. It is interleaved sporadically among products in the category
 * pages so shoppers keep encountering the membership offer while browsing.
 */
export function EditClubTile({ onEditClub }: { onEditClub: () => void }) {
  // A logged-in Edit Club member is identified by their saved Stripe customer id, the
  // same signal the membership page uses. Members see "Renew membership";
  // everyone else sees "Join The Edit Club".
  const [isMember, setIsMember] = useState(false)

  useEffect(() => {
    setIsMember(Boolean(localStorage.getItem(LS_CUSTOMER_ID)))
  }, [])

  return (
    <div className="flex flex-col rounded-md border border-blush bg-blush/40 p-5 text-center shadow-sm sm:p-6">
      <h3 className="font-serif text-2xl uppercase tracking-[0.12em] text-accent">The Edit Club</h3>

      <p className="mt-3 text-pretty font-serif text-lg leading-snug text-accent">
        Join today and enjoy member exclusive pricing and benefits
      </p>

      <ul className="mx-auto mt-4 flex flex-col gap-2 text-left text-sm text-accent">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{benefit}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-3 pt-6">
        <button
          type="button"
          onClick={onEditClub}
          className="border-b border-accent pb-0.5 text-sm font-semibold uppercase tracking-wide text-accent transition-opacity hover:opacity-70"
        >
          Learn more
        </button>
        <button
          type="button"
          onClick={onEditClub}
          className="border-b border-accent pb-0.5 text-sm font-semibold uppercase tracking-wide text-accent transition-opacity hover:opacity-70"
        >
          {isMember ? "Renew membership" : "Join The Edit Club"}
        </button>
      </div>
    </div>
  )
}
