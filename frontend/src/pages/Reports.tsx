import { PageHeader } from '@/components/ui/Workspace'
import { useState } from 'react'
import { downloadReport } from '@/services/api'
import { getStoredUser } from '@/services/auth'
import { useFilters } from '@/hooks/useFilters'
import FilterBar from '@/components/FilterBar'

const REPORTS = [
  { name: 'kpis', label: 'KPIs', minRole: 'Both roles' },
  { name: 'orders_by_status', label: 'Orders by Status', minRole: 'Both roles' },
  { name: 'monthly_revenue', label: 'Monthly Revenue', minRole: 'Both roles' },
  { name: 'revenue_by_category', label: 'Revenue by Category', minRole: 'Both roles' },
  { name: 'numeric_statistics', label: 'Numeric Statistics', minRole: 'Both roles' },
  { name: 'dataset_rows', label: 'Dataset Rows', minRole: 'Both roles' },
]

export default function Reports() {
  const { filters } = useFilters()
  const [error, setError] = useState<string | null>(null)
  const user = getStoredUser()

  const run = async (report: string) => {
    setError(null)
    try {
      await downloadReport(report, filters)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <div className="space-y-6 max-w-none">
      <div>
        <PageHeader title="Reports" />
        <p className="text-sm text-neutral-500">
          Export the selected dataset's metrics or rows as CSV, using your current filters. Both roles can export authorized data.
        </p>
      </div>

      <div className="abi-panel border border-neutral-800 rounded-lg p-4 space-y-4">
        <FilterBar />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {REPORTS.map((r) => (
            <button
              key={r.name}
              onClick={() => run(r.name)}
              className="bg-blue-600 hover:bg-blue-500 rounded px-3 py-2 text-sm text-left"
            >
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-blue-100/70">{r.minRole}+</div>
            </button>
          ))}
        </div>

        {user && (
          <div className="text-xs text-neutral-500">
            Signed in as <span className="text-neutral-300">{user.username}</span> ({user.role})
          </div>
        )}
        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>

      <div className="abi-panel border border-neutral-800 rounded-lg p-4 text-sm text-neutral-400">
        CSV export uses the same verified warehouse aggregates as the dashboards. No fabricated
        values are written.
      </div>
    </div>
  )
}
