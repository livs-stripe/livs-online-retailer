import { Suspense } from "react"
import { CartProvider } from "@/components/adairs/cart-context"
import { MembershipContent } from "./membership-content"

export const metadata = {
  title: "My Linen Lovers Membership | Adairs",
  description: "Manage your Linen Lovers membership, billing and benefits.",
}

export default function MembershipPage() {
  return (
    // CartProvider so "Join Linen Lovers" can add the membership to the cart and
    // open the slide-in checkout here, instead of redirecting to hosted billing.
    <CartProvider>
      <Suspense fallback={null}>
        <MembershipContent />
      </Suspense>
    </CartProvider>
  )
}
