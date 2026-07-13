import type { AsterHemProduct } from './products'

export type SizeType = 'clothing' | 'shoes' | 'none'

const NO_SIZE_SUBCATEGORIES = new Set([
  'Bags',
  'Scarves & Belts',
  'Jewellery',
])

const SHOE_SUBCATEGORIES = new Set([
  'Shoes',
])

export function getSizeType(product: { subcategory?: string }): SizeType {
  const sub = product.subcategory ?? ''
  if (NO_SIZE_SUBCATEGORIES.has(sub)) return 'none'
  if (SHOE_SUBCATEGORIES.has(sub)) return 'shoes'
  return 'clothing'
}

export function requiresSize(product: { subcategory?: string; sizes?: string[] }): boolean {
  if (getSizeType(product) === 'none') return false
  const sizes = product.sizes ?? []
  if (sizes.length === 1 && sizes[0].toLowerCase() === 'one size') return false
  return true
}

export function getSizeLabel(product: { subcategory?: string; sizes?: string[] }): string {
  const type = getSizeType(product)
  if (type === 'shoes') return 'Shoe size (EU)'
  if (type === 'clothing') {
    const firstSize = product.sizes?.[0]
    if (firstSize && ['XS', 'S', 'M', 'L', 'XL'].includes(firstSize)) {
      return 'Size'
    }
    return 'Size (AU)'
  }
  return ''
}
