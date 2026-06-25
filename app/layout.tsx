import type { Metadata } from "next"
import { Jost, Cormorant_Garamond } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const jostSans = Jost({
  subsets: ["latin"],
  variable: "--font-sans-custom",
  display: "swap",
})

const cormorantDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-display-custom",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Aster & Hem — AI Personal Stylist, Instant Checkout",
  description:
    "Upload a photo and let Hem, our AI personal stylist, curate a personalised Aster & Hem edit — purchasable in seconds with Stripe's Agentic Commerce Suite.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${jostSans.variable} ${cormorantDisplay.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
