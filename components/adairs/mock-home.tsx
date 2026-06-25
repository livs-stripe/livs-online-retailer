"use client"

import Image from "next/image"
import { Sparkles, ArrowRight, Camera, Wand2, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SiteChrome } from "./site-chrome"
import { ProductImage } from "./product-image"
import { StylistChatWidget } from "./stylist-chat-widget"
import { useCart } from "./cart-context"
import { ADAIRS_PRODUCTS, isOnSale } from "@/lib/products"
import type { ShopDestination, MenuKey } from "@/lib/categories"
import { formatAud } from "@/lib/format"

const CATEGORY_TILES: { label: string; image: string; dest: ShopDestination }[] = [
  {
    label: "Shop Quilt Covers",
    image: "/products/waffle-knit-throw-sand.png",
    dest: { type: "category", category: "Bed Linen", title: "Quilt Covers & Bed Linen" },
  },
  {
    label: "Shop Cushions",
    image: "/products/harlow-linen-cushion-rust.png",
    dest: { type: "category", category: "Cushions", title: "Cushions" },
  },
  {
    label: "Shop Rugs",
    image: "https://www.adairs.com.au/globalassets/13.-ecommerce/03.-product-images/2025_images/furniture/floor-rugs--mats/59957_naturaljut_01.jpg",
    dest: { type: "category", category: "Rugs and Mats", title: "Rugs & Mats" },
  },
  {
    label: "Shop Furniture",
    image: "/products/mango-wood-side-table.png",
    dest: { type: "category", category: "Furniture", title: "Furniture" },
  },
]

const FOOTER_COLUMNS = [
  {
    title: "Shop With Adairs",
    links: ["New In", "Bedroom", "Bathroom", "Furniture", "Homewares", "Kids", "Gifts", "Sale", "Linen Lovers", "Adairs Insider"],
  },
  {
    title: "Help",
    links: [
      "Help Centre",
      "Track My Order",
      "Account Login",
      "Store Finder",
      "Shipping & Delivery",
      "Call & Collect",
      "Click & Collect",
      "Returns",
      "Gift Cards",
      "Afterpay",
      "Zip Pay",
    ],
  },
  {
    title: "About Adairs",
    links: [
      "About Us",
      "Our People",
      "Our Product",
      "Our Planet",
      "Adairs News",
      "Orange Sky",
      "Qantas",
      "Careers",
      "Corporate Customers",
      "Investors",
      "Terms & Conditions",
      "Privacy & Security Policy",
    ],
  },
  {
    title: "Our Brands",
    links: ["Mocka", "Focus On Furniture"],
  },
]


export function MockHome({
  onLaunchStylist,
  onNavigate,
  onShop,
  onLinenLovers,
}: {
  onLaunchStylist: () => void
  onNavigate: (key: MenuKey) => void
  onShop: (dest: ShopDestination) => void
  onLinenLovers: () => void
}) {
  const { addToCart } = useCart()
  const featured = ADAIRS_PRODUCTS.filter((p) => p.featured).slice(0, 4)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteChrome
        onNavigate={onNavigate}
        onLinenLovers={onLinenLovers}
        onSearch={(q) => onShop({ type: "search", query: q })}
      />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative">
          <div className="relative h-[420px] w-full overflow-hidden sm:h-[520px]">
            <Image
              src="/home/hero-bedroom.png"
              alt="Styled bedroom with layered linen bedding and warm neutral homewares"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-foreground/55 via-foreground/20 to-transparent" />
            <div className="absolute inset-0 flex items-center">
              <div className="mx-auto flex w-full max-w-6xl px-4 sm:px-6">
                <div className="max-w-md text-background">
                  <span className="inline-block rounded-full bg-blush px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blush-foreground">
                    Mid Year Sale
                  </span>
                  <h1 className="mt-4 text-balance font-serif text-5xl leading-none sm:text-6xl">
                    Save up to 50%<span className="align-super text-2xl">*</span>
                  </h1>
                  <p className="mt-4 text-pretty text-sm leading-relaxed text-background/90">
                    Refresh every room with our biggest homewares event. Bedding, cushions, throws, rugs and more.
                  </p>
                  <Button
                    onClick={() => onNavigate("Sale")}
                    className="mt-6 rounded-full bg-background px-6 text-foreground hover:bg-background/90"
                  >
                    Shop the sale
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Category tiles */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {CATEGORY_TILES.map((tile) => (
              <button
                key={tile.label}
                type="button"
                onClick={() => onShop(tile.dest)}
                className="group relative overflow-hidden rounded-md border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-secondary">
                  <Image
                    src={tile.image || "/placeholder.svg"}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <span className="flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                  {tile.label}
                  <ArrowRight
                    className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Room Stylist feature */}
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="grid items-stretch gap-0 md:grid-cols-2">
              <div className="relative min-h-[280px] overflow-hidden bg-secondary">
                <Image
                  src="/home/stylist-feature.png"
                  alt="Curated living room styled with cushions, throw, rug and accents"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  New · AI Powered
                </span>
              </div>

              <div className="flex flex-col justify-center gap-5 p-8 sm:p-10">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">Adairs Room Stylist</p>
                  <h2 className="mt-2 text-balance font-serif text-3xl leading-tight text-foreground sm:text-4xl">
                    Snap your room. Get a styled look in seconds.
                  </h2>
                </div>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  Upload or photograph your space and our AI stylist reads your room, identifies your style, and curates
                  a shoppable collection of Adairs pieces — checkout in a tap.
                </p>
                <ul className="flex flex-col gap-2 text-sm text-foreground">
                  <li className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-accent" aria-hidden="true" />
                    Upload a photo or use your camera
                  </li>
                  <li className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-accent" aria-hidden="true" />
                    AI-curated picks tailored to your space
                  </li>
                </ul>
                <div>
                  <Button
                    size="lg"
                    onClick={onLaunchStylist}
                    className="rounded-full bg-accent px-7 text-accent-foreground hover:bg-accent/90"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Try the Room Stylist
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured products */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-serif text-2xl text-foreground">Most loved right now</h2>
              <p className="text-sm text-muted-foreground">Bestselling homewares to refresh your space.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("New In")}
              className="hidden cursor-pointer items-center gap-1 text-sm font-medium text-accent sm:flex"
            >
              View all
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {featured.map((product) => (
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
                  {isOnSale(product) && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                      Sale
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3.5">
                  <h3 className="line-clamp-2 text-pretty text-sm font-medium leading-snug text-foreground">
                    {product.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">{product.variant}</p>
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
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-border pt-8">
            <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
              {"\u00A9"} Adairs {new Date().getFullYear()} - Australia&apos;s leading independent retailer for manchester
              including bedroom, bathroom, homewares, furniture, and kids.
            </p>
          </div>
        </div>
      </footer>

      {/* Floating conversational shopping agent */}
      <StylistChatWidget />
    </div>
  )
}
