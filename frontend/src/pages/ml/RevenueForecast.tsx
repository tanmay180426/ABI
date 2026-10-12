import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { KpiCard } from '@/components/KpiCard'
import { getForecast, type ForecastPoint } from '@/services/api'
import { useFilters } from '@/hooks/useFilters'
import FilterBar from '@/components/FilterBar'

const fmtMoney = (n: number) =>
  `R$ ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function RevenueForecast() {
  const { filters } = useFilters()
  const navigate = useNavigate()
  const location = useLocation()
  const [reason, setReason] = useState<string | null>(null)
  const [history, setHistory] = useState<ForecastPoint[]>([])
  const [forecast, setForecast] = useState<ForecastPoint[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [horizon, setHorizon] = useState<number>(30)
  const [reloadKey, setReloadKey] = useState<number>(0)

  useEffect(() => {
    let current = true
    setState('loading')
    setReason(null)
    getForecast(horizon, 'revenue', filters)
      .then((res) => {
        if (!current) return
        if (res.status === 'not_applicable') {
          setReason(res.reason || 'Model requirements are not satisfied.')
          setState('ready')
          setHistory([])
          setForecast([])
          return
        }
        setHistory(res.history_tail)
        setForecast(res.forecast)
        setState('ready')
      })
      .catch((e) => {
        if (current) {
          setReason(e.message)
          setState('error')
        }
      })
    return () => {
      current = false
    }
  }, [horizon, filters, reloadKey])

  const forecastData = useMemo(() => {
    if (!history.length && !forecast.length) return []
    const points: Array<{ date: string; historical: number | null; forecast: number | null }> = []

    history.forEach((p, idx) => {
      const isLast = idx === history.length - 1 && forecast.length > 0
      points.push({
        date: p.date,
        historical: p.revenue ?? null,
        // Connect forecast curve cleanly from the last historical point
        forecast: isLast ? (p.revenue ?? null) : null,
      })
    })

    forecast.forEach((p) => {
      points.push({
        date: p.date,
        historical: null,
        forecast: p.revenue ?? null,
      })
    })

    return points.sort((a, b) => a.date.localeCompare(b.date))
  }, [history, forecast])

  const isAuthError = Boolean(
    reason &&
      (reason.toLowerCase().includes('authentication') ||
        reason.includes('401') ||
        reason.toLowerCase().includes('unauthorized') ||
        reason.toLowerCase().includes('not signed in'))
  )

  const totalForecastRevenue = forecast.reduce((acc, p) => acc + (p.revenue || 0), 0)
  const avgForecastRevenue = forecast.length > 0 ? totalForecastRevenue / forecast.length : 0
  const latestHistorical = history.length > 0 ? history[history.length - 1].revenue || 0 : 0

  return (
    <div className="space-y-6">
      <FilterBar />
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Revenue Forecast</h1>
          <p className="text-sm text-neutral-500">
            Machine Learning (Gradient Boosting Regressor) predictive forecast of daily revenue, trained on lag and rolling historical features.
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 flex items-center gap-2">
          <label className="text-sm text-neutral-400">Horizon:</label>
          <select
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
            className="bg-transparent text-sm text-neutral-200 outline-none"
          >
            <option value={7}>7 Days</option>
            <option value={14}>14 Days</option>
            <option value={30}>30 Days</option>
            <option value={90}>90 Days</option>
          </select>
        </div>
      </div>

      {state === 'loading' && <div className="text-neutral-400">Running forecast model...</div>}

      {state === 'error' && (
        <div
          role="alert"
          className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 max-w-xl space-y-4 shadow-lg"
        >
          {isAuthError ? (
            <>
              <div className="flex items-center gap-3 text-amber-400">
                <svg
                  className="w-6 h-6 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h2 className="text-lg font-semibold text-neutral-100">Session Expired or Not Signed In</h2>
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">
                Authentication is required to access machine learning forecast models. Your session may have expired or you are not currently signed in.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/login', { state: { from: location.pathname } })}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm px-3 py-2 rounded transition-colors"
                >
                  Retry Request
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-red-400">Failed to Generate Forecast</h2>
              <p className="text-sm text-neutral-400">{reason || 'An unexpected error occurred.'}</p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm px-4 py-2 rounded transition-colors"
                >
                  Retry
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {state === 'ready' && reason && (
        <div role="status" className="bg-neutral-900 border border-neutral-800 rounded p-4">
          <h2 className="text-amber-400 font-medium mb-1">Not Applicable</h2>
          <p className="text-neutral-400 text-sm">{reason}</p>
        </div>
      )}

      {state === 'ready' && !reason && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Latest Actual Revenue"
              value={fmtMoney(latestHistorical)}
            />
            <KpiCard
              label={`Forecast Average (${horizon}d)`}
              value={fmtMoney(avgForecastRevenue)}
            />
            <KpiCard
              label={`Forecast Total (${horizon}d)`}
              value={fmtMoney(totalForecastRevenue)}
            />
          </div>

          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium">Historical Actuals vs Predicted Revenue</h2>
              <div className="text-xs text-neutral-400 bg-neutral-800/70 border border-neutral-700 px-2 py-1 rounded">
                Model: Gradient Boosting Regressor (Daily)
              </div>
            </div>

            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={forecastData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="date" stroke="#666" fontSize={11} minTickGap={30} />
                <YAxis
                  stroke="#666"
                  fontSize={11}
                  tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #333' }}
                  formatter={(val: number, name: string) => [fmtMoney(val), name]}
                />
                <Legend iconType="circle" />
                <Line
                  name="Actual Revenue"
                  type="monotone"
                  dataKey="historical"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  name="Predicted Revenue"
                  type="monotone"
                  dataKey="forecast"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 2, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 mt-6">
            <h2 className="mb-4 font-medium text-sm text-neutral-400 uppercase tracking-wider">Forecast Data Table</h2>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-neutral-500 text-xs uppercase sticky top-0 bg-neutral-900 border-b border-neutral-800">
                  <tr>
                    <th className="text-left py-2 px-4">Date</th>
                    <th className="text-right py-2 px-4">Predicted Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((p) => (
                    <tr key={p.date} className="border-b border-neutral-800/30 hover:bg-neutral-800/50">
                      <td className="py-2 px-4 text-neutral-300 font-mono">{p.date}</td>
                      <td className="py-2 px-4 text-right font-mono text-amber-400">{fmtMoney(p.revenue || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
