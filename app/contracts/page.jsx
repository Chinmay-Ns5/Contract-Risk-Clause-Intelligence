"use client";

import { useEffect, useState } from "react";

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [title, setTitle] = useState("");
  const [uploadedBy, setUploadedBy] = useState("1");
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadContracts() {
    try {
      const response = await fetch("/api/contracts");
      const data = await response.json();
      setContracts(data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to load contracts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContracts();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!title.trim()) {
      setMessage("Please enter a contract title.");
      return;
    }

    try {
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          uploaded_by: Number(uploadedBy),
          file_path: filePath || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Failed to create contract.");
        return;
      }

      setMessage("Contract created successfully.");
      setTitle("");
      setFilePath("");

      await loadContracts();
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Contract Management
          </h1>
          <p className="mt-2 text-gray-600">
            Upload and manage contracts in the Contract Risk Platform.
          </p>
        </div>

        {/* Add Contract */}
        <section className="mb-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold text-gray-900">
            Add Contract
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Contract Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Vendor Supply Agreement"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Uploaded By
              </label>
              <input
                type="number"
                value={uploadedBy}
                onChange={(e) => setUploadedBy(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                File Path
              </label>
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="/uploads/contract.pdf"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              Add Contract
            </button>

            {message && (
              <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
                {message}
              </p>
            )}
          </form>
        </section>

        {/* Contract List */}
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Existing Contracts
            </h2>

            <button
              onClick={loadContracts}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading contracts...</p>
          ) : contracts.length === 0 ? (
            <p className="text-gray-500">
              No contracts have been added yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700">
                      ID
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Title
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Uploaded By
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Upload Date
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {contracts.map((contract) => (
                    <tr
                      key={contract.contract_id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-4 text-sm">
                        {contract.contract_id}
                      </td>

                      <td className="px-4 py-4 font-medium text-gray-900">
  <a
    href={`/contracts/${contract.contract_id}`}
    className="text-blue-600 hover:underline"
  >
    {contract.title}
  </a>
</td>

                      <td className="px-4 py-4 text-sm text-gray-600">
                        {contract.uploaded_by}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            contract.status === "analyzed"
                              ? "bg-green-100 text-green-700"
                              : contract.status === "reviewed"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {contract.status}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600">
                        {contract.upload_date
                          ? new Date(contract.upload_date).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}