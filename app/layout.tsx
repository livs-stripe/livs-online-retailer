import type { Metadata } from "next"
import { Jost } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const jostSans = Jost({
  subsets: ["latin"],
  variable: "--font-sans-custom",
  display: "swap",
})

const jostDisplay = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-display-custom",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Adairs Room Stylist — AI Styling, Instant Checkout",
  description:
    "Upload a photo of your room and let our AI stylist curate a personalised Adairs collection — purchasable in seconds with Stripe's Agentic Commerce Suite.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${jostSans.variable} ${jostDisplay.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
