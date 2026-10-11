"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ContractDetails() {
  const params = useParams();
  const contractId = params.id;

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("");

  async function analyzeContract() {
    setAnalyzing(true);
    setAnalysisMessage("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/analysis`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Analysis failed.');
      const contractResponse = await fetch(`/api/contracts/${contractId}`);
      const updatedContract = await contractResponse.json();
      if (!contractResponse.ok) throw new Error(updatedContract.error || 'Unable to refresh contract.');
      setContract(updatedContract);
      setAnalysisMessage('Risk analysis completed.');
    } catch (analysisError) {
      setAnalysisMessage(analysisError.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    async function loadContract() {
      try {
        const response = await fetch(`/api/contracts/${contractId}`);

        if (!response.ok) {
          throw new Error("Failed to load contract");
        }

        const data = await response.json();
        setContract(data);
      } catch (err) {
        console.error(err);
        setError("Unable to load contract.");
      } finally {
        setLoading(false);
      }
    }

    if (contractId) {
      loadContract();
    }
  }, [contractId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-5xl">
          <p>Loading contract...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-red-600">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:p-8">
      <div className="mx-auto max-w-5xl">

        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          <Link href="/contracts" className="text-blue-700 hover:text-blue-900 hover:underline">← Back to Contracts</Link>
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 hover:underline">Dashboard</Link>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={analyzeContract}
            disabled={analyzing}
            className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {analyzing ? 'Analyzing...' : 'Run risk analysis'}
          </button>
          <Link
            href={`/risk-review?contractId=${contractId}`}
            className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            View risk flags
          </Link>
          {analysisMessage && <p role="status" className="text-sm text-gray-600">{analysisMessage}</p>}
        </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

          <h1 className="text-3xl font-bold text-gray-900">
            {contract.title}
          </h1>

          <div className="mt-6 grid gap-4 md:grid-cols-2">

            <div>
              <p className="text-sm text-gray-500">Contract ID</p>
              <p className="font-semibold text-slate-800">
                {contract.contract_id}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Uploaded By</p>
              <p className="font-semibold text-slate-800">
                {contract.uploaded_by}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="font-semibold text-slate-800">
                {contract.status}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Upload Date</p>
              <p className="font-semibold text-slate-800">
                {contract.upload_date
                  ? new Date(contract.upload_date).toLocaleString()
                  : "-"}
              </p>
            </div>

          </div>

          <div className="mt-8">
  <h2 className="text-xl font-semibold">
    Contract Information
  </h2>

  <p className="mt-2 text-gray-600">
    File: {contract.file_path || "No file path available"}
  </p>
</div>

<div className="mt-8">
  <h2 className="text-xl font-semibold text-gray-900">
    Contract Clauses
  </h2>

  {contract.clauses && contract.clauses.length > 0 ? (
    <div className="mt-4 space-y-4">
      {contract.clauses.map((clause) => (
        <div
          key={clause.clause_id}
          className="rounded-lg border bg-gray-50 p-5"
        >
          <div className="flex justify-between">
            <h3 className="font-semibold text-gray-900">
              Clause {clause.clause_order}
            </h3>

            <span className="text-sm text-gray-500">
              ID: {clause.clause_id}
            </span>
          </div>

          <p className="mt-3 text-gray-700">
            {clause.clause_text}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="mt-3 text-gray-500">
      No clauses found for this contract.
    </p>
  )}
</div>

          {/* Clauses Section */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              Clauses
            </h2>

            {contract.clauses && contract.clauses.length > 0 ? (
              <div className="mt-4 space-y-4">

                {contract.clauses.map((clause) => (
                  <div
                    key={clause.clause_id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                  >
                    <p className="text-sm font-medium text-gray-500">
                      Clause {clause.clause_order}
                    </p>

                    <p className="mt-2 text-gray-800">
                      {clause.clause_text}
                    </p>
                  </div>
                ))}

              </div>
            ) : (
              <p className="mt-2 text-gray-500">
                No clauses found for this contract.
              </p>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
