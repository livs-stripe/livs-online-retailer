import { Suspense } from "react"
import { CartProvider } from "@/components/storefront/cart-context"
import { MembershipContent } from "./membership-content"

export const metadata = {
  title: "My Edit Club Membership | Aster & Hem",
  description: "Manage your Edit Club membership, billing and benefits.",
}

export default function MembershipPage() {
  return (
    // CartProvider so "Join The Edit Club" can add the membership to the cart and
    // open the slide-in checkout here, instead of redirecting to hosted billing.
    <CartProvider>
      <Suspense fallback={null}>
        <MembershipContent />
      </Suspense>
    </CartProvider>
  )
}
