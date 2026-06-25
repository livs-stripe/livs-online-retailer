import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service | Adairs Shopping Assistant",
  description:
    "The terms governing use of the Adairs Shopping Assistant and its product catalogue and agentic commerce API.",
}

const UPDATED = "June 2026"

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 border-b border-border pb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Adairs Shopping Assistant</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold text-foreground sm:text-4xl">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {UPDATED}</p>
      </header>

      <div className="flex flex-col gap-8 leading-relaxed text-foreground">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Acceptance of terms</h2>
          <p className="text-pretty text-muted-foreground">
            By accessing or using the Adairs Shopping Assistant, its product catalogue API, or any agentic commerce
            checkout enabled through it (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of
            Service. If you do not agree, do not use the Service.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">The Service</h2>
          <p className="text-pretty text-muted-foreground">
            The Service lets shoppers discover Adairs homewares and furniture, build styled room looks, and initiate
            purchases. Product discovery is provided through a read-only catalogue API. Purchases, where available, are
            processed by our third-party payment provider on our behalf.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Orders and pricing</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            <li>All prices, product details, and availability are shown for convenience and may change without notice.</li>
            <li>An order is only confirmed once payment is successfully authorised and you receive a confirmation.</li>
            <li>We may cancel or refuse any order, including for pricing errors, stock issues, or suspected fraud.</li>
            <li>You are responsible for providing accurate order and delivery information.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Payments</h2>
          <p className="text-pretty text-muted-foreground">
            Payments are handled by a third-party payment processor. By submitting a payment you authorise us and our
            processor to charge your selected payment method for the order total, including any applicable taxes and
            delivery fees. We do not store full payment card details.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Acceptable use</h2>
          <p className="text-pretty text-muted-foreground">
            You agree not to misuse the Service, including by attempting to disrupt it, access it through unauthorised
            means, scrape it at scale, or use it for any unlawful purpose. We may suspend or restrict access to protect
            the Service and its users.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Disclaimers and liability</h2>
          <p className="text-pretty text-muted-foreground">
            The Service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted by
            law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the
            Service. Nothing in these terms limits rights that cannot be excluded under applicable consumer law.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Changes to these terms</h2>
          <p className="text-pretty text-muted-foreground">
            We may update these Terms of Service from time to time. Continued use of the Service after changes take
            effect constitutes acceptance of the revised terms.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-pretty text-muted-foreground">
            For questions about these terms, please contact the team that operates this deployment.
          </p>
        </section>
      </div>
    </main>
  )
}
