"use client"

import { useState } from "react"
import { MockHome } from "./mock-home"
import { CategoryPage } from "./category-page"
import { EditClubPage } from "./edit-club-page"
import { Wizard } from "./wizard"
import { CartProvider } from "./cart-context"
import type { ShopDestination, MenuKey } from "@/lib/categories"

type View = "home" | "stylist" | "shop" | "linen"

export function AsterHemApp({ demoMode }: { demoMode: boolean }) {
  // Allow deep-linking straight to the The Edit Club benefits page via
  // `/?view=editclub` (used by the header's The Edit Club buttons from other routes).
  const [view, setView] = useState<View>(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "linen") {
      return "linen"
    }
    return "home"
  })
  const [destination, setDestination] = useState<ShopDestination>({ type: "menu", key: "New In" })

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo(0, 0)
  }

  const goToMenu = (key: MenuKey) => {
    setDestination({ type: "menu", key })
    setView("shop")
    scrollTop()
  }

  const goToShop = (dest: ShopDestination) => {
    setDestination(dest)
    setView("shop")
    scrollTop()
  }

  const goToEditClub = () => {
    setView("linen")
    scrollTop()
  }

  let content
  if (view === "stylist") {
    // The Stylist wizard now shares the storefront cart, so its "Add" buttons
    // drop pieces into the same top-right cart and it renders inside the
    // CartProvider with the standard Aster & Hem header + nav.
    content = (
      <Wizard
        demoMode={demoMode}
        onExit={() => setView("home")}
        onNavigate={goToMenu}
        onShop={goToShop}
        onEditClub={goToEditClub}
      />
    )
  } else if (view === "linen") {
    content = (
      <EditClubPage
        onHome={() => setView("home")}
        onNavigate={goToMenu}
        onShop={goToShop}
        onEditClub={goToEditClub}
      />
    )
  } else if (view === "shop") {
    content = (
      <CategoryPage
        destination={destination}
        onHome={() => setView("home")}
        onNavigate={goToMenu}
        onEditClub={goToEditClub}
        onShop={goToShop}
      />
    )
  } else {
    content = (
      <MockHome
        onLaunchStylist={() => setView("stylist")}
        onNavigate={goToMenu}
        onShop={goToShop}
        onEditClub={goToEditClub}
      />
    )
  }

  // Wrap the shoppable storefront in the cart provider so any product card can
  // add to cart and open the Stripe checkout modal.
  return <CartProvider>{content}</CartProvider>
}
