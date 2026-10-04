"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error('Authentication required.');
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('user');
        router.replace('/login');
      });
  }, [router]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('user');
    router.replace('/login');
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            {user && <p className="mt-2 text-gray-600">Welcome, {user.name} · {user.role_name}</p>}
          </div>
          <button onClick={signOut} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Sign out
          </button>
        </header>

        <div className="mt-8 grid gap-5 md:grid-cols-3">

          {/* Contracts */}
          <Link
            href="/contracts"
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
          >
            <h2 className="text-xl font-semibold text-gray-900">
              Contracts
            </h2>
            <p className="mt-2 text-gray-600">
              Manage uploaded contracts.
            </p>
            <p className="mt-4 text-sm font-semibold text-blue-700 group-hover:text-blue-800">
              Open Contracts →
            </p>
          </Link>

          {/* Risk Flags */}
          <Link href="/contracts" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-amber-200 hover:shadow-lg">
            <h2 className="text-xl font-semibold text-gray-900">
              Risk Flags
            </h2>
            <p className="mt-2 text-gray-600">
              Choose a contract to inspect its risk flags.
            </p>
          </Link>

          {/* Obligations */}
          <Link href="/obligations" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg">
            <h2 className="text-xl font-semibold text-gray-900">
              Obligations
            </h2>
            <p className="mt-2 text-gray-600">
              Track contract obligations and deadlines.
            </p>
          </Link>

        </div>
      </div>
    </main>
  );
}
