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
  Area,
  ComposedChart,
} from 'recharts'
import { KpiCard } from '@/components/KpiCard'
import {
  getForecast,
  getForecastOptions,
  generateDatasetForecast,
  type ForecastPoint,
  type ForecastOptions,
  type DatasetForecastResult,
} from '@/services/api'
import { useFilters } from '@/hooks/useFilters'
import FilterBar from '@/components/FilterBar'

const fmtMoney = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function RevenueForecast() {
  const { filters } = useFilters()
  const navigate = useNavigate()
  const location = useLocation()

  // Dynamic Dataset Forecast State
  const [options, setOptions] = useState<ForecastOptions | null>(null)
  const [activeObjective, setActiveObjective] = useState<'revenue' | 'customers' | 'product_sales' | 'custom'>('revenue')
  const [targetCol, setTargetCol] = useState<string>('')
  const [dateCol, setDateCol] = useState<string>('')
  const [horizon, setHorizon] = useState<number>(30)
  const [grain, setGrain] = useState<string>('day')
  const [dynamicResult, setDynamicResult] = useState<DatasetForecastResult | null>(null)

  // Reference Fallback State
  const [history, setHistory] = useState<ForecastPoint[]>([])
  const [forecast, setForecast] = useState<ForecastPoint[]>([])

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reason, setReason] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState<number>(0)

  // Step 1: Detect Forecast Capabilities for Active Dataset
  useEffect(() => {
    let current = true
    setState('loading')
    setReason(null)

    getForecastOptions()
      .then((opt) => {
        if (!current) return
        setOptions(opt)
        if (opt.compatible && opt.target_columns.length && opt.date_columns.length) {
          // Check for revenue objective first
          const revObj = opt.objectives?.revenue
          const defaultTarget = (revObj && revObj.target_column) || opt.default_target_column || opt.target_columns[0]
          const defaultDate = opt.default_date_column || opt.date_columns[0]
          setTargetCol(defaultTarget)
          setDateCol(defaultDate)
          setActiveObjective(revObj?.target_column ? 'revenue' : 'custom')
          // Run initial dynamic forecast
          runDynamicForecast(defaultTarget, defaultDate, horizon, grain)
        } else {
          // Fall back to reference dataset forecast
          runReferenceForecast()
        }
      })
      .catch(() => {
        if (current) runReferenceForecast()
      })

    return () => {
      current = false
    }
  }, [reloadKey, filters])

  const runDynamicForecast = (t: string, d: string, h: number, g: string) => {
    setState('loading')
    setReason(null)
    generateDatasetForecast({
      target_column: t,
      date_column: d,
      periods: h,
      grain: g,
    })
      .then((res) => {
        if (res.status === 'success' && res.compatible) {
          setDynamicResult(res)
          setState('ready')
        } else {
          setReason(res.reason || 'Dataset is not compatible with time-series forecasting.')
          setDynamicResult(null)
          setState('ready')
        }
      })
      .catch((err) => {
        setReason(err instanceof Error ? err.message : 'Forecasting request failed.')
        setState('error')
      })
  }

  const handleObjectiveChange = (objKey: 'revenue' | 'customers' | 'product_sales' | 'custom') => {
    setActiveObjective(objKey)
    if (!options) return

    if (objKey !== 'custom' && options.objectives && options.objectives[objKey]?.target_column) {
      const col = options.objectives[objKey].target_column!
      setTargetCol(col)
      if (dateCol) {
        runDynamicForecast(col, dateCol, horizon, grain)
      }
    }
  }

  const runReferenceForecast = () => {
    getForecast(horizon, 'revenue', filters)
      .then((res) => {
        if (res.status === 'not_applicable') {
          setReason(res.reason || 'Model requirements are not satisfied for this dataset.')
          setState('ready')
          setHistory([])
          setForecast([])
          return
        }
        setHistory(res.history_tail || [])
        setForecast(res.forecast || [])
        setDynamicResult(null)
        setState('ready')
      })
      .catch((e) => {
        setReason(e.message)
        setState('error')
      })
  }

  const handleRunForecast = () => {
    if (!targetCol || !dateCol) return
    runDynamicForecast(targetCol, dateCol, horizon, grain)
  }

  // Combined chart data for dynamic forecast
  const combinedDynamicChartData = useMemo(() => {
    if (!dynamicResult) return []
    const points: Array<{
      date: string
      actual: number | null
      validation: number | null
      forecast: number | null
      lower_ci: number | null
      upper_ci: number | null
    }> = []

    // Historical observed
    dynamicResult.historical.forEach((p, idx) => {
      const isLast = idx === dynamicResult.historical.length - 1 && dynamicResult.forecast.length > 0
      points.push({
        date: p.date,
        actual: p.actual,
        validation: null,
        // Bridge seamlessly to forecast line at the last observed point
        forecast: isLast ? p.actual : null,
        lower_ci: isLast ? p.actual : null,
        upper_ci: isLast ? p.actual : null,
      })
    })

    // Future predictions
    dynamicResult.forecast.forEach((p) => {
      points.push({
        date: p.date,
        actual: null,
        validation: null,
        forecast: p.forecast,
        lower_ci: p.lower_bound,
        upper_ci: p.upper_bound,
      })
    })

    return points.sort((a, b) => a.date.localeCompare(b.date))
  }, [dynamicResult])

  // Fallback chart data for reference dataset
  const fallbackForecastData = useMemo(() => {
    if (!history.length && !forecast.length) return []
    const points: Array<{ date: string; historical: number | null; forecast: number | null }> = []

    history.forEach((p, idx) => {
      const isLast = idx === history.length - 1 && forecast.length > 0
      points.push({
        date: p.date,
        historical: p.revenue ?? null,
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

  const exportForecastCsv = () => {
    if (!dynamicResult) return
    const headers = 'Date,Forecast_Estimate,Lower_Bound_95CI,Upper_Bound_95CI\n'
    const rows = dynamicResult.forecast
      .map((f) => `${f.date},${f.forecast},${f.lower_bound},${f.upper_bound}`)
      .join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${dynamicResult.dataset_name}_forecast_${horizon}p.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const isAuthError = Boolean(
    reason &&
      (reason.toLowerCase().includes('authentication') ||
        reason.includes('401') ||
        reason.toLowerCase().includes('unauthorized') ||
        reason.toLowerCase().includes('not signed in'))
  )

  return (
    <div className="space-y-6">
      <FilterBar />

      {/* Header and Prediction Objective Selector */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Autonomous ML Forecasting Engine</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Leakage-free time series forecasting with chronological validation, dynamic lag engineering, and baseline comparisons.
            </p>
          </div>

          {/* Quick Frequency & Horizon Controls */}
          {options && options.compatible && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-1.5 flex items-center gap-1">
                <span className="text-neutral-400 px-2 font-medium">Frequency:</span>
                {[
                  { id: 'day', label: 'Daily' },
                  { id: 'week', label: 'Weekly' },
                  { id: 'month', label: 'Monthly' },
                ].map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setGrain(g.id)
                      if (targetCol && dateCol) runDynamicForecast(targetCol, dateCol, horizon, g.id)
                    }}
                    className={`px-2.5 py-1 rounded font-medium transition ${
                      grain === g.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-1.5 flex items-center gap-1">
                <span className="text-neutral-400 px-2 font-medium">Horizon:</span>
                {[7, 14, 30, 60, 90].map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setHorizon(h)
                      if (targetCol && dateCol) runDynamicForecast(targetCol, dateCol, h, grain)
                    }}
                    className={`px-2 py-1 rounded font-medium transition ${
                      horizon === h
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                    }`}
                  >
                    {h}p
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Prediction Objective Selector Cards */}
        {options && options.compatible && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'revenue',
                icon: '💰',
                title: 'Revenue Forecasting',
                desc: 'Predict monetary sales volume, cash flows, and future business income.',
                target: options.objectives?.revenue?.target_column,
                available: Boolean(options.objectives?.revenue?.available),
              },
              {
                id: 'customers',
                icon: '👥',
                title: 'Customer Activity',
                desc: 'Predict active client counts, user engagement, and demand frequency.',
                target: options.objectives?.customers?.target_column,
                available: Boolean(options.objectives?.customers?.available),
              },
              {
                id: 'product_sales',
                icon: '📦',
                title: 'Product Sales & Demand',
                desc: 'Predict unit volume, item order count, and inventory demand.',
                target: options.objectives?.product_sales?.target_column,
                available: Boolean(options.objectives?.product_sales?.available),
              },
              {
                id: 'custom',
                icon: '⚙️',
                title: 'Custom Measure',
                desc: 'Manually select any numeric metric and temporal column from this dataset.',
                target: targetCol,
                available: true,
              },
            ].map((obj) => {
              const isSelected = activeObjective === obj.id
              return (
                <div
                  key={obj.id}
                  onClick={() => handleObjectiveChange(obj.id as any)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer transition relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-950/40 border-blue-600 ring-1 ring-blue-500 shadow-md'
                      : 'bg-neutral-900/70 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                  } ${!obj.available ? 'opacity-60' : ''}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{obj.icon}</span>
                        <span className="font-semibold text-sm text-neutral-200">{obj.title}</span>
                      </div>
                      {obj.available ? (
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Ready
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                          Unavailable
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">{obj.desc}</p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[11px] font-mono text-neutral-400">
                    <span>Target:</span>
                    <span className="text-neutral-200 font-semibold truncate max-w-[140px]">
                      {obj.target || 'None mapped'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Detailed Target / Date Configuration Bar for Active Forecast */}
        {options && options.compatible && (
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-neutral-400">
                <span>Target Measure:</span>
                <select
                  value={targetCol}
                  onChange={(e) => {
                    setTargetCol(e.target.value)
                    setActiveObjective('custom')
                  }}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 outline-none font-medium text-xs font-mono"
                >
                  {options.target_columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-neutral-400">
                <span>Temporal Field:</span>
                <select
                  value={dateCol}
                  onChange={(e) => setDateCol(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 outline-none font-medium text-xs font-mono"
                >
                  {options.date_columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              onClick={handleRunForecast}
              disabled={state === 'loading'}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-1.5 rounded transition disabled:opacity-50 flex items-center gap-2"
            >
              <span>{state === 'loading' ? '⏳ Retraining Model…' : '⚡ Generate Forecast'}</span>
            </button>
          </div>
        )}
      </div>

      {state === 'loading' && (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-8 text-center text-sm text-neutral-400 animate-pulse">
          Splitting historical dataset chronologically, training Gradient Boosting Regressor, and estimating confidence intervals…
        </div>
      )}

      {state === 'error' && (
        <div
          role="alert"
          className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 max-w-xl space-y-4 shadow-lg"
        >
          {isAuthError ? (
            <>
              <div className="flex items-center gap-3 text-amber-400">
                <h2 className="text-lg font-semibold text-neutral-100">Session Expired or Not Signed In</h2>
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">
                Authentication is required to access machine learning forecast models.
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
        <div role="status" className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-2">
          <h2 className="text-amber-400 font-medium">Dataset Not Compatible for Forecasting</h2>
          <p className="text-neutral-400 text-sm">{reason}</p>
          <div className="pt-2">
            <button
              onClick={() => navigate('/datasets')}
              className="text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded transition"
            >
              Go to Datasets to Map Date / Numeric Columns
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Forecast View for Uploaded or Selected Datasets */}
      {state === 'ready' && dynamicResult && !reason && (
        <div className="space-y-6">
          {/* Metrics & Baseline Scorecard */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Model Test MAE"
              value={fmtMoney(dynamicResult.metrics.mae)}
              hint={`Seasonal-Naive Baseline: ${fmtMoney(dynamicResult.metrics.baseline_mae)}`}
            />
            <KpiCard
              label="Model Test RMSE"
              value={fmtMoney(dynamicResult.metrics.rmse)}
              hint={`Baseline RMSE: ${fmtMoney(dynamicResult.metrics.baseline_rmse)}`}
            />
            <KpiCard
              label="Test MAPE"
              value={`${dynamicResult.metrics.mape.toFixed(1)}%`}
              hint="Mean Absolute Percentage Error"
            />
            <KpiCard
              label={`Projected Avg (${dynamicResult.periods}p)`}
              value={fmtMoney(dynamicResult.metrics.avg_forecast)}
            />
            <KpiCard
              label={`Projected Total (${dynamicResult.periods}p)`}
              value={fmtMoney(dynamicResult.metrics.total_forecast)}
            />
          </div>

          {/* Model Provenance Banner */}
          <div className="text-xs text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-neutral-300">Architecture:</span>
              <span>{dynamicResult.model_info.name}</span>
              <span>•</span>
              <span>
                Observations: {dynamicResult.model_info.train_samples} Train / {dynamicResult.model_info.val_samples} Test (Chronological Split)
              </span>
            </div>
            <button
              onClick={exportForecastCsv}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1 rounded font-medium transition"
            >
              📥 Export Forecast CSV
            </button>
          </div>

          {/* Forecast Visualization Chart with Shaded Confidence Interval */}
          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-neutral-200">
                  Historical Observations vs Recursive Future Forecast ({dynamicResult.target_column})
                </h2>
                <p className="text-xs text-neutral-500">
                  Observed historical tail (blue), future projection (green dashed), and 95% confidence interval band.
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={combinedDynamicChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="date" stroke="#666" fontSize={11} minTickGap={30} />
                <YAxis stroke="#666" fontSize={11} tickFormatter={(v) => fmtMoney(v)} />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #333' }}
                  formatter={(val: number, name: string) => [fmtMoney(val), name]}
                />
                <Legend iconType="circle" />
                <Area
                  name="95% Confidence Upper"
                  type="monotone"
                  dataKey="upper_ci"
                  stroke="transparent"
                  fill="#10b981"
                  fillOpacity={0.12}
                />
                <Area
                  name="95% Confidence Lower"
                  type="monotone"
                  dataKey="lower_ci"
                  stroke="transparent"
                  fill="transparent"
                />
                <Line
                  name="Historical Observed"
                  type="monotone"
                  dataKey="actual"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  name="Future Prediction"
                  type="monotone"
                  dataKey="forecast"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Predictions Data Table */}
          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
            <h3 className="mb-3 font-medium text-xs text-neutral-400 uppercase tracking-wider">
              Future Prediction Schedule & Uncertainty Intervals
            </h3>
            <div className="max-h-64 overflow-auto border border-neutral-800 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-900 text-neutral-400 sticky top-0 border-b border-neutral-800">
                  <tr>
                    <th className="py-2.5 px-4 font-mono">Forecast Period</th>
                    <th className="py-2.5 px-4 text-right font-mono">Predicted {dynamicResult.target_column}</th>
                    <th className="py-2.5 px-4 text-right font-mono">95% Lower Bound</th>
                    <th className="py-2.5 px-4 text-right font-mono">95% Upper Bound</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono">
                  {dynamicResult.forecast.map((p) => (
                    <tr key={p.date} className="hover:bg-neutral-900/40">
                      <td className="py-2 px-4 text-neutral-300">{p.date}</td>
                      <td className="py-2 px-4 text-right text-emerald-400 font-semibold">{fmtMoney(p.forecast)}</td>
                      <td className="py-2 px-4 text-right text-neutral-400">{fmtMoney(p.lower_bound)}</td>
                      <td className="py-2 px-4 text-right text-neutral-400">{fmtMoney(p.upper_bound)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Limitation and Governance Disclaimer */}
          <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-lg p-4 text-xs text-neutral-400 space-y-1">
            <p className="font-semibold text-neutral-300 uppercase tracking-wider">Methodology & ML Disclaimers</p>
            <p>
              Predictions are generated by a recursive Gradient Boosting Regressor trained strictly on time-lagged features without temporal lookahead leakage.
              Future values are statistical point estimates and interval bounds, not guaranteed business outcomes. Evaluate domain events and seasonality prior to production planning.
            </p>
          </div>
        </div>
      )}

      {/* Fallback View for Default Reference Dataset */}
      {state === 'ready' && !dynamicResult && !reason && forecast.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Latest Observed Value"
              value={fmtMoney(history.length > 0 ? history[history.length - 1].revenue || 0 : 0)}
            />
            <KpiCard
              label={`Forecast Average (${horizon}d)`}
              value={fmtMoney(forecast.length > 0 ? forecast.reduce((a, b) => a + (b.revenue || 0), 0) / forecast.length : 0)}
            />
            <KpiCard
              label={`Forecast Total (${horizon}d)`}
              value={fmtMoney(forecast.reduce((a, b) => a + (b.revenue || 0), 0))}
            />
          </div>

          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 space-y-3">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-medium">Historical Actuals vs Predicted Revenue</h2>
              <div className="text-xs text-neutral-400 bg-neutral-800/70 border border-neutral-700 px-2 py-1 rounded">
                Model: Gradient Boosting Regressor (Daily)
              </div>
            </div>

            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={fallbackForecastData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis dataKey="date" stroke="#666" fontSize={11} minTickGap={30} />
                <YAxis stroke="#666" fontSize={11} tickFormatter={(v) => fmtMoney(v)} />
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
        </div>
      )}
    </div>
  )
}
