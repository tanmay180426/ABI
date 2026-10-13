import { useEffect, useState } from 'react'
import {
  downloadReport,
  getAnalyticsOverview,
  getAutomatedInsights,
  listDatasets,
  getRequestContext,
  type AutomatedInsight,
  type Dataset,
} from '@/services/api'
import { getStoredUser } from '@/services/auth'
import { useFilters } from '@/hooks/useFilters'
import FilterBar from '@/components/FilterBar'

const CSV_EXPORTS = [
  { name: 'kpis', label: 'Executive KPIs CSV', minRole: 'Both roles' },
  { name: 'orders_by_status', label: 'Orders by Status CSV', minRole: 'Both roles' },
  { name: 'monthly_revenue', label: 'Trend Series CSV', minRole: 'Both roles' },
  { name: 'revenue_by_category', label: 'Segment Breakdown CSV', minRole: 'Both roles' },
  { name: 'numeric_statistics', label: 'Statistical Summary CSV', minRole: 'Both roles' },
  { name: 'dataset_rows', label: 'Raw Observations CSV', minRole: 'Both roles' },
]

export default function Reports() {
  const { filters } = useFilters()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [overviewData, setOverviewData] = useState<any>(null)
  const [insights, setInsights] = useState<AutomatedInsight[]>([])
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null)
  const user = getStoredUser()

  const filterKey = JSON.stringify(filters)
  const context = getRequestContext()

  useEffect(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      listDatasets(),
      getAnalyticsOverview(filters as any),
      getAutomatedInsights(filters),
    ])
      .then(([dsRes, ovRes, insRes]) => {
        const found = dsRes.datasets.find((d) => d.dataset_id === dsRes.active_dataset_id)
        setActiveDataset(found || dsRes.datasets[0] || null)
        setOverviewData(ovRes)
        setInsights(insRes.insights || [])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to generate report')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [filterKey, context])

  const runCsvExport = async (report: string) => {
    setError(null)
    try {
      await downloadReport(report, filters)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const kpis = overviewData?.kpis || {}
  const currencyCode = activeDataset?.semantics?.currency_code || 'BRL'
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'Not available for this dataset'
    return `${currencyCode} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Calculate MoM growth from revenue_series if available
  const series = overviewData?.revenue_series || []
  let momGrowth: number | null = null
  if (series.length >= 2) {
    const prev = series[series.length - 2]?.revenue || series[series.length - 2]?.amount
    const curr = series[series.length - 1]?.revenue || series[series.length - 1]?.amount
    if (prev && prev > 0 && curr !== undefined) {
      momGrowth = Math.round(((curr - prev) / prev) * 1000) / 10
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-100">Executive Business Performance Report</h1>
            {activeDataset && (
              <span className="text-xs bg-blue-950/80 border border-blue-800 text-blue-400 px-2.5 py-0.5 rounded font-mono">
                {activeDataset.dataset_name}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            Grounded operational analysis generated directly from authenticated warehouse observations.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="self-start sm:self-auto bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs px-3 py-2 rounded border border-neutral-700 flex items-center gap-1.5 transition"
        >
          <span>🖨️</span> Print / Save PDF
        </button>
      </div>

      <FilterBar />

      {loading && (
        <div className="p-8 text-center bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse text-neutral-400 text-sm">
          Compiling business report from verified dataset records…
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm bg-red-950/40 border border-red-900 rounded p-4">
          {error}
        </div>
      )}

      {!loading && overviewData && (
        <div className="space-y-10">
          {/* Section 1: Executive Summary */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
              <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
                <span>📋</span> 1. Executive Summary
              </h2>
              <span className="text-xs text-neutral-500 font-mono">
                Scope: {filters.date_from || 'Inception'} to {filters.date_to || 'Present'}
              </span>
            </div>
            <p className="text-sm text-neutral-300 leading-relaxed">
              This report synthesizes verified business metrics for dataset{' '}
              <strong className="text-neutral-100">{activeDataset?.dataset_name || 'Active Dataset'}</strong>. Total
              recorded transactional volume stands at{' '}
              <strong className="text-neutral-100">
                {kpis.total_orders !== undefined && kpis.total_orders !== null
                  ? `${kpis.total_orders.toLocaleString()} distinct orders`
                  : `${(activeDataset?.row_count || 0).toLocaleString()} records`}
              </strong>
              {kpis.total_revenue !== undefined && kpis.total_revenue !== null && (
                <>
                  , generating a cumulative revenue of{' '}
                  <strong className="text-neutral-100">{formatCurrency(kpis.total_revenue)}</strong>
                </>
              )}
              {kpis.avg_order_value !== undefined && kpis.avg_order_value !== null && (
                <>
                  {' '}
                  with an average order value (AOV) of{' '}
                  <strong className="text-neutral-100">{formatCurrency(kpis.avg_order_value)}</strong>
                </>
              )}
              .
              {momGrowth !== null && (
                <>
                  {' '}
                  Latest evaluated month-over-month trajectory reflects a{' '}
                  <strong className={momGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {momGrowth >= 0 ? `+${momGrowth}% growth` : `${momGrowth}% contraction`}
                  </strong>
                  .
                </>
              )}
            </p>
          </section>

          {/* Section 2: KPI Summary */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
              <span>🎯</span> 2. Key Performance Indicators (KPI Summary)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Total Revenue</div>
                <div className="text-xl font-bold text-neutral-100 mt-1">
                  {kpis.total_revenue !== undefined && kpis.total_revenue !== null
                    ? formatCurrency(kpis.total_revenue)
                    : 'Not available'}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">Gross monetary volume</div>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Distinct Orders</div>
                <div className="text-xl font-bold text-neutral-100 mt-1">
                  {kpis.total_orders !== undefined && kpis.total_orders !== null
                    ? kpis.total_orders.toLocaleString()
                    : 'Not available'}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">Distinct order identifiers</div>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Average Order Value</div>
                <div className="text-xl font-bold text-neutral-100 mt-1">
                  {kpis.avg_order_value !== undefined && kpis.avg_order_value !== null
                    ? formatCurrency(kpis.avg_order_value)
                    : 'Not available'}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">Revenue / distinct orders</div>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
                <div className="text-xs text-neutral-500 uppercase tracking-wider">Customer Reach</div>
                <div className="text-xl font-bold text-neutral-100 mt-1">
                  {kpis.unique_customers !== undefined && kpis.unique_customers !== null
                    ? kpis.unique_customers.toLocaleString()
                    : kpis.row_count !== undefined
                    ? `${kpis.row_count.toLocaleString()} rows`
                    : 'Not available'}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">Unique customer entities</div>
              </div>
            </div>
          </section>

          {/* Section 3: Trend Analysis */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
              <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
                <span>📈</span> 3. Trend & Temporal Analysis
              </h2>
              <span className="text-xs text-neutral-500">Grain: {overviewData.grain || 'month'}</span>
            </div>
            {series.length > 0 ? (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-neutral-800">
                    <thead className="bg-neutral-800/50 text-neutral-400 uppercase font-mono">
                      <tr>
                        <th className="p-2 border-b border-neutral-800">Period</th>
                        <th className="p-2 border-b border-neutral-800 text-right">Revenue</th>
                        <th className="p-2 border-b border-neutral-800 text-right">Orders</th>
                        <th className="p-2 border-b border-neutral-800 text-right">Customers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60 font-mono">
                      {series.slice(-6).map((r: any) => (
                        <tr key={r.period} className="hover:bg-neutral-850/50">
                          <td className="p-2 text-neutral-300 font-sans">{r.period}</td>
                          <td className="p-2 text-right text-neutral-200">
                            {r.revenue !== undefined ? formatCurrency(r.revenue) : '—'}
                          </td>
                          <td className="p-2 text-right text-neutral-400">{r.orders?.toLocaleString() || '—'}</td>
                          <td className="p-2 text-right text-neutral-400">{r.customers?.toLocaleString() || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-neutral-500 italic">
                  Showing most recent {Math.min(6, series.length)} periods. Complete chronological history is exportable below.
                </p>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">
                Temporal trends require a confirmed analytical date field, which is not present in this dataset.
              </p>
            )}
          </section>

          {/* Section 4: Segment Performance */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
            <div className="border-b border-neutral-800/80 pb-3">
              <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
                <span>📊</span> 4. Segment & Category Performance
              </h2>
            </div>
            {overviewData.revenue_by_category && overviewData.revenue_by_category.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-neutral-800">
                  <thead className="bg-neutral-800/50 text-neutral-400 uppercase font-mono">
                    <tr>
                      <th className="p-2 border-b border-neutral-800">Category</th>
                      <th className="p-2 border-b border-neutral-800 text-right">Revenue</th>
                      <th className="p-2 border-b border-neutral-800 text-right">Orders</th>
                      <th className="p-2 border-b border-neutral-800 text-right">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {overviewData.revenue_by_category.slice(0, 5).map((cat: any) => (
                      <tr key={cat.category} className="hover:bg-neutral-850/50 font-mono">
                        <td className="p-2 text-neutral-300 font-sans">{cat.category}</td>
                        <td className="p-2 text-right text-neutral-200">
                          {cat.revenue !== undefined ? formatCurrency(cat.revenue) : '—'}
                        </td>
                        <td className="p-2 text-right text-neutral-400">{cat.orders?.toLocaleString() || '—'}</td>
                        <td className="p-2 text-right text-blue-400">{cat.share_pct ? `${cat.share_pct}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">
                Segment breakdown is not available because a category attribute has not been assigned for this dataset.
              </p>
            )}
          </section>

          {/* Section 5: Anomalies & Data Quality */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
            <div className="border-b border-neutral-800/80 pb-3">
              <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
                <span>🛡️</span> 5. Anomalies & Data Quality Profile
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded space-y-2">
                <div className="font-semibold text-neutral-200">Ingestion Audit & Completeness</div>
                <div className="flex justify-between text-neutral-400">
                  <span>Total Verified Records:</span>
                  <span className="font-mono text-neutral-200">{(activeDataset?.row_count || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Tracked Attributes:</span>
                  <span className="font-mono text-neutral-200">{activeDataset?.column_count || 0}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Missing Values Count:</span>
                  <span className="font-mono text-neutral-200">
                    {activeDataset?.quality?.missing_values?.toLocaleString() || 0}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Duplicate Records:</span>
                  <span className="font-mono text-neutral-200">
                    {activeDataset?.quality?.duplicate_rows?.toLocaleString() || 0}
                  </span>
                </div>
              </div>

              <div className="bg-neutral-950/60 border border-neutral-800 p-4 rounded space-y-2">
                <div className="font-semibold text-neutral-200">Automated Data Warnings</div>
                {activeDataset?.quality?.warnings && activeDataset.quality.warnings.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-amber-300">
                    {activeDataset.quality.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-emerald-400">
                    ✓ Clean schema profile. No critical missing keys or duplicate integrity violations detected.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 6: Forecast & Model Evaluation */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-3">
            <div className="border-b border-neutral-800/80 pb-3">
              <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
                <span>🔮</span> 6. Predictive Forecasting & ML Status
              </h2>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Predictive models and forecast horizons are configured inside the{' '}
              <strong className="text-neutral-100">Machine Learning</strong> section. Forecast computations utilize
              chronological train/test splitting with baseline naive comparisons (MAE, RMSE, MAPE). To generate or
              inspect forward predictions, visit the Machine Learning workspace.
            </p>
          </section>

          {/* Section 7: Strategic Recommendations */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
            <div className="border-b border-neutral-800/80 pb-3">
              <h2 className="text-lg font-semibold text-neutral-200 flex items-center gap-2">
                <span>💡</span> 7. Evidence-Based Strategic Recommendations
              </h2>
            </div>
            {insights.length > 0 ? (
              <div className="space-y-3">
                {insights.slice(0, 3).map((ins, idx) => (
                  <div key={idx} className="bg-neutral-950/50 border border-neutral-800/80 p-3.5 rounded text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-200">{ins.title}</span>
                      <span className="text-blue-400 font-mono text-[11px]">{ins.metric}</span>
                    </div>
                    <p className="text-neutral-400">{ins.finding}</p>
                    {ins.significance && (
                      <p className="text-neutral-300 italic border-t border-neutral-800/60 pt-1">
                        Action item: {ins.significance}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">
                Maintain standard operational monitoring and track weekly variance against revenue baselines.
              </p>
            )}
          </section>

          {/* Section 8: Methodology & Limitations */}
          <section className="bg-neutral-900/40 border border-neutral-800/80 rounded-lg p-6 space-y-3 text-xs text-neutral-400">
            <div className="border-b border-neutral-800 pb-2">
              <h2 className="text-sm font-semibold text-neutral-300">8. Methodology & Analytical Caveats</h2>
            </div>
            <p>
              <strong>Data Lineage:</strong> All aggregations and statistics are computed via server-side SQL queries
              directly against the active dataset table. Values are strictly grounded in stored observations without
              synthetic fabrication.
            </p>
            <p>
              <strong>KPI Definitions:</strong> Total revenue represents the sum of confirmed monetary transaction values;
              AOV is defined strictly as total revenue divided by distinct confirmed orders; growth percentages are
              calculated chronologically over preceding period baselines.
            </p>
            <p>
              <strong>Limitations:</strong> Datasets lacking a designated date column cannot support temporal trend
              modeling. Statistical correlation metrics reflect observed co-movement, not causal mechanisms.
            </p>
          </section>

          {/* CSV Export Downloads Area */}
          <section className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-neutral-200">Export Verified Datasets & Reports (CSV)</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Download verified warehouse aggregates and source observations for audit and downstream processing.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {CSV_EXPORTS.map((r) => (
                <button
                  key={r.name}
                  onClick={() => runCsvExport(r.name)}
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded p-2.5 text-xs text-left transition font-medium flex flex-col justify-between h-16"
                >
                  <span className="leading-snug">{r.label}</span>
                  <span className="text-[10px] text-blue-200/70 font-mono">CSV File</span>
                </button>
              ))}
            </div>

            {user && (
              <div className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-800">
                Audited user: <span className="text-neutral-300">{user.username}</span> ({user.role})
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
