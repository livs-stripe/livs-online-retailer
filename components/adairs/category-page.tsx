"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Sparkles, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SiteChrome } from "./site-chrome"
import { ProductImage } from "./product-image"
import { EditClubTile } from "./edit-club-tile"
import { StylistChatWidget } from "./stylist-chat-widget"
import { useCart } from "./cart-context"
import {
  resolveShop,
  sortProducts,
  SORT_OPTIONS,
  DEFAULT_SORT,
  type SortKey,
  type ShopDestination,
  type MenuKey,
} from "@/lib/categories"
import { isOnSale } from "@/lib/products"
import { formatAud } from "@/lib/format"

const PAGE_SIZE = 24

interface CategoryPageProps {
  destination: ShopDestination
  onHome: () => void
  onNavigate: (key: MenuKey) => void
  onEditClub: () => void
  onShop: (dest: ShopDestination) => void
}

export function CategoryPage({
  destination,
  onHome,
  onNavigate,
  onEditClub,
  onShop,
}: CategoryPageProps) {
  const { addToCart } = useCart()
  const { title, description, products } = useMemo(() => resolveShop(destination), [destination])
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT)
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  // The distinct product categories within this view (e.g. Living spans
  // Cushions, Throws, Rugs...). Only show the category filter when there's more
  // than one to choose between.
  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category))).sort((a, b) => a.localeCompare(b))
  }, [products])
  const showCategoryFilter = categories.length > 1

  // Reset paging, sort and filter whenever the shopper navigates to a new view.
  useEffect(() => {
    setVisible(PAGE_SIZE)
    setSort(DEFAULT_SORT)
    setCategoryFilter("all")
  }, [destination])

  // Apply the category filter first, then the chosen sort order.
  const filteredSorted = useMemo(() => {
    const filtered =
      categoryFilter === "all" ? products : products.filter((p) => p.category === categoryFilter)
    return sortProducts(filtered, sort)
  }, [products, categoryFilter, sort])

  const shown = filteredSorted.slice(0, visible)

  // Interleave the Edit Club membership tile sporadically through the grid.
  // We seed the first slot from the view's title so different categories (Throws,
  // Kids, etc.) surface it at slightly different positions, then repeat it every
  // ~11 products so it recurs without crowding the catalog.
  const gridItems = useMemo(() => {
    const PROMO_INTERVAL = 11
    const seedOffset = (title.length % 4) + 4 // first tile lands around slots 4-7
    const items: ({ kind: "product"; product: (typeof shown)[number] } | { kind: "promo"; key: string })[] = []
    shown.forEach((product, index) => {
      items.push({ kind: "product", product })
      if (index === seedOffset || (index > seedOffset && (index - seedOffset) % PROMO_INTERVAL === 0)) {
        items.push({ kind: "promo", key: `promo-${index}` })
      }
    })
    return items
  }, [shown, title])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteChrome
        onNavigate={onNavigate}
        onHome={onHome}
        onEditClub={onEditClub}
        onSearch={(q) => onShop({ type: "search", query: q })}
        activeMenu={destination.type === "menu" ? destination.key : undefined}
      />

      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="border-b border-border">
          <nav
            className="mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground sm:px-6"
            aria-label="Breadcrumb"
          >
            <button type="button" onClick={onHome} className="transition-colors hover:text-foreground">
              Home
            </button>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium text-foreground">{title}</span>
          </nav>
        </div>

        {/* Header */}
        <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
          <h1 className="text-balance font-serif text-3xl text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {filteredSorted.length} {filteredSorted.length === 1 ? "product" : "products"}
          </p>
        </section>

        {/* Filter + sort toolbar */}
        <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
            {showCategoryFilter ? (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  aria-pressed={categoryFilter === "all"}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    categoryFilter === "all"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    aria-pressed={categoryFilter === category}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      categoryFilter === category
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            ) : (
              <span aria-hidden="true" />
            )}

            <div className="flex items-center gap-2 lg:shrink-0">
              <label htmlFor="sort-by" className="text-xs font-medium text-muted-foreground">
                Sort by
              </label>
              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger id="sort-by" className="h-9 w-[200px] rounded-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Product grid */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {shown.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No products found in this category right now.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {gridItems.map((item) => {
                if (item.kind === "promo") {
                  return <EditClubTile key={item.key} onEditClub={onEditClub} />
                }
                const product = item.product
                return (
                  <div
                    key={product.id}
                    className="group flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-square overflow-hidden bg-secondary">
                      <ProductImage
                        src={product.image}
                        alt={`${product.name} — ${product.variant}`}
                        name={product.name}
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="transition-transform duration-500 group-hover:scale-105"
                      />
                      {isOnSale(product) ? (
                        <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                          Sale
                        </span>
                      ) : (
                        product.featured && (
                          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            Loved
                          </span>
                        )
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3.5">
                      <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {product.category}
                      </span>
                      <h3 className="mt-1 line-clamp-2 text-pretty text-sm font-medium leading-snug text-foreground">
                        {product.name}
                      </h3>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{product.variant}</p>
                      <div className="mt-auto flex flex-col gap-2.5 pt-2">
                        <span className="font-serif text-lg text-foreground">{formatAud(product.price)}</span>
                        <Button
                          onClick={() => addToCart(product.id)}
                          className="h-9 rounded-full bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <ShoppingBag className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          Add to cart
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {visible < filteredSorted.length && (
            <div className="mt-10 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="rounded-full border-accent px-8 text-accent hover:bg-accent/10 hover:text-accent"
              >
                Load more
              </Button>
            </div>
          )}
        </section>

      </main>

      <StylistChatWidget />
    </div>
  )
}
