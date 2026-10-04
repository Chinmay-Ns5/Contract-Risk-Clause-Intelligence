"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ContractsPage() {
  const [contracts, setContracts] = useState([]);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  async function loadContracts() {
    try {
      const response = await fetch("/api/contracts");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load contracts.");
      setContracts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Failed to load contracts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Authentication required.");
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
      } catch {
        setUser(null);
        localStorage.removeItem("user");
      } finally {
        setSessionLoading(false);
      }
    }

    queueMicrotask(() => {
      loadContracts();
      loadSession();
    });
  }, []);

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setMessage("");
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const looksLikePdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!looksLikePdf) {
      setSelectedFile(null);
      event.target.value = "";
      setMessage("Please select a PDF file.");
      return;
    }
    if (file.size === 0) {
      setSelectedFile(null);
      event.target.value = "";
      setMessage("The selected PDF is empty.");
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) setTitle(file.name.replace(/\.pdf$/i, ""));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (!title.trim()) {
      setMessage("Please enter a contract title.");
      return;
    }
    if (!selectedFile) {
      setMessage("Choose a PDF file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("file", selectedFile);
    try {
      setUploading(true);
      const response = await fetch("/api/contracts", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Failed to upload contract.");
        return;
      }
      setMessage(data.already_exists ? "This PDF is already stored and ready for review." : "Contract uploaded successfully.");
      setTitle("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadContracts();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Something went wrong while uploading.");
    } finally {
      setUploading(false);
    }
  }

  const isAdmin = String(user?.role_name || "").toLowerCase() === "admin";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard" className="inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-900">← Back to Dashboard</Link>
        <header className="mb-8 mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Contract intelligence</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">Contract Management</h1>
          <p className="mt-2 max-w-2xl text-gray-600">Upload, review, and manage contracts in the Contract Risk Platform.</p>
        </header>

        {!sessionLoading && isAdmin && (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-gray-900">Add Contract</h2>
              <p className="mt-1 text-sm text-gray-600">Select a text-based PDF to extract clauses and prepare it for analysis.</p>
            </div>
            <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Contract title</span>
                <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Vendor Supply Agreement" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
              </label>
              <div>
                <span className="mb-2 block text-sm font-semibold text-gray-700">Contract PDF</span>
                <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} className="sr-only" id="contract-pdf" />
                <label htmlFor="contract-pdf" className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-4 py-3 text-sm font-semibold text-blue-800 hover:border-blue-500 hover:bg-blue-50">
                  <span className="truncate">{selectedFile ? selectedFile.name : "Choose a PDF file"}</span>
                  <span className="shrink-0 rounded-md bg-blue-700 px-3 py-2 text-xs text-white">Select PDF</span>
                </label>
                <p className="mt-2 text-xs text-gray-500">PDF only · maximum 20 MB</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                <button type="submit" disabled={uploading} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{uploading ? "Uploading and indexing..." : "Upload Contract"}</button>
                {message && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-gray-700">{message}</p>}
              </div>
            </form>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-semibold text-gray-900">Existing Contracts</h2><p className="mt-1 text-sm text-gray-600">Select a contract to view its clauses and analysis.</p></div>
            <button onClick={loadContracts} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-50">Refresh</button>
          </div>
          {loading ? <p className="text-gray-600">Loading contracts...</p> : contracts.length === 0 ? <p className="rounded-lg bg-slate-50 px-4 py-5 text-gray-600">No contracts have been added yet.</p> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="bg-slate-50"><tr className="border-b border-slate-200">{["ID", "Title", "Uploaded By", "Status", "Upload Date"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">{heading}</th>)}</tr></thead>
                <tbody>{contracts.map((contract) => <tr key={contract.contract_id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                  <td className="px-4 py-4 font-mono text-sm font-semibold text-slate-700">#{contract.contract_id}</td>
                  <td className="px-4 py-4 font-semibold"><Link href={`/contracts/${contract.contract_id}`} className="text-blue-700 hover:text-blue-900 hover:underline">{contract.title}</Link></td>
                  <td className="px-4 py-4 text-sm text-gray-600">{contract.uploaded_by}</td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${contract.status === "analyzed" ? "bg-emerald-100 text-emerald-800" : contract.status === "reviewed" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{contract.status}</span></td>
                  <td className="px-4 py-4 text-sm text-gray-600">{contract.upload_date ? new Date(contract.upload_date).toLocaleString() : "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
