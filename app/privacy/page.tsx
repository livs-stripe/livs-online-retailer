import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy | Aster & Hem Shopping Assistant",
  description:
    "How the Aster & Hem Shopping Assistant handles data when used with ChatGPT and the Aster & Hem product catalogue API.",
}

const UPDATED = "June 2026"

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 border-b border-border pb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Aster & Hem Shopping Assistant</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold text-foreground sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {UPDATED}</p>
      </header>

      <div className="flex flex-col gap-8 leading-relaxed text-foreground">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Overview</h2>
          <p className="text-pretty text-muted-foreground">
            This service exposes a read-only product catalogue API used by the Aster & Hem Shopping Assistant, a custom GPT
            available in ChatGPT. It helps shoppers discover Aster & Hem homewares and furniture and build styled room looks.
            This policy explains what data the API receives and how it is used.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Information we receive</h2>
          <p className="text-pretty text-muted-foreground">
            When the assistant calls our API, we receive only the search terms and category filters needed to return
            relevant products (for example, &quot;coastal quilt cover&quot; or &quot;lounge&quot;). We do not request or
            require any account, name, email address, or payment details to use the product search API.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">How we use information</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            <li>To search the Aster & Hem product catalogue and return matching products, prices, and images.</li>
            <li>To operate, secure, and improve the reliability of the API.</li>
            <li>To generate aggregate, non-identifying usage and performance metrics.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Information we do not collect</h2>
          <p className="text-pretty text-muted-foreground">
            We do not sell personal data, build advertising profiles, or store the content of your ChatGPT
            conversations. Conversations with the assistant are governed by OpenAI&apos;s privacy policy, not this one.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Third-party services</h2>
          <p className="text-pretty text-muted-foreground">
            Product images are delivered through a third-party image CDN for performance. Requests to that CDN include
            only the public image URL. The assistant itself runs inside ChatGPT, which is operated by OpenAI.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Data retention</h2>
          <p className="text-pretty text-muted-foreground">
            API requests may be logged for a limited period for security and debugging, after which they are deleted.
            We retain no profile of you between requests.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-pretty text-muted-foreground">
            For questions about this policy or the Aster & Hem Shopping Assistant, please contact the team that operates this
            deployment.
          </p>
        </section>
      </div>
    </main>
  )
}
