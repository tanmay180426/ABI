import { useEffect, useState } from 'react'
import {
  listDatasets,
  listAnalysisSessions,
  createAnalysisSession,
  updateAnalysisSession,
  deleteAnalysisSession,
  addDatasetsToSession,
  removeDatasetFromSession,
  runDatasetComparison,
  checkCombineCompatibility,
  previewCombine,
  executeCombine,
  runCrossDatasetInsights,
  uploadZipDataset,
  uploadBatchDatasets,
  type Dataset,
  type AnalysisSession,
  type CompareResult,
  type CombineCompatibilityResult,
  type CombinePreviewResult,
  type CrossDatasetInsightsResult,
} from '@/services/api'
import { useDataset } from '@/hooks/useDataset'

export default function MultiDatasetAnalysis() {
  const { reload: reloadGlobalDatasets } = useDataset()

  // Datasets state
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Sessions state
  const [sessions, setSessions] = useState<AnalysisSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)

  // Mode state: 'compare' | 'combine' | 'insights'
  const [mode, setMode] = useState<'compare' | 'combine' | 'insights'>('compare')

  // Execution & Loading states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Mode A Results
  const [compareData, setCompareData] = useState<CompareResult | null>(null)

  // Mode B State & Results
  const [compatData, setCompatData] = useState<CombineCompatibilityResult | null>(null)
  const [combineOp, setCombineOp] = useState<'union' | 'join'>('union')
  const [joinKey, setJoinKey] = useState('')
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'outer'>('inner')
  const [combinePreview, setCombinePreview] = useState<CombinePreviewResult | null>(null)
  const [outputDatasetName, setOutputDatasetName] = useState('')
  const [executingCombine, setExecutingCombine] = useState(false)

  // Mode C Results
  const [insightsData, setInsightsData] = useState<CrossDatasetInsightsResult | null>(null)

  // Direct Upload in Workspace
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadMode, setUploadMode] = useState<'zip' | 'folder'>('zip')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadFolderFiles, setUploadFolderFiles] = useState<File[]>([])
  const [uploadBusy, setUploadBusy] = useState(false)

  // Load datasets and sessions
  const loadInitialData = async () => {
    try {
      const [dsRes, sessRes] = await Promise.all([listDatasets(), listAnalysisSessions()])
      setDatasets(dsRes.datasets)
      setSessions(sessRes.sessions)
      if (sessRes.sessions.length > 0 && !activeSessionId) {
        const first = sessRes.sessions[0]
        setActiveSessionId(first.id)
        setSessionName(first.name)
        setSelectedIds(first.dataset_ids || [])
        setMode(first.mode || 'compare')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load initial data.')
    }
  }

  useEffect(() => {
    void loadInitialData()
  }, [])

  // Switch session
  const handleSelectSession = (sessId: string) => {
    if (!sessId) {
      setActiveSessionId(null)
      setSessionName('')
      setSelectedIds([])
      return
    }
    const sess = sessions.find((s) => s.id === sessId)
    if (sess) {
      setActiveSessionId(sess.id)
      setSessionName(sess.name)
      setSelectedIds(sess.dataset_ids || [])
      setMode(sess.mode || 'compare')
      setCompareData(null)
      setCompatData(null)
      setCombinePreview(null)
      setInsightsData(null)
      setError(null)
    }
  }

  // Create new session
  const handleCreateSession = async () => {
    if (!sessionName.trim()) return
    setLoading(true)
    setError(null)
    try {
      const sess = await createAnalysisSession({
        name: sessionName.trim(),
        dataset_ids: selectedIds,
        mode,
      })
      setSessions([sess, ...sessions])
      setActiveSessionId(sess.id)
      setCreatingSession(false)
      setSuccessMsg(`Session "${sess.name}" created.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session.')
    } finally {
      setLoading(false)
    }
  }

  // Save / Update active session
  const handleSaveSession = async () => {
    if (!activeSessionId) return
    try {
      const updated = await updateAnalysisSession(activeSessionId, {
        name: sessionName,
        dataset_ids: selectedIds,
        mode,
      })
      setSessions(sessions.map((s) => (s.id === updated.id ? updated : s)))
      setSuccessMsg('Session saved.')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save session.')
    }
  }

  // Delete session (never touches source datasets)
  const handleDeleteSession = async () => {
    if (!activeSessionId) return
    if (!confirm('Are you sure you want to delete this analysis session? The source datasets will remain completely untouched.')) return
    try {
      await deleteAnalysisSession(activeSessionId)
      const remaining = sessions.filter((s) => s.id !== activeSessionId)
      setSessions(remaining)
      if (remaining.length > 0) {
        handleSelectSession(remaining[0].id)
      } else {
        setActiveSessionId(null)
        setSessionName('')
        setSelectedIds([])
      }
      setSuccessMsg('Session deleted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session.')
    }
  }

  // Toggle dataset selection
  const toggleDataset = async (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)

    // If inside active session, update session dataset membership
    if (activeSessionId) {
      try {
        if (selectedIds.includes(id)) {
          await removeDatasetFromSession(activeSessionId, id)
        } else {
          await addDatasetsToSession(activeSessionId, [id])
        }
      } catch {
        // Soft fail
      }
    }
  }

  const selectAll = () => {
    const allEligible = datasets.filter((d) => d.status === 'READY').map((d) => d.dataset_id)
    setSelectedIds(allEligible)
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  // Run analysis based on selected mode
  const handleRunAnalysis = async () => {
    if (selectedIds.length < 2) {
      setError('Please select at least 2 datasets to run multi-dataset analysis.')
      return
    }
    setLoading(true)
    setError(null)
    setCompareData(null)
    setCompatData(null)
    setCombinePreview(null)
    setInsightsData(null)

    try {
      if (mode === 'compare') {
        const res = await runDatasetComparison(selectedIds)
        setCompareData(res)
      } else if (mode === 'combine') {
        const res = await checkCombineCompatibility(selectedIds.slice(0, 2))
        setCompatData(res)
        if (res.join.has_candidates && res.join.candidate_keys.length > 0) {
          setJoinKey(res.join.candidate_keys[0].key)
        }
      } else if (mode === 'insights') {
        const res = await runCrossDatasetInsights(selectedIds)
        setInsightsData(res)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  // Mode B: Preview Combine
  const handlePreviewCombine = async () => {
    if (selectedIds.length < 2) return
    setLoading(true)
    setError(null)
    try {
      const res = await previewCombine({
        operation: combineOp,
        dataset_ids: selectedIds.slice(0, 2),
        join_key: combineOp === 'join' ? joinKey : undefined,
        join_type: combineOp === 'join' ? joinType : undefined,
      })
      setCombinePreview(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed.')
    } finally {
      setLoading(false)
    }
  }

  // Mode B: Execute Combine
  const handleExecuteCombine = async () => {
    if (selectedIds.length < 2) return
    setExecutingCombine(true)
    setError(null)
    try {
      const newDs = await executeCombine({
        operation: combineOp,
        dataset_ids: selectedIds.slice(0, 2),
        output_name: outputDatasetName.trim() || undefined,
        join_key: combineOp === 'join' ? joinKey : undefined,
        join_type: combineOp === 'join' ? joinType : undefined,
      })
      await reloadGlobalDatasets()
      const dsRes = await listDatasets()
      setDatasets(dsRes.datasets)
      setSuccessMsg(`Combined dataset "${newDs.dataset_name}" created successfully!`)
      setCombinePreview(null)
      setOutputDatasetName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Combine execution failed.')
    } finally {
      setExecutingCombine(false)
    }
  }

  // Upload ZIP or folder directly into analysis
  const handleDirectUpload = async () => {
    setUploadBusy(true)
    setError(null)
    try {
      let res
      if (uploadMode === 'zip' && uploadFile) {
        res = await uploadZipDataset(uploadFile)
      } else if (uploadMode === 'folder' && uploadFolderFiles.length > 0) {
        res = await uploadBatchDatasets(uploadFolderFiles)
      }
      if (res && res.datasets.length > 0) {
        const newIds = res.datasets.map((d) => d.dataset_id)
        await reloadGlobalDatasets()
        const dsRes = await listDatasets()
        setDatasets(dsRes.datasets)

        // Add newly imported datasets to current selection
        const merged = Array.from(new Set([...selectedIds, ...newIds]))
        setSelectedIds(merged)
        if (activeSessionId) {
          await addDatasetsToSession(activeSessionId, newIds)
        }
        setSuccessMsg(`Successfully imported and added ${res.successful} dataset(s) to analysis!`)
        setShowUploadModal(false)
        setUploadFile(null)
        setUploadFolderFiles([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploadBusy(false)
    }
  }

  const filteredDatasets = datasets.filter((d) =>
    d.dataset_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.dataset_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Top Header & Session Management */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-neutral-100">Multi-Dataset Analysis</h1>
              <span className="px-2.5 py-0.5 text-xs rounded-full bg-blue-900/40 text-blue-300 border border-blue-700/50">
                Workspace
              </span>
            </div>
            <p className="text-sm text-neutral-400 mt-1">
              Select multiple datasets, manage analysis sessions, and compare or combine data with full validation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded border border-neutral-700 transition flex items-center gap-2"
            >
              <span>+</span> Upload ZIP / Folder to Analysis
            </button>
            <button
              onClick={() => setCreatingSession(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition"
            >
              New Analysis Session
            </button>
          </div>
        </div>

        {/* Ongoing Session Selector */}
        <div className="mt-4 pt-4 border-t border-neutral-800 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="session-select" className="text-neutral-400 font-medium">
            Active Session:
          </label>
          <select
            id="session-select"
            value={activeSessionId || ''}
            onChange={(e) => handleSelectSession(e.target.value)}
            className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-200"
          >
            <option value="">(No session - Ad-hoc analysis)</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.dataset_ids?.length || 0} datasets)
              </option>
            ))}
          </select>

          {activeSessionId && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1 text-xs text-neutral-200 w-44"
                placeholder="Session name"
              />
              <button
                onClick={handleSaveSession}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded border border-neutral-700 transition"
              >
                Save
              </button>
              <button
                onClick={handleDeleteSession}
                className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs rounded border border-red-800/60 transition"
              >
                Delete Session
              </button>
            </div>
          )}
        </div>

        {creatingSession && (
          <div className="mt-3 p-3 bg-neutral-950 rounded border border-neutral-800 flex items-center gap-3">
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Enter new session name (e.g., Q4 Cohort Analysis)"
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 flex-1 max-w-md"
            />
            <button
              onClick={handleCreateSession}
              disabled={loading || !sessionName.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setCreatingSession(false)}
              className="px-3 py-1.5 text-neutral-400 hover:text-neutral-200 text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-950/50 border border-red-900 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {successMsg && (
        <div role="status" className="p-3 bg-emerald-950/50 border border-emerald-900 rounded-lg text-sm text-emerald-300">
          {successMsg}
        </div>
      )}

      {/* Dataset Selection Table */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-neutral-200">Select Datasets to Analyze</h2>
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-neutral-800 text-neutral-300">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search datasets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1 text-xs text-neutral-200 w-48"
            />
            <button
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              Select All
            </button>
            <span className="text-neutral-700">|</span>
            <button
              onClick={clearSelection}
              className="text-xs text-neutral-400 hover:text-neutral-300 font-medium"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-neutral-800 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-900/90 text-neutral-400 text-xs uppercase">
              <tr>
                <th className="p-3 w-10">Select</th>
                <th className="p-3">Dataset Name</th>
                <th className="p-3">Dataset ID</th>
                <th className="p-3">Rows</th>
                <th className="p-3">Columns</th>
                <th className="p-3">Status</th>
                <th className="p-3">Source Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredDatasets.map((d) => {
                const isSelected = selectedIds.includes(d.dataset_id)
                return (
                  <tr
                    key={d.dataset_id}
                    onClick={() => toggleDataset(d.dataset_id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-950/20' : 'hover:bg-neutral-800/40'
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Select ${d.dataset_name}`}
                        className="rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
                      />
                    </td>
                    <td className="p-3 font-medium text-neutral-200">{d.dataset_name}</td>
                    <td className="p-3 font-mono text-xs text-neutral-400">{d.dataset_id.slice(0, 8)}…</td>
                    <td className="p-3">{d.row_count?.toLocaleString()}</td>
                    <td className="p-3">{d.column_count}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs rounded font-medium ${
                          d.status === 'READY'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-amber-950 text-amber-400'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="p-3 capitalize text-neutral-400">{d.source_type || 'tabular'}</td>
                  </tr>
                )
              })}
              {filteredDatasets.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-neutral-500">
                    No matching datasets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* THREE ANALYSIS MODES (Always displayed when 2+ datasets selected) */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4">
        <h2 className="text-base font-semibold text-neutral-200">Choose Analysis Mode</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {/* MODE A */}
          <div
            onClick={() => setMode('compare')}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              mode === 'compare'
                ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500'
                : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-neutral-200">Mode A: Compare Datasets</span>
              <span className={`w-3 h-3 rounded-full ${mode === 'compare' ? 'bg-blue-500' : 'border border-neutral-600'}`} />
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Compare metrics, record counts, missing values, and date ranges independently side-by-side without merging records. Works safely across disparate schemas.
            </p>
          </div>

          {/* MODE B */}
          <div
            onClick={() => setMode('combine')}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              mode === 'combine'
                ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500'
                : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-neutral-200">Mode B: Combine Compatible Data</span>
              <span className={`w-3 h-3 rounded-full ${mode === 'combine' ? 'bg-blue-500' : 'border border-neutral-600'}`} />
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Assess compatibility, validate candidate keys & record grains, inspect potential row multiplication, preview joined records, and ingest derived dataset.
            </p>
          </div>

          {/* MODE C */}
          <div
            onClick={() => setMode('insights')}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${
              mode === 'insights'
                ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500'
                : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-neutral-200">Mode C: Cross-Dataset Insights</span>
              <span className={`w-3 h-3 rounded-full ${mode === 'insights' ? 'bg-blue-500' : 'border border-neutral-600'}`} />
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Discover data-grounded temporal trends, correlations, entity intersections, and forecast variances with magnitude metrics and methodological notes.
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <p className="text-xs text-neutral-400">
            {selectedIds.length < 2
              ? 'Select at least 2 datasets above to activate analysis.'
              : `Ready to analyze ${selectedIds.length} datasets using ${
                  mode === 'compare' ? 'Mode A (Compare)' : mode === 'combine' ? 'Mode B (Combine)' : 'Mode C (Insights)'
                }.`}
          </p>
          <button
            onClick={handleRunAnalysis}
            disabled={loading || selectedIds.length < 2}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Running Analysis…' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* RESULTS SECTION: MODE A (Independent Comparison) */}
      {compareData && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4">
            <h3 className="text-lg font-semibold text-neutral-100">Mode A: Side-by-Side Comparison</h3>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {compareData.kpi_cards.map((card, idx) => (
                <div key={idx} className="bg-neutral-950/60 border border-neutral-800 rounded-lg p-4 space-y-2">
                  <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">{card.title}</h4>
                  <div className="space-y-1 text-sm font-semibold">
                    {Object.entries(card.values).map(([dsName, val]) => (
                      <div key={dsName} className="flex justify-between items-center text-xs">
                        <span className="text-neutral-400 truncate max-w-[120px]">{dsName}:</span>
                        <span className="text-neutral-200">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison Matrix Table */}
            <div className="overflow-x-auto border border-neutral-800 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase">
                  <tr>
                    <th className="p-3">Dataset Name</th>
                    <th className="p-3">Rows</th>
                    <th className="p-3">Columns</th>
                    <th className="p-3">Date Coverage</th>
                    <th className="p-3">Revenue / Currency</th>
                    <th className="p-3">Total Orders</th>
                    <th className="p-3">Missing Cells %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {compareData.comparison_table.map((row) => (
                    <tr key={row.dataset_id} className="hover:bg-neutral-850">
                      <td className="p-3 font-medium text-neutral-200">{row.dataset_name}</td>
                      <td className="p-3">{row.rows?.toLocaleString()}</td>
                      <td className="p-3">{row.columns}</td>
                      <td className="p-3">{row.date_coverage}</td>
                      <td className="p-3 font-semibold text-emerald-400">{row.total_revenue}</td>
                      <td className="p-3">{row.total_orders}</td>
                      <td className="p-3">{row.missing_pct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-Dataset Summaries */}
            <div className="grid md:grid-cols-2 gap-4 pt-2">
              {compareData.summaries.map((s) => (
                <div key={s.dataset_id} className="bg-neutral-950/50 border border-neutral-800 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                    <span className="font-semibold text-neutral-200">{s.dataset_name}</span>
                    <span className="text-xs text-neutral-400">{s.source_type}</span>
                  </div>
                  <div className="text-xs space-y-1 text-neutral-300">
                    <p>Total Columns: {s.column_count} | Total Rows: {s.row_count?.toLocaleString()}</p>
                    <p>Date Range: {s.date_range.has_date ? `${s.date_range.min} to ${s.date_range.max}` : 'No date field'}</p>
                    <p>Missing Cells: {s.missing_values?.toLocaleString()} ({s.missing_percentage}%)</p>
                  </div>
                  {Object.keys(s.numeric_summaries).length > 0 && (
                    <div className="pt-2">
                      <span className="text-xs font-medium text-neutral-400">Numeric Summaries:</span>
                      <div className="mt-1 max-h-36 overflow-y-auto space-y-1 text-xs">
                        {Object.entries(s.numeric_summaries).map(([col, st]) => (
                          <div key={col} className="flex justify-between bg-neutral-900/40 p-1.5 rounded">
                            <span className="font-mono text-neutral-300">{col}</span>
                            <span className="text-neutral-400">
                              mean: {st.mean} | min: {st.min} | max: {st.max}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Disclaimers */}
            <div className="text-xs text-neutral-500 space-y-0.5 pt-2 border-t border-neutral-800">
              {compareData.disclaimers.map((d, i) => (
                <p key={i}>• {d}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* RESULTS SECTION: MODE B (Combine Compatible Data) */}
      {compatData && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-5">
            <h3 className="text-lg font-semibold text-neutral-100">Mode B: Compatibility & Combination Workspace</h3>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Union Assessment */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-neutral-200">Union / Append Compatibility</h4>
                  <span
                    className={`px-2 py-0.5 text-xs rounded font-medium ${
                      compatData.union.compatible
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950 text-amber-400'
                    }`}
                  >
                    Match: {compatData.union.match_score_percent}%
                  </span>
                </div>
                <div className="text-xs space-y-1.5 text-neutral-300">
                  <p>Common Columns ({compatData.union.common_columns.length}):</p>
                  <p className="font-mono text-neutral-400 bg-neutral-900/80 p-2 rounded max-h-20 overflow-y-auto">
                    {compatData.union.common_columns.join(', ') || 'None'}
                  </p>
                  <p>Expected combined rows: {compatData.union.expected_row_count?.toLocaleString()}</p>
                  {compatData.union.type_mismatches.length > 0 && (
                    <p className="text-amber-400">
                      ⚠ Type mismatches detected: {compatData.union.type_mismatches.map((m) => m.column).join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setCombineOp('union')
                    void handlePreviewCombine()
                  }}
                  className={`w-full py-1.5 rounded text-xs font-medium transition ${
                    combineOp === 'union' ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                  }`}
                >
                  Configure Union
                </button>
              </div>

              {/* Join Assessment */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-semibold text-neutral-200">Relational Join Compatibility</h4>
                  <span className="px-2 py-0.5 text-xs rounded bg-neutral-800 text-neutral-300">
                    {compatData.join.candidate_keys.length} Candidate Key(s)
                  </span>
                </div>

                {compatData.join.has_candidates ? (
                  <div className="space-y-2">
                    <label className="text-xs text-neutral-400">Candidate Join Key:</label>
                    <select
                      value={joinKey}
                      onChange={(e) => setJoinKey(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1 text-xs text-neutral-200"
                    >
                      {compatData.join.candidate_keys.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.key} (Grain: {k.relationship}, Risk: {k.risk})
                        </option>
                      ))}
                    </select>

                    <label className="text-xs text-neutral-400">Join Type:</label>
                    <select
                      value={joinType}
                      onChange={(e) => setJoinType(e.target.value as 'inner' | 'left' | 'outer')}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded px-2.5 py-1 text-xs text-neutral-200"
                    >
                      <option value="inner">Inner Join (Only matching keys)</option>
                      <option value="left">Left Join (Preserve all left records)</option>
                      <option value="outer">Outer Join (Preserve all records)</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">No common identifier/foreign keys discovered.</p>
                )}

                <button
                  disabled={!compatData.join.has_candidates}
                  onClick={() => {
                    setCombineOp('join')
                    void handlePreviewCombine()
                  }}
                  className={`w-full py-1.5 rounded text-xs font-medium transition disabled:opacity-50 ${
                    combineOp === 'join' ? 'bg-blue-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                  }`}
                >
                  Configure Join
                </button>
              </div>
            </div>

            {/* Candidate Key Warnings */}
            {compatData.join.candidate_keys.some((k) => k.warning) && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded text-xs text-amber-200 space-y-1">
                <span className="font-semibold text-amber-300">Grain & Record Multiplication Warnings:</span>
                {compatData.join.candidate_keys
                  .filter((k) => k.warning)
                  .map((k) => (
                    <p key={k.key}>• Key "{k.key}": {k.warning}</p>
                  ))}
              </div>
            )}

            {/* 20-Row Preview */}
            {combinePreview && (
              <div className="space-y-4 pt-4 border-t border-neutral-800">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-neutral-200">
                      Preview Proposed {combinePreview.operation.toUpperCase()} (First 20 Rows)
                    </h4>
                    <p className="text-xs text-neutral-400">
                      Verify records and column alignments before creating the derived dataset.
                    </p>
                  </div>
                  <span className="text-xs text-neutral-400">
                    Columns: {combinePreview.columns.length}
                  </span>
                </div>

                <div className="max-h-72 overflow-auto border border-neutral-800 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-neutral-900 text-neutral-400 uppercase sticky top-0">
                      <tr>
                        {combinePreview.columns.map((c) => (
                          <th key={c} className="p-2.5 whitespace-nowrap">
                            {c}
                            {combinePreview.lineage?.[c] && (
                              <span className="block text-[10px] text-neutral-500 lowercase">
                                {combinePreview.lineage[c]}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {combinePreview.preview_rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-neutral-850">
                          {combinePreview.columns.map((c) => (
                            <td key={c} className="p-2.5 whitespace-nowrap text-neutral-300">
                              {row[c] !== null && row[c] !== undefined ? String(row[c]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Execution Confirmation */}
                <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-lg flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-neutral-400 font-medium">Output Dataset Name:</label>
                    <input
                      type="text"
                      placeholder={`Combined_${combineOp}`}
                      value={outputDatasetName}
                      onChange={(e) => setOutputDatasetName(e.target.value)}
                      className="bg-neutral-900 border border-neutral-700 rounded px-3 py-1.5 text-xs text-neutral-200 w-64"
                    />
                  </div>

                  <button
                    onClick={handleExecuteCombine}
                    disabled={executingCombine}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded transition disabled:opacity-50"
                  >
                    {executingCombine ? 'Combining & Registering…' : 'Confirm & Ingest Combined Dataset'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS SECTION: MODE C (Cross-Dataset Insights) */}
      {insightsData && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Mode C: Grounded Cross-Dataset Insights</h3>
                <p className="text-xs text-neutral-400">
                  Analytical findings and statistical correlations computed across selected datasets.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-950 text-blue-300 border border-blue-800">
                {insightsData.insights_count} insight(s) generated
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-2">
              {insightsData.insights.map((ins, idx) => (
                <div key={idx} className="bg-neutral-950/70 border border-neutral-800 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-semibold text-neutral-200 text-sm leading-snug">{ins.title}</h4>
                    <span className="px-2 py-0.5 text-[11px] rounded font-medium bg-neutral-800 text-neutral-200 whitespace-nowrap">
                      {ins.magnitude}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-300 leading-relaxed">{ins.finding}</p>

                  <div className="pt-2 border-t border-neutral-850 text-[11px] text-neutral-400 space-y-1">
                    <p>
                      <strong>Source Datasets:</strong> {ins.source_datasets.join(', ')}
                    </p>
                    <p>
                      <strong>Fields Analyzed:</strong> {ins.fields_used.join(', ')}
                    </p>
                    <p>
                      <strong>Date Window:</strong> {ins.date_range}
                    </p>
                    <p>
                      <strong>Analytical Method:</strong> {ins.method}
                    </p>
                    <p className="text-neutral-500 italic">
                      <strong>Limitations:</strong> {ins.limitations}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Direct Upload Modal in Analysis Workspace */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-neutral-100">Upload to Ongoing Analysis</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-neutral-400 hover:text-neutral-200 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Upload a ZIP archive or folder. All extracted datasets will automatically be added to this ongoing analysis.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setUploadMode('zip')}
                className={`px-3 py-1 text-xs rounded font-medium ${
                  uploadMode === 'zip' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                ZIP Archive (Up to 500 MB)
              </button>
              <button
                onClick={() => setUploadMode('folder')}
                className={`px-3 py-1 text-xs rounded font-medium ${
                  uploadMode === 'folder' ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                Folder Upload (Up to 100 files)
              </button>
            </div>

            {uploadMode === 'zip' ? (
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                />
                {uploadFile && (
                  <p className="text-[11px] text-neutral-400">
                    Selected: {uploadFile.name} ({(uploadFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="file"
                  // @ts-expect-error webkitdirectory attribute supported by browser
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={(e) => setUploadFolderFiles(Array.from(e.target.files || []))}
                  className="w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                />
                {uploadFolderFiles.length > 0 && (
                  <p className="text-[11px] text-neutral-400">
                    {uploadFolderFiles.length} file(s) selected
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-xs text-neutral-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDirectUpload}
                disabled={uploadBusy || (uploadMode === 'zip' ? !uploadFile : uploadFolderFiles.length === 0)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded transition disabled:opacity-50"
              >
                {uploadBusy ? 'Ingesting…' : 'Upload & Add to Analysis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
