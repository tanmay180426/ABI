import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
} from 'recharts'
import { KpiCard } from '@/components/KpiCard'

interface Results {
  status: string
  reason?: string
  dataset_name?: string
  metric_cards: { label: string; value: number | null }[]
  numeric_statistics?: {
    field: string
    count: number
    sum: number | null
    mean: number | null
    median: number | null
    min: number | null
    max: number | null
  }[]
  distributions?: { field: string; series: { label: string; rows: number; amount?: number }[] }[]
  time_series?: { period: string; rows: number; revenue?: number; amount?: number }[]
  entities?: { label: string; rows: number; amount?: number }[]
  correlations?: { fields: string[]; matrix: number[][] }
  box_plots?: {
    field: string
    min: number
    q1: number
    median: number
    q3: number
    max: number
    outliers_count: number
  }[]
  histograms?: { field: string; bins: { bin: string; count: number }[] }[]
  scatter_data?: { x_field: string; y_field: string; points: { x: number; y: number }[] }
}

const format = (v: number | null | undefined) =>
  v == null ? 'No observed values' : v.toLocaleString('en-US', { maximumFractionDigits: 2 })

function getCorrelationColor(val: number): string {
  if (val >= 0.7) return 'bg-blue-600/60 text-white font-semibold'
  if (val >= 0.3) return 'bg-blue-800/40 text-blue-200'
  if (val > -0.3) return 'bg-neutral-800/60 text-neutral-400'
  if (val > -0.7) return 'bg-amber-800/40 text-amber-200'
  return 'bg-red-800/60 text-white font-semibold'
}

