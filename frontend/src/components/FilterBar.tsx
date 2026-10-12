import { useEffect, useState } from 'react'
import { getFilterOptions, type FilterOptions } from '@/services/api'
import { useFilters } from '@/hooks/useFilters'
import { useDataset } from '@/hooks/useDataset'

const legacyFields = [
  ['category', 'Category', 'categories'], ['customer_state', 'Customer State', 'customer_states'],
  ['seller_state', 'Seller State', 'seller_states'], ['order_status', 'Order Status', 'order_statuses'],
  ['payment_type', 'Payment Type', 'payment_types'], ['review_score', 'Review Score', 'review_scores'],
] as const
const inputClass = 'bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-sm max-w-[180px]'

export default function FilterBar({ showGrain = false }: { showGrain?: boolean }) {
  const { filters, setFilters, resetFilters } = useFilters()
  const { active } = useDataset()
  const [options, setOptions] = useState<FilterOptions | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    getFilterOptions()
      .then(value => { if (current) setOptions(value) })
      .catch(e => { if (current) setError(e.message) })
    return () => { current = false }
  }, [active?.dataset_id])

  if (error) return <p role="alert" className="text-red-400">{error}</p>
  if (!options) return <div role="status" className="h-14 flex items-center text-sm text-neutral-400">Loading filters…</div>

  let columnFilters: Record<string, string> = {}
  try { columnFilters = JSON.parse(filters.column_filters || '{}') } catch { /* malformed URL is rejected by the API */ }
  const setColumn = (field: string, value: string) => {
    const next = { ...columnFilters }
    if (value) next[field] = value
    else delete next[field]
    setFilters({ column_filters: Object.keys(next).length ? JSON.stringify(next) : null })
  }

  const minCoverage = options.date_range?.min ? options.date_range.min.slice(0, 10) : null
  const maxCoverage = options.date_range?.max ? options.date_range.max.slice(0, 10) : null
  const invalidRange = Boolean(filters.date_from && filters.date_to && filters.date_from > filters.date_to)
  const isOutsideCoverage = Boolean(
    minCoverage && maxCoverage && (
      (filters.date_to && filters.date_to < minCoverage) ||
      (filters.date_from && filters.date_from > maxCoverage)
    )
  )

  const resetToCoverage = () => {
    if (minCoverage && maxCoverage) {
      setFilters({ date_from: minCoverage, date_to: maxCoverage })
    }
  }

  return (
    <div className="space-y-2">
      {isOutsideCoverage && (
        <div role="alert" className="bg-amber-950/40 border border-amber-800/60 text-amber-200 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-semibold text-sm">⚠</span>
            <span>
              Selected date filter (<strong>{filters.date_from || 'start'}</strong> to <strong>{filters.date_to || 'end'}</strong>) does not overlap this dataset's available date range (<strong>{minCoverage}</strong> to <strong>{maxCoverage}</strong>).
            </span>
          </div>
          <button
            type="button"
            onClick={resetToCoverage}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-medium rounded transition text-xs whitespace-nowrap"
          >
            Reset to Dataset Range
          </button>
        </div>
      )}

      <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 flex flex-wrap gap-4 items-end">
        {options.has_date !== false && ['date_from', 'date_to'].map(field => (
          <label key={field} className="flex flex-col gap-1 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              {field === 'date_from' ? 'Date From' : 'Date To'}
              {minCoverage && maxCoverage && field === 'date_from' && (
                <span className="text-[10px] text-neutral-500">({minCoverage} → {maxCoverage})</span>
              )}
            </span>
            <input
              aria-label={field === 'date_from' ? 'Date From' : 'Date To'}
              type="date"
              className={`${inputClass} ${invalidRange || isOutsideCoverage ? 'border-amber-500' : ''}`}
              value={filters[field] || ''}
              min={minCoverage || undefined}
              max={maxCoverage || undefined}
              onChange={e => setFilters({ [field]: e.target.value || null })}
            />
          </label>
        ))}

        {invalidRange && <span className="text-xs text-amber-400 self-center font-medium">Start date is after End date</span>}

        {showGrain && options.has_date !== false && (
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Grain
            <select aria-label="Grain" className={inputClass} value={filters.grain || 'month'} onChange={e => setFilters({ grain: e.target.value })}>
              {['day', 'week', 'month', 'quarter', 'year'].map(g => <option key={g}>{g}</option>)}
            </select>
          </label>
        )}

        {options.dynamic ? options.dynamic.map(d => (
          <label key={d.field} className="flex flex-col gap-1 text-xs text-neutral-400">
            {d.label}
            <select aria-label={`Filter ${d.field}`} className={inputClass} value={columnFilters[d.field] || ''} onChange={e => setColumn(d.field, e.target.value)}>
              <option value="">All</option>
              {d.values.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
        )) : legacyFields.map(([field, label, optionKey]) => (
          <label key={field} className="flex flex-col gap-1 text-xs text-neutral-400">
            {label}
            <select aria-label={label} className={inputClass} value={filters[field] || ''} onChange={e => setFilters({ [field]: e.target.value || null })}>
              <option value="">All</option>
              {options[optionKey].map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
        ))}

        <button onClick={resetFilters} aria-label="Reset" className="ml-auto bg-neutral-800 hover:bg-neutral-700 text-sm px-4 py-1.5 rounded text-neutral-200 transition">
          Reset
        </button>
      </div>
    </div>
  )
}

