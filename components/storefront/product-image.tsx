"use client"

import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { proxiedImageUrl } from "@/lib/image-url"

interface ProductImageProps {
  src: string | null | undefined
  alt: string
  // Product name shown in the CSS-only fallback when the image fails/missing.
  name: string
  sizes?: string
  className?: string
  priority?: boolean
}

// Square (1:1) product image that routes through the hotlink proxy, shows a
// linen-coloured pulse skeleton while loading, and falls back to a styled
// placeholder with the product name if the image is missing or fails to load.
export function ProductImage({ src, alt, name, sizes, className, priority }: ProductImageProps) {
  const proxied = proxiedImageUrl(src)
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(proxied ? "loading" : "error")

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: "#F5F0EB" }}>
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse" style={{ backgroundColor: "#F5F0EB" }} aria-hidden="true" />
      )}

      {status === "error" || !proxied ? (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 text-center"
          style={{ backgroundColor: "#F5F0EB" }}
        >
          <span className="text-pretty text-sm font-medium leading-snug text-foreground/70">{name}</span>
        </div>
      ) : (
        <Image
          src={proxied}
          alt={alt}
          fill
          unoptimized
          sizes={sizes ?? "(max-width: 768px) 50vw, 25vw"}
          priority={priority}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={cn(
            "object-cover transition-opacity duration-300",
            status === "loaded" ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  )
}
