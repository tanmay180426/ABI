import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { forecastDate, type ChartPoint } from '@/services/forecast'

export default function ForecastChart({ points, format, unit, mode = 'forecast' }: { points: ChartPoint[]; format: (value: number) => string; unit: string; mode?: 'forecast' | 'backtest' }) {
  if (!points.length) return <section className="abi-panel p-5" aria-label={mode === 'backtest' ? 'Historical backtest chart' : 'Historical and future forecast chart'}><h2 className="font-medium">{mode === 'backtest' ? 'Historical holdout backtest' : 'Historical actuals and future forecast'}</h2><p className="text-sm text-neutral-400 mt-2">No chart observations are available.</p></section>
  const actual = points.filter(p => p.historical !== null)
  const lastActual = actual[actual.length - 1]
  const firstForecast = points.find(p => p.forecast !== null)
  return <section className="abi-panel p-5 min-w-0" aria-label={mode === 'backtest' ? 'Historical held-out actual versus predicted chart' : 'Historical and future forecast chart'}>
    <h2 className="font-medium">{mode === 'backtest' ? 'Actual versus held-out predictions' : 'Historical actuals and future forecast'}</h2>
    <p className="text-xs text-neutral-400 mt-1 mb-5">Daily {unit}. {mode === 'backtest' ? `Evaluation dates ${points[0].date}–${points[points.length - 1].date}.` : `Actuals end ${lastActual?.date}; future predictions begin ${firstForecast?.date}. Dashed line: trained model output.`}</p>
    <div data-testid={mode === 'backtest' ? 'backtest-chart' : 'forecast-chart'} data-history-end={lastActual?.date} data-forecast-start={firstForecast?.date} data-forecast-points={points.filter(p => p.forecast !== null).length} data-evaluation-points={mode === 'backtest' ? points.length : undefined}>
      <ResponsiveContainer width="100%" height={350}><LineChart data={points} margin={{ top: 25, right: 24, left: 12, bottom: 10 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis type="number" dataKey="time" domain={['dataMin', 'dataMax']} tickFormatter={forecastDate} minTickGap={65} stroke="rgb(var(--muted))" fontSize={11} />
        <YAxis width={95} label={{ value: unit, angle: -90, position: 'insideLeft', fill: 'rgb(var(--muted))', fontSize: 10 }} tickFormatter={v => Number(v).toLocaleString('en-US', { notation: 'compact' })} stroke="rgb(var(--muted))" fontSize={11} />
        <Tooltip labelFormatter={value => forecastDate(Number(value))} formatter={(value: number, name: string) => [format(value), name]} contentStyle={{ background: 'rgb(var(--surface-raised))', border: '1px solid rgb(var(--border))' }} />
        <Legend />
        {mode === 'forecast' && lastActual && firstForecast && <ReferenceLine x={(lastActual.time + firstForecast.time) / 2} stroke="rgb(var(--muted))" strokeDasharray="3 3" label={{ value: 'Future →', position: 'insideTopRight', fill: 'rgb(var(--muted))', fontSize: 11 }} />}
        <Line dataKey="historical" name={mode === 'backtest' ? 'Actual' : 'Historical actual'} stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        {mode === 'backtest' ? <Line dataKey="predicted" name="Held-out prediction" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} isAnimationActive={false} /> : <Line dataKey="forecast" name="Future forecast" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2 }} isAnimationActive={false} />}
      </LineChart></ResponsiveContainer>
    </div>
    {mode === 'backtest' && <div className="mt-4" aria-label="Forecast residuals over time"><h3 className="text-sm font-medium mb-2">Residuals over time · actual − predicted ({unit})</h3><ResponsiveContainer width="100%" height={190}><LineChart data={points} margin={{ top: 8, right: 24, left: 12, bottom: 5 }}><CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" vertical={false} /><XAxis type="number" dataKey="time" domain={['dataMin','dataMax']} tickFormatter={forecastDate} minTickGap={65} stroke="rgb(var(--muted))" fontSize={11} /><YAxis width={95} label={{ value: `Residual · ${unit}`, angle: -90, position: 'insideLeft', fill: 'rgb(var(--muted))', fontSize: 10 }} tickFormatter={v => Number(v).toLocaleString('en-US',{notation:'compact'})} stroke="rgb(var(--muted))" fontSize={11} /><Tooltip labelFormatter={value => forecastDate(Number(value))} formatter={(value: number) => [format(value),'Residual (actual − predicted)']} contentStyle={{ background: 'rgb(var(--surface-raised))', border: '1px solid rgb(var(--border))' }} /><ReferenceLine y={0} stroke="rgb(var(--muted))" strokeDasharray="3 3" /><Line dataKey="residual" name="Residual" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>}
  </section>
}