/** Semantic, multi-dimensional dashboard component for any tabular or collection dataset. */
export default function DatasetResults({ data }: { data: Results }) {
  if (data.status === 'not_applicable') {
    return (
      <div role="status" className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5">
        <h2 className="font-medium text-amber-400">Not available for this dataset.</h2>
        <p className="text-neutral-400 mt-2 text-sm">{data.reason}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overview header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-100">
            {data.dataset_name || 'Selected Dataset'} — Autonomous Analytics Dashboard
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Computed strictly from verified dataset records under active filter bounds.
          </p>
        </div>
      </div>

      {/* Primary KPI Cards */}
      {data.metric_cards && data.metric_cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.metric_cards.map((c) => (
            <KpiCard key={c.label} label={c.label} value={format(c.value)} />
          ))}
        </div>
      )}

      {data.metric_cards?.[0]?.value === 0 && (
        <div role="status" className="bg-neutral-900 border border-neutral-800 rounded p-4 text-sm text-neutral-400">
          No rows match the current filter selection. Adjust filters to inspect data.
        </div>
      )}

      {/* Time Trend Chart */}
      {!!data.time_series?.length && (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-neutral-200 text-sm">Temporal Trajectory (Time Trend)</h3>
            <span className="text-xs text-neutral-500 font-mono">
              {data.time_series.length} periods observed
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.time_series} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid stroke="#262626" vertical={false} />
              <XAxis dataKey="period" stroke="#888" fontSize={11} minTickGap={25} />
              <YAxis stroke="#888" fontSize={11} />
              <Tooltip contentStyle={{ background: '#171717', border: '1px solid #333' }} />
              <Line
                type="monotone"
                dataKey={
                  data.time_series.some((p) => p.revenue != null)
                    ? 'revenue'
                    : data.time_series.some((p) => p.amount != null)
                    ? 'amount'
                    : 'rows'
                }
                name={
                  data.time_series.some((p) => p.revenue != null)
                    ? 'Revenue'
                    : data.time_series.some((p) => p.amount != null)
                    ? 'Amount'
                    : 'Row Count'
                }
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category Distributions & Numerical Histograms */}
      <div className="grid md:grid-cols-2 gap-4">
        {data.distributions?.map((d) => (
          <div key={d.field} className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-neutral-200 text-sm capitalize">
              {d.field.replace(/_/g, ' ')} Distribution
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid stroke="#262626" vertical={false} />
                <XAxis dataKey="label" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ background: '#171717', border: '1px solid #333' }} />
                <Bar dataKey="rows" name="Row Count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}

        {data.histograms?.map((h) => (
          <div key={h.field} className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-neutral-200 text-sm capitalize">
              {h.field.replace(/_/g, ' ')} Numerical Histogram
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={h.bins} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid stroke="#262626" vertical={false} />
                <XAxis dataKey="bin" stroke="#888" fontSize={10} minTickGap={15} />
                <YAxis stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ background: '#171717', border: '1px solid #333' }} />
                <Bar dataKey="count" name="Frequency" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* Numerical Outlier & Box Plot Analysis */}
      {!!data.box_plots?.length && (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-neutral-200 text-sm">
            Distribution Quartiles & Outlier Analysis (Box-Plot Metrics)
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.box_plots.map((bp) => (
              <div key={bp.field} className="border border-neutral-800 bg-neutral-950/60 rounded p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-1">
                  <span className="font-semibold text-neutral-200">{bp.field}</span>
                  {bp.outliers_count > 0 ? (
                    <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded">
                      {bp.outliers_count} IQR outliers
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-500">No outliers</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-neutral-400">
                  <span>Min: <strong className="text-neutral-300 font-mono">{format(bp.min)}</strong></span>
                  <span>Q1 (25%): <strong className="text-neutral-300 font-mono">{format(bp.q1)}</strong></span>
                  <span>Median: <strong className="text-blue-400 font-mono">{format(bp.median)}</strong></span>
                  <span>Q3 (75%): <strong className="text-neutral-300 font-mono">{format(bp.q3)}</strong></span>
                  <span className="col-span-2">Max: <strong className="text-neutral-300 font-mono">{format(bp.max)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scatter Plot between Key Numeric Columns */}
      {data.scatter_data && data.scatter_data.points?.length > 0 && (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-neutral-200 text-sm">
              Bivariate Scatter: {data.scatter_data.x_field} vs {data.scatter_data.y_field}
            </h3>
            <span className="text-xs text-neutral-500 font-mono">
              Sampled for readable rendering ({data.scatter_data.points.length} points)
            </span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid stroke="#262626" />
              <XAxis
                dataKey="x"
                name={data.scatter_data.x_field}
                stroke="#888"
                fontSize={11}
                tickFormatter={(v) => format(v)}
              />
              <YAxis
                dataKey="y"
                name={data.scatter_data.y_field}
                stroke="#888"
                fontSize={11}
                tickFormatter={(v) => format(v)}
              />
              <ZAxis range={[25, 25]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: '#171717', border: '1px solid #333' }}
                formatter={(val: number, name: string) => [format(val), name]}
              />
              <Scatter data={data.scatter_data.points} fill="#8b5cf6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pearson Correlation Heatmap */}
      {data.correlations && data.correlations.fields?.length > 1 && (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-neutral-200 text-sm">
            Pearson Correlation Matrix (Numerical Field Interdependencies)
          </h3>
          <div className="overflow-auto border border-neutral-800 rounded">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-neutral-900 text-neutral-300">
                  <th className="p-2 text-left">Feature</th>
                  {data.correlations.fields.map((f) => (
                    <th key={f} className="p-2 font-mono truncate max-w-[120px]" title={f}>
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {data.correlations.fields.map((f, i) => (
                  <tr key={f}>
                    <td className="p-2 font-medium text-left text-neutral-300 bg-neutral-900/60 truncate max-w-[140px]" title={f}>
                      {f}
                    </td>
                    {data.correlations!.matrix[i]?.map((coeff, j) => (
                      <td
                        key={j}
                        className={`p-2 font-mono text-xs transition-colors ${getCorrelationColor(coeff)}`}
                      >
                        {coeff.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Descriptive Numeric Statistics */}
      {!!data.numeric_statistics?.length && (
        <div className="overflow-auto border border-neutral-800 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-900 text-neutral-300">
              <tr>
                {['Numerical Field', 'Observed Count', 'Sum', 'Mean', 'Median', 'Min', 'Max'].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.numeric_statistics.map((s) => (
                <tr key={s.field} className="border-t border-neutral-800 hover:bg-neutral-900/30">
                  <td className="p-3 font-medium text-neutral-200">{s.field}</td>
                  <td className="p-3 font-mono text-neutral-400">{s.count.toLocaleString()}</td>
                  <td className="p-3 font-mono text-neutral-200">{format(s.sum)}</td>
                  <td className="p-3 font-mono text-neutral-200">{format(s.mean)}</td>
                  <td className="p-3 font-mono text-blue-400">{format(s.median)}</td>
                  <td className="p-3 font-mono text-neutral-400">{format(s.min)}</td>
                  <td className="p-3 font-mono text-neutral-400">{format(s.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Categorical Entity Breakdown */}
      {!!data.entities?.length && (
        <div className="overflow-auto border border-neutral-800 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-900 text-neutral-300">
              <tr>
                <th className="p-3">Entity / Category</th>
                <th className="p-3">Record Count</th>
                <th className="p-3">Aggregated Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.entities.map((r) => (
                <tr key={r.label} className="border-t border-neutral-800 hover:bg-neutral-900/30">
                  <td className="p-3 text-neutral-200">{r.label}</td>
                  <td className="p-3 font-mono text-neutral-400">{r.rows.toLocaleString()}</td>
                  <td className="p-3 font-mono text-neutral-200">{format(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
