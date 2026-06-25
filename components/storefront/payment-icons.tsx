const METHODS = ["Visa", "Mastercard", "Amex", "Link"]

export function PaymentIcons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {METHODS.map((m) => (
        <span
          key={m}
          className="rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground"
        >
          {m}
        </span>
      ))}
    </div>
  )
}
