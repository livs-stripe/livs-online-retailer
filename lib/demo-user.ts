export const DEMO_USER = {
  id: process.env.NEXT_PUBLIC_DEMO_CUSTOMER_ID ?? process.env.DEMO_CUSTOMER_ID ?? 'cus_demo_fallback',
  name: 'Amy Zobec',
  firstName: 'Amy',
  email: 'zobec@stripe.com',
  stripeCustomerId: process.env.NEXT_PUBLIC_DEMO_CUSTOMER_ID ?? process.env.DEMO_CUSTOMER_ID ?? 'cus_demo_fallback',
} as const

export type DemoUser = typeof DEMO_USER
