export interface Product {
  id: string
  name: string
  variant: string
  category: string
  price: number
  url?: string
  image: string
  featured: boolean
}

export interface RoomAnalysis {
  roomType: string
  detectedStyle: string
  colourPalette: string[]
  styleGap: string
  stylistNote: string
  recommendedProductIds: string[]
}

export interface CartItem {
  productId: string
  quantity: number
}

// The result of an agent-initiated order completed via the Stripe Agentic
// Commerce Suite (Shared Payment Token flow). Surfaced on the confirmation
// screen so the buyer can see the agent authorized the purchase on their behalf.
export interface AgentOrder {
  id: string
  status: "authorized" | "requires_action" | "simulated" | "declined"
  amount: number
  currency: string
  sharedPaymentToken: string
  paymentMethodLabel: string
  itemCount: number
  live: boolean
  agent: string
  paymentIntentId: string | null
  // Scope of the buyer's authorization that the Shared Payment Token enforced —
  // surfaced so the buyer can see the agent stayed within the mandate they gave.
  spendCap: number
  singleUse: boolean
  // Optional message when the token could not authorize the charge (e.g. the
  // order exceeded the spend cap the buyer approved).
  declineReason?: string
}

// Checkout is now an overlay (slide-in drawer) on the Curate step rather than a
// standalone step, so the linear flow is: Upload → Analyse → Curate → Confirmed.
export type WizardStep = 1 | 2 | 3 | 4
