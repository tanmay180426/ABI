import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataset } from '@/hooks/useDataset'
import {
  deleteDataset,
  uploadDataset,
  uploadBatchDatasets,
  uploadZipDataset,
  updateDatasetSchema,
  createAnalysisSession,
  type Dataset,
} from '@/services/api'

const ROLES = ['date', 'revenue', 'currency', 'quantity', 'price', 'customer', 'order', 'product', 'seller', 'category', 'location', 'status', 'rating', 'delivery_date', 'estimated_date', 'weight_g']
const inputClass = 'bg-neutral-900 border border-neutral-700 rounded px-3 py-2'

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
      await updateDatasetSchema(dataset.dataset_id, { fields, currency_code: currency || null, domain, ...(dateOrder ? { date_order: dateOrder } : {}) })
      await saved(); setMessage('Schema confirmed.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Schema could not be saved.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <p className="text-sm text-neutral-400">Automatic mappings are shown below. Correct only fields that need clarification. Monetary units must be confirmed before using models trained in those units.</p>
    <div className="grid sm:grid-cols-3 gap-3 text-sm">
      {ROLES.map(role => <label key={role} className="flex flex-col gap-1">{role.replace(/_/g, ' ')}
        <select aria-label={`Map ${role}`} className={inputClass} value={fields[role] || ''} onChange={e => setFields({ ...fields, [role]: e.target.value || null })}>
          <option value="">Not detected / unused</option>
          {dataset.schema.columns?.map(c => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>)}
      <label className="flex flex-col gap-1">Currency
        <select aria-label="Currency" className={inputClass} value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="">Unknown / no currency</option>{['BRL', 'USD', 'INR', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">Dataset domain
        <select aria-label="Dataset domain" className={inputClass} value={domain} onChange={e => setDomain(e.target.value)}>
          {['general', 'commerce', 'transactions'].map(d => <option key={d}>{d}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">Ambiguous date order
        <select aria-label="Ambiguous date order" className={inputClass} value={dateOrder} onChange={e => setDateOrder(e.target.value)}>
          <option value="">Keep automatic detection</option><option value="dayfirst">Day / month / year</option><option value="monthfirst">Month / day / year</option>
        </select>
      </label>
    </div>
    <button disabled={busy} onClick={() => void save()} className="bg-blue-600 rounded px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Saving…' : 'Confirm schema'}</button>
    {message && <p role="status">{message}</p>}
  </div>
}

export default function Datasets() {
  const { datasets, active, reload, select } = useDataset()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'single' | 'batch' | 'zip' | 'folder'>('single')
  const [file, setFile] = useState<File | null>(null)
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const handleSingleUpload = async () => {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the configured 100 MB individual file limit.`)
      return
    }
    setBusy(true); setError(null); setBatchResult(null)
    try {
      const ds = await uploadDataset(file, name)
      await reload(); setInspectId(ds.dataset_id)
      if (ds.status === 'FAILED') setError(ds.error || 'Dataset processing failed.')
      setFile(null); setName('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed.') }
    finally { setBusy(false) }
  }

  const handleBatchUpload = async () => {
    if (!batchFiles.length) return
    const totalBytes = batchFiles.reduce((sum, f) => sum + f.size, 0)
    if (totalBytes > 600 * 1024 * 1024) {
      setError(`Batch total size (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the 600 MB batch limit.`)
      return
    }
    if (batchFiles.length > 100) {
      setError(`Batch file count (${batchFiles.length}) exceeds the 100 files limit.`)
      return
    }
    setBusy(true); setError(null); setBatchResult(null)
    try {
      const res = await uploadBatchDatasets(batchFiles)
      await reload()
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
    } catch (e) { setError(e instanceof Error ? e.message : 'Batch upload failed.') }
    finally { setBusy(false) }
  }

  const handleZipUpload = async () => {
    if (!file) return
    if (file.size > 500 * 1024 * 1024) {
      setError(`ZIP archive size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the configured 500 MB ZIP limit.`)
      return
    }
    setBusy(true); setError(null); setBatchResult(null)
    try {
      const res = await uploadZipDataset(file)
      await reload()
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
    } catch (e) { setError(e instanceof Error ? e.message : 'ZIP upload failed.') }
    finally { setBusy(false) }
  }

  const handleCreateAnalysisWithImports = async () => {
    if (!lastImportedIds.length) return
    try {
      const sess = await createAnalysisSession({
        name: `Analysis (${new Date().toLocaleDateString()})`,
        dataset_ids: lastImportedIds,
        mode: 'compare',
      })
      navigate('/multi-dataset-analysis')
    } catch {
      navigate('/multi-dataset-analysis')
    }
  }

  const handleAddToCurrentAnalysis = () => {
    navigate('/multi-dataset-analysis')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'single') void handleSingleUpload()
    else if (mode === 'zip') void handleZipUpload()
    else void handleBatchUpload()
  }

  const remove = async (id: string) => {
    try { await deleteDataset(id); await reload(); setInspectId(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed.') }
  }

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold">Dataset Manager</h1>
        <p className="text-sm text-neutral-400">Manage private uploaded datasets, view data profiling, and configure schema mappings.</p>
      </div>
      <div className="text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 flex items-center gap-2">
        <span className="text-neutral-500 font-medium">Configured Limits:</span>
        <span>File: ≤ 100 MB</span>
        <span>•</span>
        <span>ZIP: ≤ 500 MB</span>
        <span>•</span>
        <span>Batch: ≤ 600 MB (100 files)</span>
      </div>
    </div>

    <form onSubmit={handleSubmit} className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4 shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider mr-2">Upload Mode:</span>
        {(['single', 'batch', 'zip', 'folder'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); setBatchResult(null); setFile(null); setBatchFiles([]) }}
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              mode === m ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {m === 'single' ? 'Single File' : m === 'batch' ? 'Batch Files' : m === 'zip' ? 'ZIP Archive' : 'Folder'}
          </button>
        ))}
      </div>

      {mode === 'single' && (
        <>
          <p className="text-neutral-400 text-xs">Upload a single CSV, XLSX/XLS, or flat-record JSON file with a custom dataset name (Max: 100 MB).</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">Dataset name<input aria-label="Dataset name" className={inputClass} value={name} maxLength={120} required onChange={e => setName(e.target.value)} placeholder="e.g. Q4 Sales" /></label>
            <label className="flex flex-col gap-1 text-sm">Dataset file
              <input aria-label="Dataset file" type="file" accept=".csv,.xlsx,.xls,.json" required onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            {file && (
              <span className="text-xs text-neutral-400 self-center">
                Size: {(file.size / (1024 * 1024)).toFixed(2)} MB (Limit: 100 MB)
              </span>
            )}
            <button disabled={busy || !file || !name.trim()} className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors">
              {busy ? 'Processing…' : 'Upload dataset'}
            </button>
          </div>
        </>
      )}

      {mode === 'batch' && (
        <>
          <p className="text-neutral-400 text-xs">Select multiple data files (.csv, .xlsx, .xls, .json) to ingest as separate datasets in one batch (Max: 600 MB, up to 100 files).</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">Select files
              <input
                aria-label="Select files"
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                required
                onChange={e => setBatchFiles(Array.from(e.target.files || []))}
              />
            </label>
            {batchFiles.length > 0 && (
              <span className="text-xs text-neutral-400 self-center">
                {batchFiles.length} file(s) selected ({(batchFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB / Max: 600 MB)
              </span>
            )}
            <button disabled={busy || !batchFiles.length} className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors">
              {busy ? 'Processing batch…' : `Upload ${batchFiles.length ? `${batchFiles.length} files` : 'batch'}`}
            </button>
          </div>
        </>
      )}

      {mode === 'zip' && (
        <>
          <p className="text-neutral-400 text-xs">Upload a ZIP archive (Max: 500 MB). Supported data files (.csv, .xlsx, .xls, .json), including nested folders, will be safely extracted and ingested.</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">ZIP archive file
              <input aria-label="ZIP file" type="file" accept=".zip" required onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            {file && (
              <span className="text-xs text-neutral-400 self-center">
                Selected ZIP: {(file.size / (1024 * 1024)).toFixed(2)} MB (Configured Limit: 500 MB)
              </span>
            )}
            <button disabled={busy || !file} className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors">
              {busy ? 'Extracting & processing…' : 'Extract & Ingest ZIP'}
            </button>
          </div>
        </>
      )}

      {mode === 'folder' && (
        <>
          <p className="text-neutral-400 text-xs">Select a local directory. All supported CSV, XLSX, XLS, and JSON files within nested folders will be ingested.</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">Select folder
              <input
                aria-label="Select folder"
                type="file"
                // @ts-expect-error webkitdirectory attribute is supported by modern browsers
                webkitdirectory=""
                directory=""
                multiple
                required
                onChange={e => setBatchFiles(Array.from(e.target.files || []))}
              />
            </label>
            {batchFiles.length > 0 && (
              <span className="text-xs text-neutral-400 self-center">
                {batchFiles.length} file(s) found ({(batchFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB / Max: 600 MB)
              </span>
            )}
            <button disabled={busy || !batchFiles.length} className="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors">
              {busy ? 'Processing folder…' : `Upload folder (${batchFiles.length} files)`}
            </button>
          </div>
        </>
      )}

      {busy && <p role="status" className="text-sm text-neutral-400 animate-pulse">Processing and profiling datasets…</p>}
      {error && <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded p-3">{error}</p>}

      {batchResult && (
        <div role="status" className="space-y-3 pt-3 border-t border-neutral-800 text-sm">
          {batchResult.successful > 0 && (
            <div className="bg-emerald-950/30 border border-emerald-900/60 rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-emerald-300 font-medium">
                  ✓ Successfully imported {batchResult.successful} dataset{batchResult.successful === 1 ? '' : 's'}.
                </span>
                <span className="text-xs text-emerald-400/80">Ready for analysis</span>
              </div>

              {/* POST-UPLOAD ACTIONS (Section 6 Requirement) */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleAddToCurrentAnalysis}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-semibold text-xs rounded transition"
                >
                  Add all successful imports to current analysis
                </button>
                <button
                  type="button"
                  onClick={handleCreateAnalysisWithImports}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-emerald-800 font-medium text-xs rounded transition"
                >
                  Create a new analysis with these imports
                </button>
                <button
                  type="button"
                  onClick={() => setBatchResult(null)}
                  className="px-3 py-1.5 text-neutral-400 hover:text-neutral-200 text-xs"
                >
                  Return to Dataset Manager
                </button>
              </div>
            </div>
          )}

          {batchResult.skipped > 0 && (
            <div className="text-neutral-400 bg-neutral-950/40 border border-neutral-800 rounded px-3 py-2 text-xs">
              <span className="text-neutral-300 font-medium">{batchResult.skipped} non-data file(s) skipped</span> (e.g., text notes or documentation):
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
    <div className="overflow-auto border border-neutral-800 rounded-lg">
      <table className="w-full text-sm text-left"><thead className="bg-neutral-900"><tr>{['Dataset', 'Status', 'Rows', 'Columns', 'Actions'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead>
        <tbody>{datasets.map(d => <tr key={d.dataset_id} className="border-t border-neutral-800">
          <td className="p-3">{d.dataset_name}{active?.dataset_id === d.dataset_id && <span className="text-blue-400 ml-2">Active</span>}</td>
          <td className="p-3">{d.status}{d.error && <p className="text-red-400">{d.error}</p>}</td><td className="p-3">{d.row_count}</td><td className="p-3">{d.column_count}</td>
          <td className="p-3 space-x-3"><button disabled={d.status !== 'READY'} onClick={() => void select(d.dataset_id).catch(e => setError(e.message))} className="text-blue-400 disabled:text-neutral-600">Select</button>
            <button onClick={() => setInspectId(d.dataset_id)}>Inspect</button>{!d.read_only && <button className="text-red-400" onClick={() => void remove(d.dataset_id)}>Delete</button>}</td>
        </tr>)}</tbody></table>
      {!datasets.length && <p className="p-4 text-neutral-400">No datasets yet. Upload one to begin.</p>}
    </div>
    {inspected && <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-medium">{inspected.dataset_name} — Schema and quality</h2>
      <p className="text-sm">Missing values: {inspected.quality.missing_values ?? 'Unavailable'} · Duplicate rows: {inspected.quality.duplicate_rows ?? 'Unavailable'}</p>
      {inspected.quality.warnings?.map(w => <p key={w} className="text-amber-400 text-sm">{w}</p>)}
      <div className="overflow-auto"><table className="w-full text-sm text-left"><thead><tr>{['Field', 'Type', 'Detected role', 'Confidence', 'Missing', 'Unique'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{inspected.schema.columns?.map(c => <tr key={c.name} className="border-t border-neutral-800">{[c.name, c.dtype, c.role, `${Math.round(c.confidence * 100)}%`, c.missing, c.unique].map((v, i) => <td key={i} className="p-2">{v}</td>)}</tr>)}</tbody></table></div>
      <div className="grid sm:grid-cols-3 gap-2 text-sm">{Object.entries(inspected.capabilities).map(([feature, c]) => <div key={feature} className="border border-neutral-800 p-3 rounded"><strong className="capitalize">{feature}</strong>: {c.available ? 'Available' : 'Not available'}{c.reason && <p className="text-neutral-400 mt-1">{c.reason}</p>}</div>)}</div>
      {!inspected.read_only && inspected.status === 'READY' && <SchemaReview key={inspected.dataset_id} dataset={inspected} saved={reload} />}
    </section>}
  </div>
}
