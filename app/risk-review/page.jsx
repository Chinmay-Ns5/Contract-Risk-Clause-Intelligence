'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function RiskReviewContent() {
  const searchParams = useSearchParams();

  const contractId = searchParams.get('contractId');
  const numericContractId = contractId === null ? null : Number(contractId);

  const [flags, setFlags] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('high');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [reviewingFlagId, setReviewingFlagId] = useState(null);
  const [selectedFlag, setSelectedFlag] = useState(null);

  useEffect(() => {
    fetchFlags();
  }, [contractId]);

  async function fetchFlags() {
    try {
      setLoading(true);
      setLoadError('');

      if (numericContractId === null) {
        throw new Error('Missing contract ID. Choose a contract from the dashboard.');
      }

      if (!Number.isInteger(numericContractId) || numericContractId <= 0) {
        throw new Error('Invalid contract ID');
      }

      const url = `/api/risk-flags?contractId=${numericContractId}`;

      const res = await fetch(url);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch risk flags');
      }

      if (!data || data.success !== true || !Array.isArray(data.flags)) {
        throw new Error('The risk flags API returned an unexpected response.');
      }

      setFlags(data.flags);
    } catch (error) {
      setFlags([]);
      setLoadError(error.message || 'Unable to load risk flags.');
    } finally {
      setLoading(false);
    }
  }

  async function markReviewed(flagId) {
    try {
      setReviewingFlagId(flagId);
      setFeedback('');

      const res = await fetch(`/api/risk-flags/${flagId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reviewer_id: 1,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error || 'Failed to mark flag as reviewed'
        );
      }

      await fetchFlags();
      setFeedback('Risk flag marked as reviewed.');
    } catch (error) {
      console.error('Failed to mark flag as reviewed:', error);
      setFeedback(error.message || 'Failed to mark flag as reviewed.');
    } finally {
      setReviewingFlagId(null);
    }
  }

  function formatDateTime(value) {
    if (!value) return '—';

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString();
  }

  const categories = Array.from(
    new Set(flags.map((flag) => flag.category_name).filter(Boolean))
  ).sort();

  const contractTitle = flags.find(
    (flag) => Number(flag.contract_id) === numericContractId
  )?.contract_title;

  /*
   * Convert similarity score into a human-readable risk level.
   */
  function getRiskLevel(score) {
    const value = Number(score);

    if (value >= 0.75) {
      return 'High';
    }

    if (value >= 0.5) {
      return 'Medium';
    }

    return 'Low';
  }

  const categoryColors = {
    Liability: 'bg-red-50 text-red-600 border-red-200',
    Indemnity: 'bg-amber-50 text-amber-600 border-amber-200',
    Termination: 'bg-blue-50 text-blue-600 border-blue-200',
    'Automatic Renewal':
      'bg-purple-50 text-purple-600 border-purple-200',
  };

  const riskColors = {
    High: 'bg-red-50 text-red-600 border-red-200',
    Medium: 'bg-amber-50 text-amber-600 border-amber-200',
    Low: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  };

  /*
   * Apply search + filters + sorting.
   */
  const filteredFlags = useMemo(() => {
    let result = [...flags];

    // SEARCH
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();

      result = result.filter((flag) => {
        const clause = String(
          flag.clause_text || ''
        ).toLowerCase();

        const contract = String(
          flag.contract_title || ''
        ).toLowerCase();

        const category = String(
          flag.category_name || ''
        ).toLowerCase();

        return (
          clause.includes(query) ||
          contract.includes(query) ||
          category.includes(query)
        );
      });
    }

    // CATEGORY FILTER
    if (categoryFilter) {
      result = result.filter(
        (flag) => flag.category_name === categoryFilter
      );
    }

    // RISK FILTER
    if (riskFilter) {
      result = result.filter(
        (flag) =>
          getRiskLevel(flag.similarity_score) === riskFilter
      );
    }

    // STATUS FILTER
    if (statusFilter === 'Reviewed') {
      result = result.filter(
        (flag) => Number(flag.reviewed) === 1
      );
    }

    if (statusFilter === 'Pending') {
      result = result.filter(
        (flag) => Number(flag.reviewed) === 0
      );
    }

    // SORT BY SCORE
    result.sort((a, b) => {
      const scoreA = Number(a.similarity_score);
      const scoreB = Number(b.similarity_score);

      if (sortOrder === 'high') {
        return scoreB - scoreA;
      }

      return scoreA - scoreB;
    });

    return result;
  }, [
    flags,
    searchQuery,
    categoryFilter,
    riskFilter,
    statusFilter,
    sortOrder,
  ]);

  // DASHBOARD COUNTS
  const totalRisks = flags.length;

  const highRiskCount = flags.filter(
    (flag) => Number(flag.similarity_score) >= 0.75
  ).length;

  const reviewedCount = flags.filter(
    (flag) => Number(flag.reviewed) === 1
  ).length;

  const pendingCount = flags.filter(
    (flag) => Number(flag.reviewed) === 0
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* HEADER */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>

              <span className="text-xs font-semibold tracking-[0.18em] text-blue-600">
                CONTRACT INTELLIGENCE
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Contract Risk Review
            </h1>

            <p className="text-sm text-slate-500 mt-2">
              Review AI-detected contract risks using
              similarity-based analysis and human verification.
            </p>

            {numericContractId !== null && Number.isInteger(numericContractId) && numericContractId > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                Showing risk flags for {contractTitle
                  ? `${contractTitle} (Contract #${numericContractId})`
                  : `Contract #${numericContractId}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Back to dashboard
            </Link>

            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>

              <span className="text-xs text-slate-600">
                Analysis system active
              </span>
            </div>
          </div>
        </div>

        {feedback && (
          <p
            role="status"
            className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
          >
            {feedback}
          </p>
        )}

        {/* STAT CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">

          {/* TOTAL */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Total Risks
                </p>

                <p className="text-3xl font-semibold mt-5">
                  {totalRisks}
                </p>

                <p className="text-xs text-blue-500 mt-1">
                  Detected risk flags
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                △
              </div>
            </div>
          </div>

          {/* HIGH RISK */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  High Risk
                </p>

                <p className="text-3xl font-semibold mt-5 text-red-600">
                  {highRiskCount}
                </p>

                <p className="text-xs text-slate-400 mt-1">
                  Score ≥ 0.75
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                !
              </div>
            </div>
          </div>

          {/* REVIEWED */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Reviewed
                </p>

                <p className="text-3xl font-semibold mt-5 text-emerald-600">
                  {reviewedCount}
                </p>

                <p className="text-xs text-slate-400 mt-1">
                  Human verified
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                ✓
              </div>
            </div>
          </div>

          {/* PENDING */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Pending
                </p>

                <p className="text-3xl font-semibold mt-5 text-amber-600">
                  {pendingCount}
                </p>

                <p className="text-xs text-slate-400 mt-1">
                  Awaiting review
                </p>
              </div>

              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                ○
              </div>
            </div>
          </div>
        </div>

        {/* RISK ANALYSIS PANEL */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

          {/* PANEL HEADER */}
          <div className="p-6 border-b border-slate-200">

            <div className="flex items-start justify-between gap-6">

              <div>
                <h2 className="text-lg font-semibold">
                  Risk Analysis
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Similarity-based risk flags requiring human review.
                </p>
              </div>

              {/* SEARCH */}
              <div className="relative w-80">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  ⌕
                </span>

                <input
                  type="text"
                  placeholder="Search clauses, contracts..."
                  value={searchQuery}
                  onChange={(e) =>
                    setSearchQuery(e.target.value)
                  }
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* FILTERS */}
            <div className="flex items-center justify-between gap-3 mt-5">

              <div className="flex gap-3">

                {/* CATEGORY */}
                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500"
                >
                  <option value="">
                    All categories
                  </option>

                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                {/* RISK */}
                <select
                  value={riskFilter}
                  onChange={(e) =>
                    setRiskFilter(e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500"
                >
                  <option value="">
                    All risk levels
                  </option>

                  <option value="High">
                    High
                  </option>

                  <option value="Medium">
                    Medium
                  </option>

                  <option value="Low">
                    Low
                  </option>
                </select>

                {/* STATUS */}
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value)
                  }
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500"
                >
                  <option value="">
                    All statuses
                  </option>

                  <option value="Reviewed">
                    Reviewed
                  </option>

                  <option value="Pending">
                    Pending
                  </option>
                </select>

              </div>

              {/* SORT */}
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value)
                }
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500"
              >
                <option value="high">
                  Score: High → Low
                </option>

                <option value="low">
                  Score: Low → High
                </option>
              </select>

            </div>
          </div>

          {/* TABLE */}
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              Loading risk analysis...
            </div>
          ) : loadError ? (
            <div className="p-12 text-center" role="alert">
              <p className="font-medium text-red-700">
                Unable to load risk analysis
              </p>
              <p className="mt-1 text-sm text-red-600">{loadError}</p>
              <button
                type="button"
                onClick={fetchFlags}
                className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Retry
              </button>
            </div>
          ) : flags.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-medium text-slate-700">
                No risk flags found for this contract.
              </p>
            </div>
          ) : filteredFlags.length === 0 ? (
            <div className="p-12 text-center">

              <div className="text-3xl mb-3">
                🔍
              </div>

              <p className="font-medium text-slate-700">
                No matching risk flags
              </p>

              <p className="text-sm text-slate-400 mt-1">
                Try changing your search or filters.
              </p>

            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Clause
                    </th>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Contract
                    </th>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Category
                    </th>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Risk
                    </th>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Score
                    </th>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Status
                    </th>

                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Action
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {filteredFlags.map((flag) => {

                    const riskLevel = getRiskLevel(
                      flag.similarity_score
                    );

                    return (
                      <tr
                        key={flag.flag_id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >

                        {/* CLAUSE */}
                        <td className="px-6 py-5 max-w-md">
                          <p className="text-slate-800 leading-6">
                            {flag.clause_text}
                          </p>
                        </td>

                        {/* CONTRACT */}
                        <td className="px-6 py-5 text-slate-600">
                          {flag.contract_title}
                        </td>

                        {/* CATEGORY */}
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-medium ${
                              categoryColors[
                                flag.category_name
                              ] ||
                              'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {flag.category_name}
                          </span>
                        </td>

                        {/* RISK */}
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-medium ${
                              riskColors[riskLevel]
                            }`}
                          >
                            {riskLevel}
                          </span>
                        </td>

                        {/* SCORE */}
                        <td className="px-6 py-5 font-mono text-slate-700">
                          {Number(
                            flag.similarity_score
                          ).toFixed(4)}
                        </td>

                        {/* STATUS */}
                        <td className="px-6 py-5">

                          {Number(flag.reviewed) === 1 ? (
                            <span className="text-emerald-600 text-xs font-medium">
                              ✓ Reviewed
                            </span>
                          ) : (
                            <span className="text-amber-600 text-xs font-medium">
                              ● Pending
                            </span>
                          )}

                        </td>

                        {/* ACTION */}
                        <td className="px-6 py-5">

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedFlag(flag)}
                              className="text-xs font-medium text-slate-700 hover:text-blue-700 hover:underline"
                            >
                              View
                            </button>

                            {Number(flag.reviewed) === 0 && (
                              <button
                                type="button"
                                onClick={() => markReviewed(flag.flag_id)}
                                disabled={reviewingFlagId === flag.flag_id}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:cursor-wait disabled:opacity-50"
                              >
                                {reviewingFlagId === flag.flag_id
                                  ? 'Saving...'
                                  : 'Mark reviewed'}
                              </button>
                            )}
                          </div>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>
          )}

          {/* FOOTER */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200">
            <p className="text-xs text-slate-400">
              Showing {filteredFlags.length} of {flags.length} risk flags.
            </p>
          </div>

        </div>

        {/* DISCLAIMER */}
        <p className="text-center text-xs text-slate-400 mt-6">
          AI-generated risk detection is intended to support human review
          and does not constitute legal advice.
        </p>

      </div>

      {selectedFlag && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onClick={() => setSelectedFlag(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="risk-details-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Risk flag #{selectedFlag.flag_id}
                </p>
                <h2 id="risk-details-title" className="mt-1 text-xl font-semibold text-slate-900">
                  Risk details
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFlag(null)}
                aria-label="Close risk details"
                className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Risk level</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {getRiskLevel(selectedFlag.similarity_score)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Similarity score</dt>
                  <dd className="mt-1 font-mono font-medium text-slate-900">
                    {Number(selectedFlag.similarity_score).toFixed(4)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {selectedFlag.category_name || 'Uncategorized'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Review status</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {Number(selectedFlag.reviewed) === 1 ? 'Reviewed' : 'Pending'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Contract</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {selectedFlag.contract_title || 'Untitled contract'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Contract ID</dt>
                  <dd className="mt-1 font-mono text-slate-900">
                    {selectedFlag.contract_id ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Clause ID / order</dt>
                  <dd className="mt-1 text-slate-900">
                    {selectedFlag.clause_id ?? '—'} / {selectedFlag.clause_order ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Detected</dt>
                  <dd className="mt-1 text-slate-900">
                    {formatDateTime(selectedFlag.flagged_at)}
                  </dd>
                </div>
              </dl>

              <div>
                <h3 className="text-sm font-semibold text-slate-700">Clause text</h3>
                <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                  {selectedFlag.clause_text || 'No clause text is available.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function RiskReviewPage() {
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen bg-slate-50 p-12 text-center text-slate-500">
          Loading risk review...
        </div>
      )}
    >
      <RiskReviewContent />
    </Suspense>
  );
}