"use client";

import { useEffect, useState } from "react";

export default function ObligationsPage() {
  const [obligations, setObligations] = useState([]);
  const [contracts, setContracts] = useState([]);

  const [contractId, setContractId] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    try {
      const [obligationsRes, contractsRes] = await Promise.all([
        fetch("/api/obligations"),
        fetch("/api/contracts"),
      ]);

      const obligationsData = await obligationsRes.json();
      const contractsData = await contractsRes.json();

      setObligations(obligationsData);
      setContracts(contractsData);
    } catch (error) {
      console.error(error);
      setMessage("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function addObligation(e) {
    e.preventDefault();
    setMessage("");

    if (!contractId || !description) {
      setMessage("Please select a contract and enter a description.");
      return;
    }

    try {
      const response = await fetch("/api/obligations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contract_id: Number(contractId),
          description,
          due_date: dueDate || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Failed to add obligation");
        return;
      }

      setMessage("Obligation added successfully.");
      setContractId("");
      setDescription("");
      setDueDate("");

      loadData();
    } catch (error) {
      console.error(error);
      setMessage("Failed to add obligation");
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">

        <h1 className="text-3xl font-bold text-gray-900">
          Obligations
        </h1>

        <p className="mt-2 text-gray-600">
          Track contractual obligations and their due dates.
        </p>

        <div className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold">
            Add Obligation
          </h2>

          <form
            onSubmit={addObligation}
            className="mt-5 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Contract
              </label>

              <select
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 p-3"
              >
                <option value="">
                  Select a contract
                </option>

                {contracts.map((contract) => (
                  <option
                    key={contract.contract_id}
                    value={contract.contract_id}
                  >
                    {contract.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description
              </label>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Supplier must provide monthly compliance reports."
                className="mt-1 w-full rounded-md border border-gray-300 p-3"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Due Date
              </label>

              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 p-3"
              />
            </div>

            <button
              type="submit"
              className="rounded-md bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
            >
              Add Obligation
            </button>

            {message && (
              <p className="text-sm text-gray-600">
                {message}
              </p>
            )}
          </form>
        </div>

        <div className="mt-8 rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-semibold">
            Existing Obligations
          </h2>

          {loading ? (
            <p className="mt-4 text-gray-500">
              Loading...
            </p>
          ) : obligations.length === 0 ? (
            <p className="mt-4 text-gray-500">
              No obligations found.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Contract</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {obligations.map((obligation) => (
                    <tr
                      key={obligation.obligation_id}
                      className="border-b"
                    >
                      <td className="px-4 py-3">
                        {obligation.obligation_id}
                      </td>

                      <td className="px-4 py-3">
                        {obligation.contract_title}
                      </td>

                      <td className="px-4 py-3">
                        {obligation.description}
                      </td>

                      <td className="px-4 py-3">
                        {obligation.due_date
                          ? new Date(
                              obligation.due_date
                            ).toLocaleDateString()
                          : "—"}
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                          {obligation.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}