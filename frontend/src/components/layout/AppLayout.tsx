import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import Nav from '@/components/common/Nav'
import SourceSelector from '@/components/common/SourceSelector'
import { DatasetContext } from '@/hooks/useDataset'
import { listDatasets, selectDataset, selectCollection as selectCollectionApi, setCollectionScope, setDatasetScope, type CollectionItem, type Dataset } from '@/services/api'

export default function AppLayout() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [active, setActive] = useState<Dataset | null>(null)
  const [sourceMode, setSourceMode] = useState<CollectionItem['source_mode']>('INDIVIDUAL_FILE')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const navigation = useNavigation()
  const location = useLocation()
  const currentLocation = useRef(location)
  useEffect(() => { currentLocation.current = location }, [location])
  const reload = useCallback(async () => {
    const result = await listDatasets()
    setDatasets(result.datasets)
    const selected = result.datasets.find(d => d.dataset_id === result.active_dataset_id && d.status === 'READY') || null
    setActive(selected)
    const source = result.active_source || { source_mode: 'INDIVIDUAL_FILE' as const, source_id: selected?.dataset_id || null }
    setSourceMode(source.source_mode)
    setSourceId(source.source_id)
    if (source.source_mode === 'ZIP_COLLECTION' || source.source_mode === 'FOLDER_COLLECTION') setCollectionScope(source.source_id)
    else setDatasetScope(selected?.dataset_id || null)
  }, [])
  useEffect(() => {
    let current = true
    reload().catch(e => { if (current) setError(e.message) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false; setDatasetScope(null) }
  }, [reload])
  const select = async (id: string) => {
    setBusy(true); setError(null)
    try {
      const selected = await selectDataset(id)
      setDatasetScope(id)
      setActive(selected)
      setSourceMode('INDIVIDUAL_FILE')
      setSourceId(id)
      navigate(currentLocation.current.pathname, { replace: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Dataset selection failed'); throw e }
    finally { setBusy(false) }
  }
  const selectCollection = async (id: string) => {
    setBusy(true); setError(null)
    try {
      const result = await selectCollectionApi(id)
      const representative = result.datasets.find(d => d.status === 'READY')
      if (!representative) throw new Error('This collection has no ready data tables.')
      setCollectionScope(id)
      setDatasets(current => [...result.datasets, ...current.filter(d => !result.datasets.some(item => item.dataset_id === d.dataset_id))])
      setActive(representative)
      setSourceMode(result.source_mode)
      setSourceId(id)
      navigate(currentLocation.current.pathname, { replace: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Collection selection failed'); throw e }
    finally { setBusy(false) }
  }
  return (
    <DatasetContext.Provider value={{ datasets, active, busy, sourceMode, sourceId, reload, select, selectCollection }}>
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="font-semibold text-neutral-100 flex items-center gap-2 hover:text-white transition">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Sem5 BI
            </Link>
            {active && (
              <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900/80 px-2.5 py-1 rounded-md border border-neutral-800">
                <span className="text-[10px] uppercase font-mono text-neutral-500">Active Source:</span>
                <span className="font-medium text-neutral-200 truncate max-w-[200px]" title={active.dataset_name}>
                  {active.dataset_name}
                </span>
                <span className="text-[10px] text-neutral-500">({active.row_count.toLocaleString()} rows)</span>
              </div>
            )}
          </div>
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <div role="alert" className="text-red-400 mb-4">{error}</div>}
        {!location.pathname.startsWith('/datasets') && !location.pathname.startsWith('/admin') && (
          <SourceSelector className="mb-6" />
        )}
        {loading ? <div role="status">Loading datasets…</div> : navigation.state === 'loading' ? <div role="status">Loading page…</div> : active || location.pathname === '/datasets' || location.pathname.startsWith('/admin') ?
          <div key={active ? `${active.dataset_id}:${active.updated_at}` : 'no-dataset'}><Outlet /></div> : <p>Select or <Link className="text-blue-400" to="/datasets">upload a dataset</Link> to begin.</p>}
      </main>
    </div>
    </DatasetContext.Provider>
  )
}
