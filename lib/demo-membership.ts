import { DEMO_USER } from './demo-user'

export type EditClubTier = 'Member' | 'Silver' | 'Gold' | 'Platinum'

export type EditClubMembership = {
  memberId: string
  memberName: string
  email: string
  tier: EditClubTier
  discountPercent: number
  freeDeliveryThreshold: number
  joinedDate: string
  pointsBalance: number
  perks: string[]
}

export const DEMO_MEMBERSHIP: EditClubMembership = {
  memberId: 'EC-2024-AZ8817',
  memberName: DEMO_USER.name,
  email: DEMO_USER.email,
  tier: 'Gold',
  discountPercent: 10,
  freeDeliveryThreshold: 0,
  joinedDate: '2024-03-15',
  pointsBalance: 1240,
  perks: [
    '10% off every order',
    'Free delivery on all orders',
    'Early access to new arrivals',
    'Birthday bonus 20% off',
    'Dedicated stylist priority',
  ],
}

export function applyMemberDiscount(priceAud: number): {
  original: number
  discounted: number
  saving: number
} {
  const saving = Math.round(priceAud * (DEMO_MEMBERSHIP.discountPercent / 100) * 100) / 100
  return {
    original: priceAud,
    discounted: Math.round((priceAud - saving) * 100) / 100,
    saving,
  }
}
