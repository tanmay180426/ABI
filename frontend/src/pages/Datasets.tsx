import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataset } from '@/hooks/useDataset'
import {
  deleteDataset,
  uploadDataset,
  uploadBatchDatasets,
  uploadZipDataset,
  updateDatasetSchema,
  getUploadLimits,
  getDatasetCollections,
  type Dataset,
  type UploadLimits,
  type CollectionItem,
} from '@/services/api'

const ROLES = [
  'date', 'revenue', 'currency', 'quantity', 'price', 'customer', 'order',
  'product', 'seller', 'category', 'location', 'status', 'rating',
  'delivery_date', 'estimated_date', 'weight_g'
]
const inputClass = 'bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200'

function SchemaReview({ dataset, saved }: { dataset: Dataset; saved: () => Promise<void> }) {
  const [fields, setFields] = useState<Record<string, string | null>>(dataset.semantics.fields || {})
  const [currency, setCurrency] = useState(dataset.semantics.currency_code || '')
  const [domain, setDomain] = useState(dataset.semantics.domain || 'general')
  const [dateOrder, setDateOrder] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const save = async () => {
    setBusy(true); setMessage('')
    try {
      await updateDatasetSchema(dataset.dataset_id, {
        fields,
        currency_code: currency || null,
        domain,
        ...(dateOrder ? { date_order: dateOrder } : {})
      })
      await saved()
      setMessage('Schema confirmed.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Schema could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Automatic semantic mappings are shown below. Correct only fields that need clarification. Monetary units must be confirmed before running models trained in those units.
      </p>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        {ROLES.map(role => (
          <label key={role} className="flex flex-col gap-1 text-neutral-300">
            {role.replace(/_/g, ' ')}
            <select
              aria-label={`Map ${role}`}
              className={inputClass}
              value={fields[role] || ''}
              onChange={e => setFields({ ...fields, [role]: e.target.value || null })}
            >
              <option value="">Not detected / unused</option>
              {dataset.schema.columns?.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
        ))}
        <label className="flex flex-col gap-1 text-neutral-300">
          Currency
          <select aria-label="Currency" className={inputClass} value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="">Unknown / no currency</option>
            {['BRL', 'USD', 'INR', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-neutral-300">
          Dataset domain
          <select aria-label="Dataset domain" className={inputClass} value={domain} onChange={e => setDomain(e.target.value)}>
            {['general', 'commerce', 'transactions'].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-neutral-300">
          Ambiguous date order
          <select aria-label="Ambiguous date order" className={inputClass} value={dateOrder} onChange={e => setDateOrder(e.target.value)}>
            <option value="">Keep automatic detection</option>
            <option value="dayfirst">Day / month / year</option>
            <option value="monthfirst">Month / day / year</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button
          disabled={busy}
          onClick={() => void save()}
          className="bg-blue-600 hover:bg-blue-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50 transition"
        >
          {busy ? 'Saving…' : 'Confirm schema'}
        </button>
        {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
      </div>
    </div>
  )
}

export default function Datasets() {
  const { datasets, active, reload, select } = useDataset()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'single' | 'folder' | 'zip' | 'batch'>('single')
  const [file, setFile] = useState<File | null>(null)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limits, setLimits] = useState<UploadLimits | null>(null)
  const [collections, setCollections] = useState<CollectionItem[]>([])
  const [batchResult, setBatchResult] = useState<{
    successful: number
    failed: number
    skipped: number
    skipped_files: Array<{ filename?: string; path?: string; reason: string }>
    errors: Array<{ filename: string; path?: string; error: string }>
  } | null>(null)
  const [lastImportedIds, setLastImportedIds] = useState<string[]>([])
  const [inspectId, setInspectId] = useState<string | null>(null)
  const inspected = datasets.find(d => d.dataset_id === inspectId)

  // Fetch dynamic limits from backend configuration
  useEffect(() => {
    getUploadLimits().then(setLimits).catch(() => null)
    loadCollections()
  }, [])

  const loadCollections = () => {
    getDatasetCollections().then(res => setCollections(res.collections)).catch(() => null)
  }

  const effectiveMaxFileMb = limits ? limits.max_bytes_mb : 100
  const effectiveMaxZipMb = limits ? limits.max_zip_bytes_mb : 500
  const effectiveMaxBatchMb = limits ? limits.max_batch_bytes_mb : 600
  const effectiveMaxBatchCount = limits ? limits.max_batch_files : 100

  const handleSingleUpload = async () => {
    if (!file) return
    const maxBytes = limits ? limits.max_bytes : 100 * 1024 * 1024
    if (file.size > maxBytes) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the configured ${effectiveMaxFileMb} MB individual file limit.`)
      return
    }
    setBusy(true); setError(null); setBatchResult(null)
    try {
      const ds = await uploadDataset(file, name)
      await reload(); loadCollections(); setInspectId(ds.dataset_id)
      if (ds.status === 'FAILED') setError(ds.error || 'Dataset processing failed.')
      setFile(null); setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleBatchUpload = async () => {
    if (!batchFiles.length) return
    const totalBytes = batchFiles.reduce((sum, f) => sum + f.size, 0)
    const maxBatchBytes = limits ? limits.max_batch_bytes : 600 * 1024 * 1024
    if (totalBytes > maxBatchBytes) {
      setError(`Selected batch size (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the ${effectiveMaxBatchMb} MB total limit.`)
      return
    }
    if (batchFiles.length > effectiveMaxBatchCount) {
      setError(`File count (${batchFiles.length}) exceeds the maximum ${effectiveMaxBatchCount} files limit.`)
      return
    }
    setBusy(true); setError(null); setBatchResult(null)
    try {
      const res = await uploadBatchDatasets(batchFiles)
      await reload(); loadCollections()
      setBatchResult({
        successful: res.successful,
        failed: res.failed,
        skipped: res.skipped || 0,
        skipped_files: res.skipped_files || [],
        errors: res.errors,
      })
      const importedIds = res.datasets.map(d => d.dataset_id)
      setLastImportedIds(importedIds)
      if (res.datasets.length > 0) setInspectId(res.datasets[0].dataset_id)
      setBatchFiles([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleZipUpload = async () => {
    if (!file) return
    const maxZipBytes = limits ? limits.max_zip_bytes : 500 * 1024 * 1024
    if (file.size > maxZipBytes) {
      setError(`ZIP archive size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the configured ${effectiveMaxZipMb} MB limit.`)
      return
    }
    setBusy(true); setError(null); setBatchResult(null)
    try {
      const res = await uploadZipDataset(file)
      await reload(); loadCollections()
      setBatchResult({
        successful: res.successful,
        failed: res.failed,
        skipped: res.skipped || 0,
        skipped_files: res.skipped_files || [],
        errors: res.errors,
      })
      const importedIds = res.datasets.map(d => d.dataset_id)
      setLastImportedIds(importedIds)
      if (res.datasets.length > 0) setInspectId(res.datasets[0].dataset_id)
      setFile(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ZIP upload failed.')
    } finally {
      setBusy(false)
    }
  }


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'single') void handleSingleUpload()
    else if (mode === 'zip') void handleZipUpload()
    else void handleBatchUpload()
  }

  const remove = async (id: string) => {
    try {
      await deleteDataset(id)
      await reload(); loadCollections()
      if (inspectId === id) setInspectId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header and Live Limits */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Source Explorer & Dataset Manager</h1>
          <p className="text-sm text-neutral-400">
            Upload, inspect, and select single files, entire directory folders, or ZIP archives for autonomous analysis.
          </p>
        </div>
        <div className="text-xs text-neutral-300 bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex flex-wrap items-center gap-3">
          <span className="text-neutral-400 font-semibold uppercase tracking-wider">Configured Limits:</span>
          <span className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-200">File: ≤ {effectiveMaxFileMb} MB</span>
          <span className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-200">ZIP: ≤ {effectiveMaxZipMb} MB</span>
          <span className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-200">Batch/Folder: ≤ {effectiveMaxBatchMb} MB (≤ {effectiveMaxBatchCount} files)</span>
          {limits && (
            <span className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-300">
              Rows: ≤ {limits.max_rows.toLocaleString()} · Cols: ≤ {limits.max_columns}
            </span>
          )}
        </div>
      </div>

      {/* 3 Unified Upload / Selection Modes */}
      <form onSubmit={handleSubmit} className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider mr-2">Selection Source:</span>
          {(['single', 'folder', 'zip', 'batch'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
                setBatchResult(null)
                setFile(null)
                setBatchFiles([])
              }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                mode === m
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {m === 'single' ? '📄 Select File' : m === 'folder' ? '📁 Select Folder' : m === 'zip' ? '🗜️ Select ZIP Archive' : '📑 Batch Files'}
            </button>
          ))}
        </div>

        {mode === 'single' && (
          <div className="space-y-3">
            <p className="text-neutral-400 text-xs">
              Upload a single data file (.csv, .xlsx, .xls, .json) to analyze independently. (Limit: ≤ {effectiveMaxFileMb} MB).
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm text-neutral-300">
                Dataset name
                <input
                  aria-label="Dataset name"
                  className={inputClass}
                  value={name}
                  maxLength={120}
                  required
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Q4 Sales"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-300">
                Data file
                <input
                  aria-label="Dataset file"
                  type="file"
                  accept=".csv,.xlsx,.xls,.json"
                  required
                  className="text-sm text-neutral-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </label>
              {file && (
                <span className="text-xs text-neutral-400 self-center">
                  Size: {(file.size / (1024 * 1024)).toFixed(2)} MB / Max: {effectiveMaxFileMb} MB
                </span>
              )}
              <button
                disabled={busy || !file || !name.trim()}
                className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition"
              >
                {busy ? 'Processing…' : 'Upload & Analyze File'}
              </button>
            </div>
          </div>
        )}

        {mode === 'folder' && (
          <div className="space-y-3">
            <p className="text-neutral-400 text-xs">
              Select an entire directory folder. All supported files (.csv, .xlsx, .xls, .json) across nested subfolders will be recursively discovered and preserved with relative paths. (Limit: ≤ {effectiveMaxBatchMb} MB, ≤ {effectiveMaxBatchCount} files).
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm text-neutral-300">
                Choose Folder
                <input
                  aria-label="Select folder"
                  type="file"
                  // @ts-expect-error webkitdirectory attribute supported in Chromium and modern browsers
                  webkitdirectory=""
                  directory=""
                  multiple
                  required
                  className="text-sm text-neutral-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                  onChange={e => setBatchFiles(Array.from(e.target.files || []))}
                />
              </label>
              {batchFiles.length > 0 && (
                <span className="text-xs text-neutral-400 self-center">
                  {batchFiles.length} file(s) found ({(batchFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB / Max: {effectiveMaxBatchMb} MB)
                </span>
              )}
              <button
                disabled={busy || !batchFiles.length}
                className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition"
              >
                {busy ? 'Processing folder hierarchy…' : `Ingest Folder (${batchFiles.length} files)`}
              </button>
            </div>
          </div>
        )}

        {mode === 'zip' && (
          <div className="space-y-3">
            <p className="text-neutral-400 text-xs">
              Upload a ZIP archive containing files and folders (Limit: ≤ {effectiveMaxZipMb} MB). Entries are extracted into secure, isolated storage with Zip Slip, symlink, and compression-ratio guards.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm text-neutral-300">
                Choose ZIP Archive
                <input
                  aria-label="ZIP file"
                  type="file"
                  accept=".zip"
                  required
                  className="text-sm text-neutral-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </label>
              {file && (
                <span className="text-xs text-neutral-400 self-center">
                  Archive Size: {(file.size / (1024 * 1024)).toFixed(2)} MB / Max: {effectiveMaxZipMb} MB
                </span>
              )}
              <button
                disabled={busy || !file}
                className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition"
              >
                {busy ? 'Extracting & validating archive…' : 'Extract & Ingest ZIP'}
              </button>
            </div>
          </div>
        )}

        {mode === 'batch' && (
          <div className="space-y-3">
            <p className="text-neutral-400 text-xs">
              Select multiple independent files to ingest as separate datasets. (Limit: ≤ {effectiveMaxBatchMb} MB, ≤ {effectiveMaxBatchCount} files).
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm text-neutral-300">
                Choose files
                <input
                  aria-label="Select files"
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls,.json"
                  required
                  className="text-sm text-neutral-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                  onChange={e => setBatchFiles(Array.from(e.target.files || []))}
                />
              </label>
              {batchFiles.length > 0 && (
                <span className="text-xs text-neutral-400 self-center">
                  {batchFiles.length} file(s) selected ({(batchFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB)
                </span>
              )}
              <button
                disabled={busy || !batchFiles.length}
                className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition"
              >
                {busy ? 'Processing batch…' : `Upload ${batchFiles.length} files`}
              </button>
            </div>
          </div>
        )}

        {busy && <p role="status" className="text-sm text-neutral-400 animate-pulse">Processing, profiling, and indexing data...</p>}
        {error && <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded p-3">{error}</p>}

        {batchResult && (
          <div role="status" className="space-y-3 pt-3 border-t border-neutral-800 text-sm">
            {batchResult.successful > 0 && (
              <div className="bg-emerald-950/30 border border-emerald-900/60 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-300 font-medium">
                    ✓ Successfully imported {batchResult.successful} dataset{batchResult.successful === 1 ? '' : 's'}.
                  </span>
                  <span className="text-xs text-emerald-400/80">Ready for autonomous analytics</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {lastImportedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void select(lastImportedIds[0]).then(() => navigate('/dashboard'))}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded transition"
                    >
                      Select First Dataset & Open Dashboard
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBatchResult(null)}
                    className="px-3 py-1.5 text-neutral-400 hover:text-neutral-200 text-xs"
                  >
                    Dismiss notification
                  </button>
                </div>
              </div>
            )}

            {batchResult.skipped > 0 && (
              <div className="text-neutral-400 bg-neutral-950/40 border border-neutral-800 rounded px-3 py-2 text-xs">
                <span className="text-neutral-300 font-medium">{batchResult.skipped} unsupported/non-data file(s) safely skipped:</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-neutral-400">
                  {batchResult.skipped_files.map((sk, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-neutral-300">{sk.path || sk.filename}</span>: {sk.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {batchResult.failed > 0 && (
              <div className="text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded p-3 space-y-1">
                <p className="font-medium">{batchResult.failed} file{batchResult.failed === 1 ? '' : 's'} could not be imported:</p>
                <ul className="list-disc list-inside text-xs text-amber-200/80 space-y-0.5">
                  {batchResult.errors.map((err, idx) => (
                    <li key={idx}>
                      <span className="font-mono text-neutral-200">{err.path || err.filename}</span>: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </form>

      {/* Discovered Collections & Archives Explorer */}
      {collections.length > 0 && (
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-neutral-200">Discovered Collections & Folders</h2>
              <p className="text-xs text-neutral-400">
                Discovered files grouped by origin archive or directory. Select any file below to analyze it.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {collections.map(col => (
              <div key={col.collection_name} className="border border-neutral-800 rounded-lg p-4 bg-neutral-950/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase px-2 py-0.5 rounded font-mono bg-neutral-800 text-blue-400">
                      {col.source_type}
                    </span>
                    <span className="font-medium text-neutral-200">{col.collection_name}</span>
                    <span className="text-xs text-neutral-400">
                      ({col.dataset_count} file{col.dataset_count === 1 ? '' : 's'}, {col.total_rows.toLocaleString()} total rows)
                    </span>
                  </div>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-neutral-400">
                      <tr>
                        <th className="py-1 px-2">Relative File Path</th>
                        <th className="py-1 px-2">Status</th>
                        <th className="py-1 px-2">Rows</th>
                        <th className="py-1 px-2">Columns</th>
                        <th className="py-1 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900">
                      {col.datasets.map(f => (
                        <tr key={f.dataset_id} className="hover:bg-neutral-900/50">
                          <td className="py-2 px-2 font-mono text-neutral-300">
                            {f.provenance?.relative_path || f.dataset_name}
                            {active?.dataset_id === f.dataset_id && (
                              <span className="ml-2 text-blue-400 font-sans font-medium">★ Active</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                              f.status === 'READY' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                            }`}>
                              {f.status}
                            </span>
                          </td>
                          <td className="py-2 px-2">{f.row_count.toLocaleString()}</td>
                          <td className="py-2 px-2">{f.column_count}</td>
                          <td className="py-2 px-2 text-right space-x-2">
                            <button
                              disabled={f.status !== 'READY'}
                              onClick={() => void select(f.dataset_id).catch(e => setError(e.message))}
                              className="text-blue-400 hover:text-blue-300 disabled:text-neutral-600"
                            >
                              Select File
                            </button>
                            <button
                              onClick={() => setInspectId(f.dataset_id)}
                              className="text-neutral-300 hover:text-white"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Primary Datasets Registry Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-neutral-200">All Available Datasets</h2>
          {active && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400">Active Source:</span>
              <span className="text-blue-400 font-semibold">{active.dataset_name}</span>
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded transition"
              >
                📊 Dashboard
              </button>
              <button
                onClick={() => navigate('/insights')}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded transition"
              >
                💡 Insights
              </button>
              <button
                onClick={() => navigate('/ml/forecast')}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded transition"
              >
                🔮 ML Forecast
              </button>
            </div>
          )}
        </div>

        <div className="overflow-auto border border-neutral-800 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-900 text-neutral-300">
              <tr>
                {['Dataset / Source Path', 'Type', 'Status', 'Rows', 'Columns', 'Actions'].map(h => (
                  <th className="p-3" key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datasets.map(d => (
                <tr key={d.dataset_id} className="border-t border-neutral-800 hover:bg-neutral-900/40">
                  <td className="p-3">
                    <div className="font-medium text-neutral-200">
                      {d.dataset_name}
                      {active?.dataset_id === d.dataset_id && (
                        <span className="text-blue-400 text-xs ml-2 font-normal bg-blue-950/60 border border-blue-900/60 px-2 py-0.5 rounded">
                          Active Selection
                        </span>
                      )}
                    </div>
                    {d.provenance?.relative_path && (
                      <p className="text-xs text-neutral-500 font-mono mt-0.5">{d.provenance.relative_path}</p>
                    )}
                  </td>
                  <td className="p-3 text-xs text-neutral-400 uppercase">
                    {d.provenance?.source_type || d.source_type || 'file'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      d.status === 'READY' ? 'bg-emerald-950/60 text-emerald-400' : 'bg-amber-950/60 text-amber-400'
                    }`}>
                      {d.status}
                    </span>
                    {d.error && <p className="text-xs text-red-400 mt-1">{d.error}</p>}
                  </td>
                  <td className="p-3">{d.row_count.toLocaleString()}</td>
                  <td className="p-3">{d.column_count}</td>
                  <td className="p-3 space-x-3">
                    <button
                      disabled={d.status !== 'READY'}
                      onClick={() => void select(d.dataset_id).catch(e => setError(e.message))}
                      className="text-blue-400 hover:text-blue-300 disabled:text-neutral-600 font-medium"
                    >
                      Select
                    </button>
                    <button
                      onClick={() => setInspectId(d.dataset_id)}
                      className="text-neutral-300 hover:text-white"
                    >
                      Inspect
                    </button>
                    {!d.read_only && (
                      <button
                        className="text-red-400 hover:text-red-300"
                        onClick={() => void remove(d.dataset_id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!datasets.length && <p className="p-4 text-neutral-400">No datasets yet. Upload a file, folder, or ZIP archive to begin.</p>}
        </div>
      </section>

      {/* Dataset Schema & Quality Inspector */}
      {inspected && (
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-800 pb-3">
            <div>
              <h2 className="text-lg font-medium text-neutral-100">{inspected.dataset_name} — Profile & Schema</h2>
              {inspected.provenance?.relative_path && (
                <p className="text-xs text-neutral-400 font-mono mt-0.5">Source path: {inspected.provenance.relative_path}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={inspected.status !== 'READY'}
                onClick={() => void select(inspected.dataset_id).catch(e => setError(e.message))}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50 transition"
              >
                Set as Active for Analytics
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded p-3">
              <span className="text-xs text-neutral-500 block">Total Rows</span>
              <span className="font-semibold text-neutral-200">{inspected.row_count.toLocaleString()}</span>
            </div>
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded p-3">
              <span className="text-xs text-neutral-500 block">Total Columns</span>
              <span className="font-semibold text-neutral-200">{inspected.column_count}</span>
            </div>
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded p-3">
              <span className="text-xs text-neutral-500 block">Missing Values</span>
              <span className="font-semibold text-neutral-200">{inspected.quality.missing_values ?? 'None'}</span>
            </div>
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded p-3">
              <span className="text-xs text-neutral-500 block">Duplicate Rows</span>
              <span className="font-semibold text-neutral-200">{inspected.quality.duplicate_rows ?? '0'}</span>
            </div>
          </div>

          {inspected.quality.warnings && inspected.quality.warnings.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-900/60 rounded p-3 space-y-1">
              <span className="text-xs font-semibold text-amber-300 uppercase">Data Quality Warnings:</span>
              {inspected.quality.warnings.map(w => <p key={w} className="text-amber-300/90 text-xs">{w}</p>)}
            </div>
          )}

          <div className="overflow-auto border border-neutral-800 rounded">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-900 text-neutral-300">
                <tr>
                  {['Field Name', 'Type', 'Detected Role', 'Confidence', 'Missing', 'Unique'].map(h => (
                    <th key={h} className="p-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {inspected.schema.columns?.map(c => (
                  <tr key={c.name} className="hover:bg-neutral-900/40">
                    <td className="p-2.5 font-medium text-neutral-200">{c.name}</td>
                    <td className="p-2.5 text-neutral-400 font-mono">{c.dtype}</td>
                    <td className="p-2.5 text-blue-400 font-medium">{c.role}</td>
                    <td className="p-2.5">{Math.round(c.confidence * 100)}%</td>
                    <td className="p-2.5 text-neutral-400">{c.missing}</td>
                    <td className="p-2.5 text-neutral-400">{c.unique}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Analytical Capabilities</h3>
            <div className="grid sm:grid-cols-3 gap-2 text-xs">
              {Object.entries(inspected.capabilities).map(([feature, c]) => (
                <div key={feature} className="border border-neutral-800 p-2.5 rounded bg-neutral-950/40">
                  <div className="flex items-center justify-between">
                    <strong className="capitalize text-neutral-200">{feature}</strong>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      c.available ? 'bg-emerald-950 text-emerald-400' : 'bg-neutral-800 text-neutral-500'
                    }`}>
                      {c.available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  {c.reason && <p className="text-neutral-400 mt-1">{c.reason}</p>}
                </div>
              ))}
            </div>
          </div>

          {!inspected.read_only && inspected.status === 'READY' && (
            <div className="pt-2 border-t border-neutral-800">
              <h3 className="text-sm font-medium text-neutral-200 mb-2">Refine Semantic Mappings</h3>
              <SchemaReview key={inspected.dataset_id} dataset={inspected} saved={reload} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
