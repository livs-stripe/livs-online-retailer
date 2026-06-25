"use client"

import { Heart, Check, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Product } from "@/lib/types"
import { formatAud } from "@/lib/format"
import { ProductImage } from "./product-image"

interface ProductCardProps {
  product: Product
  inCart: boolean
  wishlisted: boolean
  onToggleCart: () => void
  onToggleWishlist: () => void
}

export function ProductCard({ product, inCart, wishlisted, onToggleCart, onToggleWishlist }: ProductCardProps) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-secondary">
        <ProductImage
          src={product.image}
          alt={`${product.name} — ${product.variant}`}
          name={product.name}
          sizes="(max-width: 768px) 50vw, 25vw"
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <button
          type="button"
          onClick={onToggleWishlist}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
        >
          <Heart className={cn("h-4 w-4", wishlisted && "fill-accent text-accent")} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {product.category}
        </span>
        <h3 className="text-pretty text-sm font-medium leading-snug text-foreground">{product.name}</h3>
        <p className="text-xs text-muted-foreground">{product.variant}</p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="font-serif text-lg text-foreground">{formatAud(product.price)}</span>
          <Button
            size="sm"
            variant={inCart ? "default" : "outline"}
            onClick={onToggleCart}
            className={cn(
              "h-8 rounded-lg text-xs",
              inCart
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "border-accent text-accent hover:bg-accent/10 hover:text-accent",
            )}
          >
            {inCart ? (
              <>
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Added
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Add
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
