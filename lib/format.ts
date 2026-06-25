// Adairs is an Australian brand, so every price is presented in AUD with an
// explicit "A$" symbol (e.g. "A$19.95") for a consistent, unambiguous currency
// across the whole storefront, agent and membership areas. (Stripe settlement
// stays in USD behind the scenes for the agentic/ACS preview; the amounts are
// 1:1 — only the displayed label is AUD.)
function formatAudDollars(amount: number): string {
  // en-US + AUD renders the explicit "A$" symbol (e.g. "A$1,234.56").
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "AUD",
  }).format(amount)
}

export function formatAud(amount: number): string {
  return formatAudDollars(amount)
}

// Kept for backwards-compatible call sites; also renders AUD so currency is
// uniform everywhere.
export function formatUsd(amount: number): string {
  return formatAudDollars(amount)
}
