import { useState, useEffect, useRef, useMemo } from 'react'
import {
  uploadDataset,
  uploadBatchDatasets,
  uploadZipDataset,
  getDatasetCollections,
  type CollectionItem,
} from '@/services/api'
import { useDataset } from '@/hooks/useDataset'

export interface SourceSelectorProps {
  onSourceSelected?: (datasetId: string) => void
  className?: string
}

export default function SourceSelector({ onSourceSelected, className = '' }: SourceSelectorProps) {
  const { datasets, active, sourceId, select, selectCollection, reload } = useDataset()
  const [activeTab, setActiveTab] = useState<'zip' | 'folder' | 'files'>('zip')
  const [collections, setCollections] = useState<CollectionItem[]>([])
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  const zipInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  const loadCollections = () => {
    getDatasetCollections()
      .then((res) => setCollections(res.collections || []))
      .catch(() => setCollections([]))
  }

  useEffect(() => {
    loadCollections()
  }, [datasets])

  // Identify collection of currently active dataset
  const activeCollection = useMemo(() => {
    if (!active) return null
    return collections.find((c) =>
      c.datasets.some((d) => d.dataset_id === active.dataset_id)
    ) || null
  }, [active, collections])

  // Handle ZIP Archive Upload & Batch Ingestion
  const handleZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErrorMsg(null)
    setStatusMsg(`Analyzing entire ZIP archive: ${file.name}…`)
    try {
      const res = await uploadZipDataset(file)
      await reload()
      loadCollections()
      setStatusMsg(
        `✓ Processed ${res.successful} supported file(s) from ZIP.${
          res.failed ? ` (${res.failed} failed/skipped)` : ''
        }`
      )
      if (res.datasets && res.datasets.length > 0) {
        await selectCollection(res.collection_id)
        onSourceSelected?.(res.datasets[0].dataset_id)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ZIP processing failed.')
      setStatusMsg(null)
    } finally {
      setBusy(false)
      if (zipInputRef.current) zipInputRef.current.value = ''
    }
  }

  // Handle Directory Folder Ingestion
  const handleFolderFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const filesArray = Array.from(fileList)
    setBusy(true)
    setErrorMsg(null)
    setStatusMsg(`Analyzing entire folder collection (${filesArray.length} discovered items)…`)
    try {
      const res = await uploadBatchDatasets(filesArray, 'FOLDER_COLLECTION')
      await reload()
      loadCollections()
      setStatusMsg(
        `✓ Processed ${res.successful} file(s) from folder.${
          res.failed ? ` (${res.failed} failed/skipped)` : ''
        }`
      )
      if (res.datasets && res.datasets.length > 0) {
        await selectCollection(res.collection_id!)
        onSourceSelected?.(res.datasets[0].dataset_id)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Folder processing failed.')
      setStatusMsg(null)
    } finally {
      setBusy(false)
      if (folderInputRef.current) folderInputRef.current.value = ''
    }
  }

  // Handle Individual or Multi-File Upload
  const handleIndividualFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const filesArray = Array.from(fileList)
    setBusy(true)
    setErrorMsg(null)

    try {
      if (filesArray.length === 1) {
        const single = filesArray[0]
        setStatusMsg(`Analyzing file: ${single.name}…`)
        const name = single.name.replace(/\.[^/.]+$/, '')
        const ds = await uploadDataset(single, name)
        await reload()
        loadCollections()
        setStatusMsg(`✓ File uploaded successfully: ${ds.dataset_name}`)
        await select(ds.dataset_id)
        onSourceSelected?.(ds.dataset_id)
      } else {
        setStatusMsg(`Analyzing ${filesArray.length} uploaded files…`)
        const res = await uploadBatchDatasets(filesArray)
        await reload()
        loadCollections()
        setStatusMsg(
          `✓ Processed ${res.successful} uploaded file(s).${
            res.failed ? ` (${res.failed} failed/skipped)` : ''
          }`
        )
        if (res.datasets && res.datasets.length > 0) {
          await select(res.datasets[0].dataset_id)
          onSourceSelected?.(res.datasets[0].dataset_id)
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload processing failed.')
      setStatusMsg(null)
    } finally {
      setBusy(false)
      if (filesInputRef.current) filesInputRef.current.value = ''
    }
  }

  // Filter collections by type
  const zipCollections = collections.filter((c) => c.source_type === 'zip')
  const folderCollections = collections.filter((c) => c.source_type === 'folder')

  // Filtered dataset list for tab 3
  const readyDatasets = useMemo(() => {
    return datasets
      .filter((d) => d.status === 'READY')
      .filter((d) => !searchFilter || d.dataset_name.toLowerCase().includes(searchFilter.toLowerCase()))
  }, [datasets, searchFilter])

  return (
    <div className={`bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 space-y-4 shadow-sm ${className}`}>
      {/* 1. Active Source Hero Panel */}
      {active ? (
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs uppercase tracking-wider font-mono text-neutral-400">
                Active Analytical Source:
              </span>
              <span className="text-sm font-semibold text-neutral-100">{active.dataset_name}</span>
              {activeCollection && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                  {activeCollection.source_type === 'zip' ? '📦 Archive' : '📁 Folder'}:{' '}
                  {activeCollection.collection_name}
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-400 font-mono">
              {active.row_count.toLocaleString()} rows · {active.column_count} columns
            </div>
          </div>

          {activeCollection && activeCollection.datasets.length > 1 && (
            <p className="pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-400">
              {activeCollection.datasets.length} source tables discovered. Tables retain their own schemas.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-lg p-3 text-xs text-neutral-400">
          No analytical source selected. Ingest a ZIP, folder, or uploaded file below to begin.
        </div>
      )}

      {/* 2. Source Ingestion & Selector Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
            <span>📂</span> Unified Source Analysis & Ingestion
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Select or upload an Entire ZIP, Entire Folder, or Multiple Files. Each file retains its individual schema.
          </p>
        </div>

        {/* Option Tabs */}
        <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 self-start sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('zip')}
            className={`px-3 py-1.5 rounded-md transition font-medium ${
              activeTab === 'zip'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            📦 Entire ZIP
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('folder')}
            className={`px-3 py-1.5 rounded-md transition font-medium ${
              activeTab === 'folder'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            📁 Entire Folder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 rounded-md transition font-medium ${
              activeTab === 'files'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            📄 Uploaded Files
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="space-y-3">
        {/* TAB 1: ENTIRE ZIP */}
        {activeTab === 'zip' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipFile}
                disabled={busy}
                className="hidden"
                id="unified-zip-input"
              />
              <button
                type="button"
                onClick={() => zipInputRef.current?.click()}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                <span>📦</span> {busy ? 'Ingesting ZIP…' : 'Analyze Entire ZIP Archive'}
              </button>
              <span className="text-xs text-neutral-400">
                Discovers nested files, validates bounds, and profiles each file independently.
              </span>
            </div>

            {/* Existing ZIP Collections */}
            {zipCollections.length > 0 && (
              <div className="pt-2 border-t border-neutral-800/60 space-y-2">
                <div className="text-xs text-neutral-400 font-medium">Available ZIP Collections:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {zipCollections.map((col) => (
                    <div
                      key={col.collection_id}
                      className="bg-neutral-950/70 border border-neutral-800 rounded-lg p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-neutral-200 truncate" title={col.collection_name}>
                          📦 {col.collection_name}
                        </span>
                        <span className="text-[10px] text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800">
                          {col.dataset_count} tables · {col.total_rows.toLocaleString()} rows
                        </span>
                      </div>
                      <button type="button" onClick={() => void selectCollection(col.collection_id)}
                        className={`text-[11px] px-2.5 py-1 rounded border ${sourceId === col.collection_id ? 'bg-blue-600 text-white border-blue-500' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'}`}>
                        {sourceId === col.collection_id ? 'Selected for analysis' : 'Analyze entire collection'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ENTIRE FOLDER */}
        {activeTab === 'folder' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory is standard in modern browsers
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderFiles}
                disabled={busy}
                className="hidden"
                id="unified-folder-input"
              />
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                <span>📁</span> {busy ? 'Ingesting Folder…' : 'Analyze Entire Directory Folder'}
              </button>
              <span className="text-xs text-neutral-400">
                Preserves folder hierarchies and analyzes all supported subfolder files.
              </span>
            </div>

            {/* Existing Folder Collections */}
            {folderCollections.length > 0 && (
              <div className="pt-2 border-t border-neutral-800/60 space-y-2">
                <div className="text-xs text-neutral-400 font-medium">Available Folder Collections:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {folderCollections.map((col) => (
                    <div
                      key={col.collection_id}
                      className="bg-neutral-950/70 border border-neutral-800 rounded-lg p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-neutral-200 truncate" title={col.collection_name}>
                          📁 {col.collection_name}
                        </span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                          {col.dataset_count} tables · {col.total_rows.toLocaleString()} rows
                        </span>
                      </div>
                      <button type="button" onClick={() => void selectCollection(col.collection_id)}
                        className={`text-[11px] px-2.5 py-1 rounded border ${sourceId === col.collection_id ? 'bg-blue-600 text-white border-blue-500' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'}`}>
                        {sourceId === col.collection_id ? 'Selected for analysis' : 'Analyze entire collection'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: UPLOADED FILES */}
        {activeTab === 'files' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={filesInputRef}
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleIndividualFiles}
                disabled={busy}
                className="hidden"
                id="unified-files-input"
              />
              <button
                type="button"
                onClick={() => filesInputRef.current?.click()}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                <span>📄</span> {busy ? 'Ingesting Files…' : 'Analyze Uploaded Files (Single or Multi)'}
              </button>
              <span className="text-xs text-neutral-400">
                Upload one or multiple CSV, Excel, or JSON files.
              </span>
            </div>

            {/* Quick Switch Across Available Datasets with Search */}
            <div className="pt-2 border-t border-neutral-800/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-neutral-400 font-medium">All Available Registered Sources:</div>
                {datasets.length > 6 && (
                  <input
                    type="text"
                    placeholder="Filter datasets…"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 rounded px-2 py-0.5 text-xs text-neutral-300 w-36 outline-none focus:border-blue-500"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                {readyDatasets.map((d) => (
                  <button
                    key={d.dataset_id}
                    type="button"
                    onClick={() => {
                      select(d.dataset_id)
                      onSourceSelected?.(d.dataset_id)
                    }}
                    className={`text-xs px-2.5 py-1 rounded border transition truncate max-w-[200px] ${
                      active?.dataset_id === d.dataset_id
                        ? 'bg-blue-600 text-white border-blue-500 font-medium shadow-sm'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-700/80'
                    }`}
                    title={`${d.dataset_name} (${d.row_count} rows)`}
                  >
                    {d.dataset_name}
                  </button>
                ))}
                {readyDatasets.length === 0 && (
                  <div className="text-xs text-neutral-500 py-1">No matching datasets found.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status & Feedback */}
      {statusMsg && (
        <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/80 rounded px-3 py-2">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/80 rounded px-3 py-2">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
