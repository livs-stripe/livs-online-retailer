import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Refund & Return Policy | Adairs Shopping Assistant",
  description:
    "How returns, refunds, and exchanges work for purchases made through the Adairs Shopping Assistant.",
}

const UPDATED = "June 2026"

export default function RefundsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 border-b border-border pb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Adairs Shopping Assistant</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold text-foreground sm:text-4xl">
          Refund &amp; Return Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {UPDATED}</p>
      </header>

      <div className="flex flex-col gap-8 leading-relaxed text-foreground">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="text-pretty text-muted-foreground">
            We want you to love what you buy. If something isn&apos;t right, you may return eligible items for a refund
            or exchange in line with this policy and your rights under applicable consumer law.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Return window</h2>
          <p className="text-pretty text-muted-foreground">
            You may request a return within <strong>30 days</strong> of receiving your order. Items must be unused, in
            their original condition, and in their original packaging with any tags attached.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Non-returnable items</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            <li>Items marked final sale or clearance.</li>
            <li>Personalised or custom-made products.</li>
            <li>For hygiene reasons, certain bedding or bath items once opened or used.</li>
            <li>Gift cards.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">How to start a return</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
            <li>Contact us with your order number and the item(s) you wish to return.</li>
            <li>We&apos;ll confirm eligibility and provide return instructions.</li>
            <li>Send the item back in its original condition using the instructions provided.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Refunds</h2>
          <p className="text-pretty text-muted-foreground">
            Once we receive and inspect your return, we&apos;ll notify you of approval. Approved refunds are issued to
            your original payment method, typically within <strong>5–10 business days</strong>, though your bank or card
            issuer may take additional time to post the credit. Original delivery fees are non-refundable unless the
            item was faulty or incorrect.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Faulty or incorrect items</h2>
          <p className="text-pretty text-muted-foreground">
            If your item arrives damaged, faulty, or not as ordered, contact us as soon as possible. We will arrange a
            replacement, repair, or full refund including any return shipping costs, consistent with your consumer law
            rights.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Exchanges</h2>
          <p className="text-pretty text-muted-foreground">
            To exchange an item for a different size, colour, or product, start a return for the original item and place
            a new order, subject to availability.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-pretty text-muted-foreground">
            For help with a return, refund, or exchange, please contact the team that operates this deployment with your
            order details.
          </p>
        </section>
      </div>
    </main>
  )
}
