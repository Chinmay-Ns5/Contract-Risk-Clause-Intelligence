'use client';

import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [analysisResults, setAnalysisResults] = useState({});
  const [selectedContractId, setSelectedContractId] = useState(null);
  const analysisLock = useRef(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [uploadedBy, setUploadedBy] = useState(null);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);

  useEffect(() => {
    fetchContracts();
    fetchUsers();
  }, []);

  async function fetchContracts() {
    try {
      setLoading(true);

      const response = await fetch('/api/contracts');

      if (!response.ok) {
        throw new Error('Failed to fetch contracts');
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('The contracts API returned an unexpected response.');
      }

      setContracts(data);
    } catch (error) {
      console.error('Error fetching contracts:', error);

      setMessage({
        type: 'error',
        text: 'Unable to load contracts.'
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      setUsersLoading(true);
      setUsersError('');

      const response = await fetch('/api/users');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to load users.');
      }

      if (!Array.isArray(data)) {
        throw new Error('The users API returned an unexpected response.');
      }

      const availableUsers = data
        .map((user) => ({
          user_id: Number(user.user_id),
          name: String(user.name || '').trim(),
        }))
        .filter((user) => Number.isInteger(user.user_id) && user.user_id > 0 && user.name);

      setUsers(availableUsers);
      setUploadedBy((currentUserId) => (
        availableUsers.some((user) => user.user_id === currentUserId)
          ? currentUserId
          : availableUsers[0]?.user_id ?? null
      ));
    } catch (error) {
      setUsers([]);
      setUploadedBy(null);
      setUsersError(error.message || 'Unable to load users.');
    } finally {
      setUsersLoading(false);
    }
  }

  async function analyzeContract(contractId) {
    if (analysisLock.current) return;

    analysisLock.current = true;

    try {
      setAnalyzingId(contractId);
      setSelectedContractId(contractId);
      setMessage(null);

      const response = await fetch(
        `/api/contracts/${contractId}/analysis`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Contract analysis failed'
        );
      }

      setAnalysisResults((previous) => ({
        ...previous,
        [contractId]: data
      }));

      setMessage({
        type: 'success',
        text: `Analysis completed for contract #${contractId}.`
      });

      await fetchContracts();
    } catch (error) {
      console.error('Analysis error:', error);

      setMessage({
        type: 'error',
        text: error.message || 'Contract analysis failed.'
      });
    } finally {
      analysisLock.current = false;
      setAnalyzingId(null);
    }
  }

  async function uploadContract(event) {
    event.preventDefault();
    if (uploadLock.current) return;

    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Select a PDF file to upload.' });
      return;
    }

    const uploaderId = uploadedBy;
    if (!Number.isInteger(uploaderId) || !users.some((user) => user.user_id === uploaderId)) {
      setMessage({ type: 'error', text: 'Select a valid uploader user.' });
      return;
    }

    uploadLock.current = true;
    const form = event.currentTarget;

    try {
      setUploading(true);
      setMessage(null);

      const formData = new FormData();
      formData.set('file', selectedFile);
      formData.set('title', uploadTitle.trim());
      formData.set('uploaded_by', String(uploaderId));

      const response = await fetch('/api/contracts', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Contract upload failed.');
      }

      setSelectedContractId(data.contract_id);
      setMessage({
        type: data.warning ? 'warning' : 'success',
        text: data.warning
          ? `Contract #${data.contract_id} was uploaded with ${data.clauses_created} clauses. ${data.warning}`
          : `${data.already_exists ? 'This PDF is already stored as' : 'Uploaded'} ${data.title} (Contract #${data.contract_id}) with ${data.clauses_created} clauses and embeddings. Status: ${data.status}.`,
      });

      setSelectedFile(null);
      setUploadTitle('');
      form.reset();
      await fetchContracts();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.message || 'Contract upload failed.',
      });
    } finally {
      uploadLock.current = false;
      setUploading(false);
    }
  }

  function getStatusStyle(status) {
    switch (status) {
      case 'analyzed':
        return 'bg-green-50 text-green-700 border-green-200';

      case 'reviewed':
        return 'bg-blue-50 text-blue-700 border-blue-200';

      case 'pending':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  }

  function formatStatus(status) {
    if (!status) return 'Pending';

    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function formatDate(date) {
    if (!date) return '—';

    try {
      return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return date;
    }
  }

  function getNewFlags(result) {
    if (!result) return null;

    if (typeof result.newFlags === 'number') {
      return result.newFlags;
    }

    if (typeof result.new_flags === 'number') {
      return result.new_flags;
    }

    if (
      result.result &&
      typeof result.result.newFlags === 'number'
    ) {
      return result.result.newFlags;
    }

    if (
      result.result &&
      typeof result.result.new_flags === 'number'
    ) {
      return result.result.new_flags;
    }

    return null;
  }

  function getRiskReviewUrl() {
    const contractId = selectedContractId ?? contracts[0]?.contract_id;
    const numericContractId = Number(contractId);

    if (!Number.isInteger(numericContractId) || numericContractId <= 0) {
      return null;
    }

    return `/risk-review?contractId=${numericContractId}`;
  }

  const riskReviewUrl = getRiskReviewUrl();

  return (
    <main className="min-h-screen bg-[#f8fafc] text-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-start justify-between gap-6">

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600"></span>

                <span className="text-xs font-semibold tracking-[0.18em] text-blue-600 uppercase">
                  Contract Intelligence
                </span>
              </div>

              <h1 className="text-3xl font-semibold tracking-tight text-gray-950">
                Contract Analysis
              </h1>

              <p className="mt-2 text-sm text-gray-500 max-w-2xl">
                Select a contract and run similarity-based AI analysis
                to identify potentially risky clauses.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>

              <span className="text-xs font-medium text-gray-600">
                Analysis system active
              </span>
            </div>

          </div>
        </header>

        {/* Success / Error message */}
        {message && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : message.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {message.type === 'success' ? '✓' : '!'}
              </span>

              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* Overview cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">

          {/* Total Contracts */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Total Contracts
            </p>

            <p className="mt-2 text-3xl font-semibold text-gray-950">
              {contracts.length}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Available for analysis
            </p>
          </div>

          {/* Pending Analysis */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              Pending Analysis
            </p>

            <p className="mt-2 text-3xl font-semibold text-amber-600">
              {
                contracts.filter(
                  (contract) => contract.status === 'pending'
                ).length
              }
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Awaiting AI analysis
            </p>
          </div>

          {/* System Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">
              System Status
            </p>

            <p className="mt-2 text-3xl font-semibold text-emerald-600">
              Ready
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Backend analysis service connected
            </p>
          </div>

        </section>

        <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-950">Upload a contract</h2>
            <p className="mt-1 text-sm text-gray-500">
              Upload a text-based PDF. Its clauses and local embeddings are saved before analysis.
            </p>
          </div>

          <form onSubmit={uploadContract} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-medium text-gray-700">
              Contract title
              <input
                type="text"
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Defaults to the PDF filename"
                maxLength={255}
                className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Uploader user
              <select
                required
                value={uploadedBy ?? ''}
                disabled={usersLoading || Boolean(usersError) || users.length === 0}
                onChange={(event) => setUploadedBy(Number(event.target.value))}
                className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
              >
                {usersLoading ? (
                  <option value="">Loading users...</option>
                ) : usersError ? (
                  <option value="">Users unavailable</option>
                ) : users.length === 0 ? (
                  <option value="">No users available</option>
                ) : (
                  users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.name} (ID: {user.user_id})
                    </option>
                  ))
                )}
              </select>
              {usersError ? (
                <span role="alert" className="mt-1 block text-xs font-normal text-red-600">
                  {usersError}
                </span>
              ) : users.length === 0 && !usersLoading ? (
                <span className="mt-1 block text-xs font-normal text-amber-700">
                  No users available. Please create a user before uploading a contract.
                </span>
              ) : null}
            </label>

            <label className="text-sm font-medium text-gray-700">
              PDF file
              <input
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setSelectedFile(file);
                  if (file && !uploadTitle.trim()) {
                    setUploadTitle(file.name.replace(/\.pdf$/i, ''));
                  }
                }}
                className="mt-1.5 block w-full text-sm font-normal text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
              <span className="mt-1 block text-xs font-normal text-gray-400">PDF, maximum 20 MB</span>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={uploading || !selectedFile || usersLoading || Boolean(usersError) || users.length === 0 || !Number.isInteger(uploadedBy)}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {uploading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                    Uploading and indexing...
                  </>
                ) : (
                  'Upload PDF'
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Contracts section */}
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          {/* Section header */}
          <div className="border-b border-gray-200 px-6 py-5">
            <div className="flex items-center justify-between">

              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  Contracts
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Choose a contract to run risk analysis.
                </p>
              </div>

              <button
                onClick={fetchContracts}
                disabled={loading}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                ↻ Refresh
              </button>

            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="px-6 py-16 text-center">

              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600"></div>

              <p className="text-sm text-gray-500">
                Loading contracts...
              </p>

            </div>
          ) : contracts.length === 0 ? (

            /* Empty */
            <div className="px-6 py-16 text-center">

              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                📄
              </div>

              <h3 className="font-medium text-gray-900">
                No contracts found
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Upload a contract to begin analysis.
              </p>

            </div>

          ) : (

            /* Contract table */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">

                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>

                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Contract
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      ID
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Uploaded
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Status
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                      Action
                    </th>

                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">

                  {contracts.map((contract) => {

                    const isAnalyzing =
                      analyzingId === contract.contract_id;
                    const analysisInProgress = analyzingId !== null;

                    const result =
                      analysisResults[contract.contract_id];

                    const newFlags = getNewFlags(result);

                    const isAnalyzed =
                      contract.status === 'analyzed';

                    const isReviewed =
                      contract.status === 'reviewed';

                    const isCompleted =
                      isAnalyzed || isReviewed;

                    const isSelected =
                      selectedContractId === contract.contract_id;

                    return (
                      <tr
                        key={contract.contract_id}
                        id={`contract-${contract.contract_id}`}
                        className={`transition hover:bg-gray-50 ${
                          isSelected
                            ? 'bg-blue-50/40'
                            : ''
                        }`}
                      >

                        {/* Contract name */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">

                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              📄
                            </div>

                            <div>
                              <p className="font-medium text-gray-900">
                                {contract.title}
                              </p>

                              {contract.file_path && (
                                <p className="mt-1 max-w-xs truncate text-xs text-gray-400">
                                  {contract.file_path}
                                </p>
                              )}
                            </div>

                          </div>
                        </td>

                        {/* ID */}
                        <td className="px-6 py-5">
                          <span className="font-mono text-xs text-gray-500">
                            #{contract.contract_id}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-6 py-5 text-gray-500">
                          {formatDate(contract.upload_date)}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusStyle(
                              contract.status
                            )}`}
                          >
                            {formatStatus(contract.status)}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-6 py-5 text-right">

                          <div className="flex items-center justify-end gap-2">

                            {/* View risks for already analyzed contract */}
                            {isCompleted && (
                              <a
                                href={`/risk-review?contractId=${contract.contract_id}`}
                                onClick={() =>
                                  setSelectedContractId(
                                    contract.contract_id
                                  )
                                }
                                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                              >
                                View Risks
                              </a>
                            )}

                            <button
                              onClick={() =>
                                analyzeContract(
                                  contract.contract_id
                                )
                              }
                              disabled={
                                analysisInProgress ||
                                isCompleted
                              }
                              className={`
                                inline-flex
                                min-w-[145px]
                                items-center
                                justify-center
                                gap-2
                                rounded-md
                                px-4
                                py-2.5
                                text-xs
                                font-medium
                                shadow-sm
                                transition
                                ${
                                  isAnalyzing
                                    ? 'bg-blue-400 text-white cursor-not-allowed'
                                    : analysisInProgress
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : isAnalyzed
                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 cursor-not-allowed'
                                    : isReviewed
                                    ? 'border border-blue-200 bg-blue-50 text-blue-700 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }
                              `}
                            >

                              {isAnalyzing ? (
                                <>
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                                  Analyzing...
                                </>
                              ) : isAnalyzed ? (
                                <>
                                  <span>✓</span>
                                  Analyzed
                                </>
                              ) : isReviewed ? (
                                <>
                                  <span>✓</span>
                                  Reviewed
                                </>
                              ) : (
                                <>
                                  <span>✦</span>
                                  Analyze Contract
                                </>
                              )}

                            </button>

                          </div>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </div>
          )}

          {/* Analysis result summary */}
          {Object.keys(analysisResults).length > 0 && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">

              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Latest Analysis
              </p>

              <div className="space-y-2">

                {Object.entries(analysisResults).map(
                  ([contractId, result]) => {

                    const contract = contracts.find(
                      (item) =>
                        String(item.contract_id) ===
                        String(contractId)
                    );

                    const newFlags = getNewFlags(result);

                    return (
                      <div
                        key={contractId}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
                      >

                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {contract?.title ||
                              `Contract #${contractId}`}
                          </p>

                          <p className="mt-0.5 text-xs text-gray-400">
                            Contract ID #{contractId}
                          </p>
                        </div>

                        <div className="flex items-center gap-5">

                          <div className="text-right">
                            <p className="text-sm font-medium text-emerald-600">
                              ✓ Analysis complete
                            </p>

                            {newFlags !== null && (
                              <p className="text-xs text-gray-500">
                                {newFlags} new risk flag
                                {newFlags === 1 ? '' : 's'} detected
                              </p>
                            )}
                          </div>

                          <a
                            href={`/risk-review?contractId=${contractId}`}
                            onClick={() =>
                              setSelectedContractId(
                                Number(contractId)
                              )
                            }
                            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            View Risks →
                          </a>

                        </div>

                      </div>
                    );
                  }
                )}

              </div>
            </div>
          )}

        </section>

        {/* Link to risk review */}
        <div className="mt-6 flex justify-end">

          {riskReviewUrl ? (
            <a
              href={riskReviewUrl}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              View Risk Review →
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-400">
              Risk Review unavailable
            </span>
          )}

        </div>

        {/* Disclaimer */}
        <footer className="mt-10 text-center">

          <p className="text-xs text-gray-400">
            AI-generated risk detection is intended to support
            human review and does not constitute legal advice.
          </p>

        </footer>

      </div>
    </main>
  );
}