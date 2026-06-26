"use client"

import { useEffect, useState } from "react"
import { Check, Truck, Gift, Tag, Cake, Star, Sparkles, ArrowRight, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SiteChrome } from "./site-chrome"
import { StylistChatWidget } from "./stylist-chat-widget"
import { useCart } from "./cart-context"
import type { ShopDestination, MenuKey } from "@/lib/categories"
import { formatAud } from "@/lib/format"
import { DEMO_USER } from "@/lib/demo-user"
import { DEMO_MEMBERSHIP } from "@/lib/demo-membership"
import {
  MEMBERSHIP_PRICE,
  MEMBERSHIP_TERM_YEARS,
  MEMBERSHIP_JOIN_DISCOUNT,
  MEMBERSHIP_WELCOME_DELAY_HOURS,
  FREE_SHIP_THRESHOLD_MEMBER,
} from "@/lib/shipping"

interface Purchase {
  date: string
  items: string[]
  description: string
  amount: number
}

interface EditClubPageProps {
  onHome: () => void
  onNavigate: (key: MenuKey) => void
  onShop: (dest: ShopDestination) => void
  onEditClub: () => void
}

const BENEFITS = [
  {
    icon: Tag,
    title: "Members-only pricing",
    body: "Always pay less with exclusive The Edit Club prices across thousands of products.",
  },
  {
    icon: Truck,
    title: "Free shipping that pays for itself",
    body: `Free standard delivery on every order over ${formatAud(FREE_SHIP_THRESHOLD_MEMBER)} — no minimum stress.`,
  },
  {
    icon: Cake,
    title: "Birthday treat",
    body: "Celebrate with a special birthday offer to spend on whatever you love most.",
  },
  {
    icon: Gift,
    title: "Early access to sales",
    body: "Shop major sales and new collections before everyone else, while stock lasts.",
  },
  {
    icon: Star,
    title: "Exclusive offers",
    body: "Unlock members-only promotions, bonus gifts and seasonal rewards all year round.",
  },
  {
    icon: Sparkles,
    title: "Room Stylist perks",
    body: "Save your curated looks and get member pricing applied automatically at checkout.",
  },
]

export function EditClubPage({
  onHome,
  onNavigate,
  onShop,
  onEditClub,
}: EditClubPageProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/demo/purchases")
        if (res.ok) {
          const data = await res.json()
          setPurchases(data.purchases ?? [])
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteChrome
        onNavigate={onNavigate}
        onHome={onHome}
        onEditClub={onEditClub}
        onSearch={(q) => onShop({ type: "search", query: q })}
        activeMenu="linen"
      />

      <main className="flex-1">
        {/* Member header */}
        <section className="border-b border-border bg-[#C4714A]">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white text-xl font-semibold">
                {DEMO_USER.initials}
              </div>
              <div className="text-white">
                <h1 className="font-serif text-2xl font-medium">{DEMO_USER.name}</h1>
                <p className="text-sm text-white/80">
                  {DEMO_MEMBERSHIP.tier} Member · {DEMO_MEMBERSHIP.memberId}
                </p>
              </div>
              <div className="ml-auto text-right text-white">
                <p className="text-2xl font-semibold">{DEMO_MEMBERSHIP.pointsBalance}</p>
                <p className="text-xs text-white/70">Edit Club Points</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {DEMO_MEMBERSHIP.perks.map(perk => (
                <span key={perk} className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
                  {perk}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Recent purchases */}
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex items-center gap-2 mb-6">
            <ShoppingBag className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="font-serif text-xl text-foreground">Recent Purchases</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
              ))}
            </div>
          ) : purchases.length > 0 ? (
            <div className="space-y-3">
              {purchases.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{p.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.date}</p>
                  </div>
                  <span className="shrink-0 font-serif text-sm font-semibold text-foreground">
                    A${p.amount.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-secondary/50 px-6 py-10 text-center">
              <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">
                No purchases yet. Start shopping and your order history will appear here.
              </p>
              <Button
                size="sm"
                onClick={() => onNavigate("Workwear")}
                className="mt-4 rounded-full"
              >
                Browse Workwear
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </section>

        {/* Benefits summary */}
        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <h2 className="font-serif text-xl text-foreground mb-4">Your Benefits</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <benefit.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{benefit.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{benefit.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <StylistChatWidget />
    </div>
  )
}
