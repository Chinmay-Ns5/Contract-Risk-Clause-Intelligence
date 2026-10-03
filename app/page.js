import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100">
      <nav className="flex items-center justify-between bg-white px-8 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">
          Contract Risk & Clause Intelligence
        </h1>

        <Link
          href="/api/auth/login"
          className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
        >
          Login
        </Link>
      </nav>

      <section className="mx-auto max-w-6xl px-8 py-16">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-gray-900">
            Contract Risk Intelligence Platform
          </h2>

          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Upload contracts, extract clauses, identify potential risks,
            and review contractual obligations using AI-powered analysis.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">Contracts</h3>
            <p className="mt-2 text-gray-600">
              Upload and manage contracts in one place.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">Clause Analysis</h3>
            <p className="mt-2 text-gray-600">
              Extract and analyze important contractual clauses.
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">Risk Detection</h3>
            <p className="mt-2 text-gray-600">
              Identify potentially risky clauses using semantic similarity.
            </p>
          </div>
        </div>

        <div className="mt-10 flex gap-4">
          <Link
            href="/risk-review"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
          >
            Risk Review
          </Link>

          <Link
            href="/api/contracts"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            Contracts API
          </Link>
        </div>
      </section>
    </main>
  );
}