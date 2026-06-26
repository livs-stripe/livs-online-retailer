'use client'

import { getSizeLabel } from '@/lib/sizing'
import { cn } from '@/lib/utils'

interface SizeSelectorProps {
  product: { subcategory?: string; sizes?: string[] }
  selectedSize: string | null
  onSelect: (size: string) => void
  variant?: 'chat' | 'checkout'
}

export function SizeSelector({
  product,
  selectedSize,
  onSelect,
  variant = 'checkout',
}: SizeSelectorProps) {
  const label = getSizeLabel(product)
  const sizes = product.sizes ?? []

  if (sizes.length === 0) return null

  return (
    <div className="space-y-2">
      <p className={cn(
        "font-semibold uppercase tracking-widest text-muted-foreground",
        variant === 'chat' ? 'text-[10px]' : 'text-[11px]'
      )}>
        {label}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {sizes.map(size => {
          const isSelected = selectedSize === size
          return (
            <button
              key={size}
              type="button"
              onClick={() => onSelect(size)}
              className={cn(
                "rounded-lg border text-xs font-medium transition-all",
                variant === 'chat' ? 'px-2.5 py-1.5' : 'px-3 py-2',
                isSelected
                  ? 'border-accent bg-accent text-accent-foreground shadow-sm'
                  : 'border-border bg-secondary text-foreground hover:border-accent/50'
              )}
            >
              {size}
            </button>
          )
        })}
      </div>

      {!selectedSize && (
        <p className="text-[10px] text-accent">
          Please select a size to continue
        </p>
      )}
    </div>
  )
}
