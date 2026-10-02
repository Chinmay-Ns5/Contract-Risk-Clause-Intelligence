'use client';

import { useEffect, useState } from 'react';

export default function RiskReviewPage() {
  const [flags, setFlags] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlags();
  }, [categoryFilter]);

  async function fetchFlags() {
    setLoading(true);
    const url = categoryFilter
      ? `/api/risk-flags?category=${encodeURIComponent(categoryFilter)}`
      : '/api/risk-flags';
    const res = await fetch(url);
    const data = await res.json();
    setFlags(data);
    setLoading(false);
  }

  async function markReviewed(flagId) {
    await fetch(`/api/risk-flags/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer_id: 1 }),
    });
    fetchFlags();
  }

  const categories = ['Liability', 'Indemnity', 'Termination', 'Automatic Renewal'];

  const categoryColors = {
    Liability: 'bg-red-100 text-red-700',
    Indemnity: 'bg-amber-100 text-amber-700',
    Termination: 'bg-blue-100 text-blue-700',
    'Automatic Renewal': 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-1">Contract Risk Review</h1>
        <p className="text-sm text-gray-500 mb-6">
          Similarity-based risk flags for human review. Not legal advice.
        </p>

        <div className="flex items-center gap-3 mb-6">
          <label className="text-sm text-gray-600">Filter by category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : flags.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-lg">
            No risk flags found.
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Clause</th>
                  <th className="text-left px-4 py-3 font-medium">Contract</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Score</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.flag_id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs text-gray-800">{f.clause_text}</td>
                    <td className="px-4 py-3 text-gray-600">{f.contract_title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[f.category_name] || 'bg-gray-100 text-gray-700'}`}>
                        {f.category_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {Number(f.similarity_score).toFixed(4)}
                    </td>
                    <td className="px-4 py-3">
                      {f.reviewed ? (
                        <span className="text-green-600 text-xs font-medium">✓ Reviewed</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!f.reviewed && (
                        <button
                          onClick={() => markReviewed(f.flag_id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                        >
                          Mark reviewed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}