"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-gray-900">
          Dashboard
        </h1>

        {user && (
          <p className="mt-2 text-gray-600">
            Welcome, {user.name}
          </p>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-3">

          {/* Contracts */}
          <Link
            href="/contracts"
            className="rounded-xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h2 className="text-xl font-semibold text-gray-900">
              Contracts
            </h2>
            <p className="mt-2 text-gray-600">
              Manage uploaded contracts.
            </p>
            <p className="mt-4 text-sm font-medium text-blue-600">
              Open Contracts →
            </p>
          </Link>

          {/* Risk Flags */}
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">
              Risk Flags
            </h2>
            <p className="mt-2 text-gray-600">
              Review detected contractual risks.
            </p>
          </div>

          {/* Obligations */}
          <div className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-semibold">
              Obligations
            </h2>
            <p className="mt-2 text-gray-600">
              Track contract obligations and deadlines.
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}