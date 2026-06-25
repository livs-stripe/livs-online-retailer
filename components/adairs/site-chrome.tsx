"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MapPin, User, ShoppingBag, Search, Menu } from "lucide-react"
import { toast } from "sonner"
import { useCart } from "./cart-context"
import { NAV_MENU, type MenuKey } from "@/lib/categories"

interface SiteChromeProps {
  onNavigate?: (key: MenuKey) => void
  onHome?: () => void
  onLinenLovers?: () => void
  onSearch?: (query: string) => void
  // The page the shopper is currently on, so its nav link can be marked active.
  // "linen" highlights the Linen Lovers entry.
  activeMenu?: MenuKey | "linen"
}

export function SiteChrome({ onNavigate, onHome, onLinenLovers, onSearch, activeMenu }: SiteChromeProps) {
  const router = useRouter()
  const { itemCount, openCheckout } = useCart()
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) {
      searchRef.current?.focus()
      return
    }
    onSearch?.(q)
  }

  const showStoreFinder = () => {
    toast("Store finder", {
      description: "Adairs has 170+ stores across Australia and New Zealand. Enter your postcode in-store search soon.",
    })
  }

  return (
    <header className="sticky top-0 z-40 bg-background">
      {/* Promo bar */}
      <div className="bg-primary text-primary-foreground">
        <button
          type="button"
          onClick={onLinenLovers}
          disabled={!onLinenLovers}
          className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-medium tracking-wide transition-colors enabled:hover:text-primary-foreground/80 enabled:cursor-pointer"
        >
          <span>Linen Lovers Always Save More!</span>
        </button>
      </div>

      {/* Main bar */}
      <div className="border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => searchRef.current?.focus()}
              className="flex items-center text-foreground lg:hidden"
              aria-label="Search products"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onHome}
              className="flex items-center"
              aria-label="Adairs home"
              disabled={!onHome}
            >
              <span className="font-serif text-[1.75rem] font-medium lowercase leading-none tracking-tight text-foreground">
                adairs
              </span>
            </button>
          </div>

          <form onSubmit={submitSearch} className="hidden flex-1 items-center md:flex" role="search">
            <div className="relative w-full max-w-md">
              <button
                type="submit"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Search"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Shop over 6,000 products"
                className="w-full rounded-md border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </form>

          <nav className="flex items-center gap-4 text-foreground" aria-label="Account">
            <button
              type="button"
              onClick={showStoreFinder}
              className="hidden cursor-pointer flex-col items-center text-[10px] transition-colors hover:text-brand sm:flex"
              aria-label="Store finder"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/linen-lovers/membership")}
              className="cursor-pointer flex-col items-center text-[10px] transition-colors hover:text-brand"
              aria-label="Account and Linen Lovers sign in"
            >
              <User className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={openCheckout}
              className="relative cursor-pointer flex-col items-center text-[10px] transition-colors hover:text-brand"
              aria-label={itemCount > 0 ? `Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Cart"}
            >
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              {itemCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                  {itemCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Mobile search */}
        <form onSubmit={submitSearch} className="px-4 pb-3 md:hidden" role="search">
          <div className="relative w-full">
            <button
              type="submit"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Search"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Shop over 6,000 products"
              className="w-full rounded-md border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </form>

        {/* Category nav */}
        <nav
          className="mx-auto hidden max-w-6xl items-center gap-6 px-6 pb-3 lg:flex"
          aria-label="Product categories"
        >
          {NAV_MENU.map((link) => {
            const isActive = activeMenu === link
            return (
              <button
                key={link}
                type="button"
                onClick={() => onNavigate?.(link)}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "cursor-pointer text-sm font-semibold uppercase tracking-wide text-linen transition-colors"
                    : "cursor-pointer text-sm font-medium uppercase tracking-wide text-foreground/80 transition-colors hover:text-brand"
                }
              >
                {link}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onLinenLovers}
            aria-current={activeMenu === "linen" ? "page" : undefined}
            className="cursor-pointer rounded-full bg-linen px-3 py-1 text-sm font-semibold uppercase tracking-wide text-linen-foreground transition-colors hover:bg-linen/90"
          >
            Linen Lovers
          </button>
        </nav>

        {/* Category nav — mobile horizontal scroll */}
        <nav
          className="flex items-center gap-4 overflow-x-auto px-4 pb-3 lg:hidden"
          aria-label="Product categories"
        >
          {NAV_MENU.map((link) => {
            const isActive = activeMenu === link
            return (
              <button
                key={link}
                type="button"
                onClick={() => onNavigate?.(link)}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-linen transition-colors"
                    : "whitespace-nowrap text-xs font-medium uppercase tracking-wide text-foreground/80 transition-colors hover:text-brand"
                }
              >
                {link}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onLinenLovers}
            aria-current={activeMenu === "linen" ? "page" : undefined}
            className="whitespace-nowrap rounded-full bg-linen px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-linen-foreground transition-colors hover:bg-linen/90"
          >
            Linen Lovers
          </button>
        </nav>
      </div>
    </header>
  )
}
