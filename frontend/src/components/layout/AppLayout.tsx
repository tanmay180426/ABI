import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import Nav from '@/components/common/Nav'
import { DatasetContext } from '@/hooks/useDataset'
import { listDatasets, selectDataset, setDatasetScope, type Dataset } from '@/services/api'

export default function AppLayout() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [active, setActive] = useState<Dataset | null>(null)
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
    setDatasetScope(selected?.dataset_id || null)
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
      navigate(currentLocation.current.pathname, { replace: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'Dataset selection failed'); throw e }
    finally { setBusy(false) }
  }
  return (
    <DatasetContext.Provider value={{ datasets, active, busy, reload, select }}>
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold">Sem5 BI</div>
          <Nav />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3 text-sm">
          <label htmlFor="active-dataset">Active Dataset:</label>
          <select id="active-dataset" aria-label="Active Dataset" value={active?.dataset_id || ''} disabled={busy || loading}
            onChange={e => { void select(e.target.value).catch(() => {}) }} className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2">
            <option value="" disabled>Select a dataset</option>
            {datasets.filter(d => d.status === 'READY').map(d => <option key={d.dataset_id} value={d.dataset_id}>{d.dataset_name}</option>)}
          </select>
          <Link to="/datasets" className="text-blue-400 hover:text-blue-300">Dataset Manager</Link>
          <span className="text-neutral-750">•</span>
          <Link to="/multi-dataset-analysis" className="text-emerald-400 hover:text-emerald-300">Multi-Dataset Analysis</Link>
          {busy && <span role="status">Switching dataset…</span>}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <div role="alert" className="text-red-400 mb-4">{error}</div>}
        {loading ? <div role="status">Loading datasets…</div> : navigation.state === 'loading' ? <div role="status">Loading page…</div> : active || location.pathname === '/datasets' || location.pathname.startsWith('/admin') ?
          <div key={active ? `${active.dataset_id}:${active.updated_at}` : 'no-dataset'}><Outlet /></div> : <p>Select or <Link className="text-blue-400" to="/datasets">upload a dataset</Link> to begin.</p>}
      </main>
    </div>
    </DatasetContext.Provider>
  )
}
