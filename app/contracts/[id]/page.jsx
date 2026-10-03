"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ContractDetails() {
  const params = useParams();
  const contractId = params.id;

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <main className="min-h-screen bg-gray-100 p-8">
        <div className="mx-auto max-w-5xl">
          <p>Loading contract...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-100 p-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-red-600">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-5xl">

        <a
          href="/contracts"
          className="text-blue-600 hover:underline"
        >
          ← Back to Contracts
        </a>

        <div className="mt-6 rounded-xl bg-white p-8 shadow">

          <h1 className="text-3xl font-bold text-gray-900">
            {contract.title}
          </h1>

          <div className="mt-6 grid gap-4 md:grid-cols-2">

            <div>
              <p className="text-sm text-gray-500">Contract ID</p>
              <p className="font-medium">
                {contract.contract_id}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Uploaded By</p>
              <p className="font-medium">
                {contract.uploaded_by}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="font-medium">
                {contract.status}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Upload Date</p>
              <p className="font-medium">
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