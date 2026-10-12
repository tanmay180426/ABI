import DatasetResults from '@/components/DatasetResults'
import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { getAnalyticsOverview } from '@/services/api'
import { useFilters } from '@/hooks/useFilters'
import FilterBar from '@/components/FilterBar'

import { KpiCard } from '@/components/KpiCard'
import { fmtMoney } from '@/services/format'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

export default function Dashboard() {
  const { filters } = useFilters()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let current = true
    setState('loading')
    getAnalyticsOverview(filters)
      .then((res) => {
        if (!current) return
        setData(res)
        setState('ready')
      })
      .catch(e => { if (current) { setError(e.message); setState('error') } })
    return () => { current = false }
  }, [filters])

  if (state === 'error') {
    return (
      <div className="text-red-400">
        {error || 'Could not load data.'}
      </div>
    )
  }

  const renderContent = () => {
    if (state === 'loading' || !data) {
      return <div className="text-neutral-400">Loading dataset metrics...</div>
    }

    if ('metric_cards' in data) return <DatasetResults data={data} />

    const { kpis, revenue_series, revenue_by_category, orders_by_status, top_customer_states, delivery } = data

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Revenue" value={fmtMoney(kpis.total_revenue)} hint="Sum of item prices" />
          <KpiCard label="Total Orders" value={kpis.total_orders.toLocaleString()} />
          <KpiCard label="Unique Customers" value={kpis.unique_customers.toLocaleString()} />
          <KpiCard label="Products Sold" value={kpis.products_sold.toLocaleString()} />
          <KpiCard label="Active Sellers" value={kpis.active_sellers.toLocaleString()} />
          <KpiCard label="Avg Order Value" value={fmtMoney(kpis.avg_order_value)} />
          <KpiCard label="Avg Review Score" value={kpis.avg_review_score?.toFixed(2) || '—'} hint="out of 5" />
          <KpiCard label="On-time Delivery" value={delivery.kpis.on_time_rate != null ? `${delivery.kpis.on_time_rate}%` : '—'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
            <h2 className="mb-3 font-medium">Revenue Over Time</h2>
            {revenue_series && revenue_series.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenue_series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="period" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(v: number) => fmtMoney(v)}
                    contentStyle={{ background: '#171717', border: '1px solid #333' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-neutral-500">No data available</div>
            )}
          </div>

          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
            <h2 className="mb-3 font-medium">Orders Over Time</h2>
            {revenue_series && revenue_series.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenue_series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="period" stroke="#666" fontSize={11} />
                  <YAxis stroke="#666" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#171717', border: '1px solid #333' }} />
                  <Line type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-neutral-500">No data available</div>
            )}
          </div>

          <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
            <h2 className="mb-3 font-medium">Revenue by Category (Top 10)</h2>
            {revenue_by_category && revenue_by_category.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenue_by_category.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                  <XAxis type="number" stroke="#666" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="category" stroke="#666" fontSize={10} width={80} />
                  <Tooltip
                    formatter={(v: number) => fmtMoney(v)}
                    contentStyle={{ background: '#171717', border: '1px solid #333' }}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-neutral-500">No data available</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800 flex flex-col">
              <h2 className="mb-3 font-medium">Order Status</h2>
              <div className="flex-1 flex items-center justify-center">
                {orders_by_status && orders_by_status.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={orders_by_status}
                        dataKey="orders"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {orders_by_status.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#171717', border: '1px solid #333' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-neutral-500">No data available</div>
                )}
              </div>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-lg border border-neutral-800">
              <h2 className="mb-3 font-medium">Top States (Customers)</h2>
              <div className="space-y-3">
                {top_customer_states?.slice(0, 5).map((s: any) => (
                  <div key={s.state} className="flex justify-between items-center text-sm">
                    <span className="text-neutral-300 font-medium uppercase">{s.state}</span>
                    <span className="text-neutral-400">{s.customers.toLocaleString()} customers</span>
                  </div>
                ))}
                {!top_customer_states?.length && (
                  <div className="text-neutral-500 text-sm">No data available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Executive overview of the active dataset.
        </p>
      </div>
      <FilterBar showGrain={true} />
      {renderContent()}
    </div>
  )
}
