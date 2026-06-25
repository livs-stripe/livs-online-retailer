"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Truck, Gift, Tag, Cake, Star, Sparkles, ArrowRight, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SiteChrome } from "./site-chrome"
import { StylistChatWidget } from "./stylist-chat-widget"
import { useCart } from "./cart-context"
import type { ShopDestination, MenuKey } from "@/lib/categories"
import { formatAud } from "@/lib/format"
import { LS_CUSTOMER_ID, LS_SUBSCRIPTION_ID } from "@/lib/membership"
import {
  MEMBERSHIP_PRICE,
  MEMBERSHIP_TERM_YEARS,
  MEMBERSHIP_JOIN_DISCOUNT,
  MEMBERSHIP_WELCOME_DELAY_HOURS,
  FREE_SHIP_THRESHOLD_MEMBER,
} from "@/lib/shipping"

interface LinenLoversPageProps {
  onHome: () => void
  onNavigate: (key: MenuKey) => void
  onShop: (dest: ShopDestination) => void
  onLinenLovers: () => void
}

const BENEFITS = [
  {
    icon: Tag,
    title: "Members-only pricing",
    body: "Always pay less with exclusive Linen Lovers prices across thousands of products.",
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

export function LinenLoversPage({
  onHome,
  onNavigate,
  onShop,
  onLinenLovers,
}: LinenLoversPageProps) {
  const router = useRouter()
  const { addMembership } = useCart()
  const [isMember, setIsMember] = useState(false)

  // Remember returning members on this device so we can swap the join CTAs for
  // a "view membership" experience.
  useEffect(() => {
    setIsMember(Boolean(localStorage.getItem(LS_CUSTOMER_ID)))
  }, [])

  // Joining now adds the membership to the cart and opens the slide-in checkout,
  // so members can complete the join (and anything they're buying) in one go —
  // no hosted Stripe redirect.
  const handleJoin = () => {
    addMembership()
  }

  const viewMembership = () => router.push("/linen-lovers/membership")

  const signOut = () => {
    localStorage.removeItem(LS_CUSTOMER_ID)
    localStorage.removeItem(LS_SUBSCRIPTION_ID)
    setIsMember(false)
    toast("Signed out of your membership on this device.")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteChrome
        onNavigate={onNavigate}
        onHome={onHome}
        onLinenLovers={onLinenLovers}
        onSearch={(q) => onShop({ type: "search", query: q })}
        activeMenu="linen"
      />

      <main className="flex-1">
        {/* Returning member banner */}
        {isMember && (
          <div className="border-b border-border bg-secondary/60">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-linen/15 text-linen">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mr-auto text-sm text-foreground">
                Welcome back, Linen Lover — your member pricing is active.
              </p>
              <Button
                size="sm"
                onClick={viewMembership}
                className="rounded-full bg-linen px-4 text-linen-foreground hover:bg-linen/90"
              >
                View my membership
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Not you?
              </button>
            </div>
          </div>
        )}

        {/* Hero */}
        <section className="relative overflow-hidden bg-linen">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-16">
            <div className="text-linen-foreground">
              <span className="inline-block rounded-full bg-linen-foreground/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                Rewards Membership
              </span>
              <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                Linen Lovers
              </h1>
              <p className="mt-2 font-serif text-2xl italic">Always save more.</p>
              <p className="mt-5 max-w-md text-pretty text-sm leading-relaxed text-linen-foreground/90">
                Join Australia&apos;s most-loved homewares club for {MEMBERSHIP_TERM_YEARS} years of members-only
                pricing, free shipping perks, birthday treats and early access to every sale.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {isMember ? (
                  <Button
                    size="lg"
                    onClick={viewMembership}
                    className="rounded-full bg-linen-foreground px-7 text-linen hover:bg-linen-foreground/90"
                  >
                    View my membership
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={handleJoin}
                    className="group rounded-full border-0 bg-[#1B1B19] px-8 text-base font-semibold text-[#F5EFE6] shadow-lg shadow-[#1B1B19]/25 ring-1 ring-[#1B1B19]/10 transition-all duration-200 hover:bg-[#1B1B19] hover:shadow-xl hover:shadow-[#1B1B19]/30 hover:-translate-y-0.5 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[#1B1B19]/40"
                  >
                    Join for {formatAud(MEMBERSHIP_PRICE)}
                    <ArrowRight
                      className="ml-1.5 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => onNavigate("Sale")}
                  className="rounded-full border-linen-foreground/40 bg-transparent px-7 text-linen-foreground hover:bg-linen-foreground/10 hover:text-linen-foreground"
                >
                  Shop the sale
                </Button>
              </div>
              {!isMember && (
                <p className="mt-4 text-sm text-linen-foreground/90">
                  Already a member?{" "}
                  <button
                    type="button"
                    onClick={viewMembership}
                    className="font-semibold text-linen-foreground underline underline-offset-4 transition-opacity hover:opacity-80"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>

            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-linen-foreground/20 shadow-lg">
              <Image
                src="/home/hero-bedroom.png"
                alt="Styled bedroom with layered linen bedding and warm neutral homewares"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* Membership value bar */}
        <section className="border-b border-border bg-secondary/50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 text-center text-sm sm:px-6">
            <span className="font-medium text-foreground">
              {MEMBERSHIP_TERM_YEARS}-year membership
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-foreground">
              {formatAud(MEMBERSHIP_PRICE)} one-off
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-foreground">
              {formatAud(MEMBERSHIP_JOIN_DISCOUNT)} welcome reward within {MEMBERSHIP_WELCOME_DELAY_HOURS} hours of
              joining
            </span>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-linen">Membership benefits</p>
            <h2 className="mt-3 text-balance font-serif text-3xl text-foreground sm:text-4xl">
              Everything a Linen Lover gets
            </h2>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
              One membership, two years of rewards across bedroom, bathroom, living and more.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-linen/15 text-linen">
                  <benefit.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-serif text-lg text-foreground">{benefit.title}</h3>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Join CTA card */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid items-stretch md:grid-cols-2">
              <div className="flex flex-col justify-center gap-5 p-8 sm:p-10">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-linen">Join today</p>
                  <h2 className="mt-2 text-balance font-serif text-3xl leading-tight text-foreground">
                    {MEMBERSHIP_TERM_YEARS} years of saving for {formatAud(MEMBERSHIP_PRICE)}
                  </h2>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm text-foreground">
                  {[
                    `${formatAud(MEMBERSHIP_JOIN_DISCOUNT)} welcome reward within ${MEMBERSHIP_WELCOME_DELAY_HOURS} hours of joining`,
                    `Free standard shipping on orders over ${formatAud(FREE_SHIP_THRESHOLD_MEMBER)}`,
                    "Members-only pricing, birthday offer and early sale access",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-linen" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Buy your {MEMBERSHIP_TERM_YEARS}-year membership now, or add it during checkout when you next shop.
                  Either way it&apos;s billed once via Stripe — or enter your existing Linen Lovers number to apply
                  member pricing.
                </p>
                <div className="flex flex-wrap gap-3">
                  {isMember ? (
                    <Button
                      size="lg"
                      onClick={viewMembership}
                      className="rounded-full bg-linen px-7 text-linen-foreground hover:bg-linen/90"
                    >
                      View my membership
                      <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      onClick={handleJoin}
                      className="rounded-full bg-linen px-7 text-linen-foreground hover:bg-linen/90"
                    >
                      Join now for {formatAud(MEMBERSHIP_PRICE)}
                      <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onShop({ type: "menu", key: "New In" })}
                  className="self-start text-sm font-medium text-linen underline-offset-4 hover:underline"
                >
                  Or browse what&apos;s new in &rarr;
                </button>
              </div>

              <div className="relative min-h-[280px] overflow-hidden bg-secondary">
                <Image
                  src="/home/stylist-feature.png"
                  alt="Living room styled with cushions, throw, rug and warm neutral accents"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <StylistChatWidget />
    </div>
  )
}
