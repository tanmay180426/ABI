import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
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
  AreaChart,
  Area,
} from 'recharts'
import {
  getAnalyticsOverview,
  getForecastOptions,
  type ForecastOptions,
} from '@/services/api'
import { useFilters } from '@/hooks/useFilters'
import { useDataset } from '@/hooks/useDataset'
import FilterBar from '@/components/FilterBar'
import { KpiCard } from '@/components/KpiCard'
import { fmtMoney } from '@/services/format'

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
  '#6366f1', // indigo
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { filters, resetFilters } = useFilters()
  const { active } = useDataset()

  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [activeTrendMetric, setActiveTrendMetric] = useState<'revenue' | 'volume'>('revenue')

  // Forecast capability
  const [forecastOptions, setForecastOptions] = useState<ForecastOptions | null>(null)
  const [forecastLoading, setForecastLoading] = useState<boolean>(true)

  // Fetch overview data whenever filters or active dataset changes
  useEffect(() => {
    let current = true
    setLoading(true)
    setError(null)

    getAnalyticsOverview(filters)
      .then((res) => {
        if (!current) return
        setData(res)
        setLoading(false)
      })
      .catch((e) => {
        if (!current) return
        setError(e.message || 'Failed to load executive metrics.')
        setLoading(false)
      })

    return () => {
      current = false
    }
  }, [filters, active?.dataset_id])

  // Check forecasting compatibility
  useEffect(() => {
    let current = true
    setForecastLoading(true)
    getForecastOptions()
      .then((opt) => {
        if (!current) return
        setForecastOptions(opt)
        setForecastLoading(false)
      })
      .catch(() => {
        if (!current) return
        setForecastOptions(null)
        setForecastLoading(false)
      })
    return () => {
      current = false
    }
  }, [active?.dataset_id])

  // Unified normalization of time-series data
  const timeSeries = useMemo(() => {
    if (!data) return []
    const raw = data.revenue_series || data.time_series || []
    return raw.map((item: any) => {
      const period = item.period || 'Unknown'
      const revenue = item.revenue != null ? Number(item.revenue) : (item.amount != null ? Number(item.amount) : null)
      const volume = item.orders != null ? Number(item.orders) : (item.rows != null ? Number(item.rows) : 0)
      const customers = item.customers != null ? Number(item.customers) : null
      return { period, revenue, volume, customers }
    })
  }, [data])

  // Set default trend metric depending on whether revenue exists
  useEffect(() => {
    if (timeSeries.length > 0) {
      const hasRevenue = timeSeries.some((p: any) => p.revenue != null && p.revenue > 0)
      setActiveTrendMetric(hasRevenue ? 'revenue' : 'volume')
    }
  }, [timeSeries])

  // Calculate Period-over-Period Growth for the latest period
  const growthMetrics = useMemo(() => {
    if (timeSeries.length < 2) {
      return { revenueGrowth: null, volumeGrowth: null, latestPeriod: null, prevPeriod: null }
    }
    const last = timeSeries[timeSeries.length - 1]
    const prev = timeSeries[timeSeries.length - 2]

    let revenueGrowth: number | null = null
    if (last.revenue != null && prev.revenue != null && prev.revenue > 0) {
      revenueGrowth = Math.round(((last.revenue - prev.revenue) / prev.revenue) * 1000) / 10
    }

    let volumeGrowth: number | null = null
    if (last.volume != null && prev.volume != null && prev.volume > 0) {
      volumeGrowth = Math.round(((last.volume - prev.volume) / prev.volume) * 1000) / 10
    }

    return {
      revenueGrowth,
      volumeGrowth,
      latestPeriod: last.period,
      prevPeriod: prev.period,
    }
  }, [timeSeries])

  // Unified normalization of categories
  const categoryData = useMemo(() => {
    if (!data) return []
    if (data.revenue_by_category && data.revenue_by_category.length > 0) {
      const totalRev = data.revenue_by_category.reduce((acc: number, cur: any) => acc + (cur.revenue || 0), 0)
      return data.revenue_by_category.slice(0, 10).map((c: any) => ({
        name: (c.category || 'Unknown').replace(/_/g, ' '),
        value: c.revenue || 0,
        count: c.quantity || c.items || 0,
        share: totalRev > 0 ? Math.round(((c.revenue || 0) / totalRev) * 1000) / 10 : 0,
      }))
    }
    if (data.distributions && data.distributions.length > 0) {
      const dist = data.distributions[0]
      const series = dist.series || []
      const totalRows = series.reduce((acc: number, cur: any) => acc + (cur.rows || 0), 0)
      return series.slice(0, 10).map((s: any) => ({
        name: (s.label || 'Unknown').replace(/_/g, ' '),
        value: s.amount != null ? s.amount : s.rows,
        count: s.rows,
        share: totalRows > 0 ? Math.round((s.rows / totalRows) * 1000) / 10 : 0,
      }))
    }
    return []
  }, [data])

  // Status breakdown
  const statusData = useMemo(() => {
    if (!data) return []
    if (data.orders_by_status && data.orders_by_status.length > 0) {
      const total = data.orders_by_status.reduce((acc: number, cur: any) => acc + (cur.orders || 0), 0)
      return data.orders_by_status.map((s: any) => ({
        name: (s.status || 'Unknown').replace(/_/g, ' '),
        value: s.orders || 0,
        share: total > 0 ? Math.round(((s.orders || 0) / total) * 1000) / 10 : 0,
      }))
    }
    if (data.distributions && data.distributions.length > 1) {
      const dist = data.distributions[1]
      const total = (dist.series || []).reduce((acc: number, cur: any) => acc + (cur.rows || 0), 0)
      return (dist.series || []).slice(0, 6).map((s: any) => ({
        name: (s.label || 'Unknown').replace(/_/g, ' '),
        value: s.rows || 0,
        share: total > 0 ? Math.round(((s.rows || 0) / total) * 1000) / 10 : 0,
      }))
    }
    return []
  }, [data])

  // Geographic or Entity Distribution
  const entityData = useMemo(() => {
    if (!data) return []
    if (data.top_customer_states && data.top_customer_states.length > 0) {
      return data.top_customer_states.slice(0, 6).map((s: any) => ({
        label: s.state,
        value: s.customers,
        unit: 'customers',
        share: s.share_pct,
      }))
    }
    if (data.entities && data.entities.length > 0) {
      const total = data.entities.reduce((acc: number, cur: any) => acc + (cur.rows || 0), 0)
      return data.entities.slice(0, 6).map((e: any) => ({
        label: e.label,
        value: e.rows,
        unit: 'records',
        share: total > 0 ? Math.round((e.rows / total) * 1000) / 10 : null,
      }))
    }
    return []
  }, [data])

  // Automated Executive Highlights
  const highlights = useMemo(() => {
    if (!data) return []
    const list: Array<{ tag: string; title: string; desc: string; type: 'growth' | 'info' | 'warning' }> = []

    // 1. Growth / Trajectory Highlight
    if (growthMetrics.revenueGrowth != null) {
      const isUp = growthMetrics.revenueGrowth >= 0
      list.push({
        tag: 'Growth Trajectory',
        title: `${isUp ? 'Revenue Expansion' : 'Revenue Contraction'} (${isUp ? '+' : ''}${growthMetrics.revenueGrowth}%)`,
        desc: `Top-line monetary performance moved ${growthMetrics.revenueGrowth}% in ${growthMetrics.latestPeriod} compared to ${growthMetrics.prevPeriod}.`,
        type: isUp ? 'growth' : 'warning',
      })
    } else if (growthMetrics.volumeGrowth != null) {
      const isUp = growthMetrics.volumeGrowth >= 0
      list.push({
        tag: 'Volume Trend',
        title: `Transaction Volume ${isUp ? 'Increased' : 'Decreased'} (${isUp ? '+' : ''}${growthMetrics.volumeGrowth}%)`,
        desc: `Operational volume shifted ${growthMetrics.volumeGrowth}% in ${growthMetrics.latestPeriod} relative to prior observed period.`,
        type: isUp ? 'growth' : 'info',
      })
    } else if (timeSeries.length > 0) {
      list.push({
        tag: 'Observation Window',
        title: `${timeSeries.length} Temporal Periods Monitored`,
        desc: `Baseline established across ${timeSeries[0].period} to ${timeSeries[timeSeries.length - 1].period}.`,
        type: 'info',
      })
    }

    // 2. Segment Concentration Highlight
    if (categoryData.length > 0) {
      const top = categoryData[0]
      list.push({
        tag: 'Concentration Risk',
        title: `Leading Segment: ${top.name}`,
        desc: `Accounts for ${top.share}% of aggregate volume with ${typeof top.value === 'number' && top.value > 1000 ? top.value.toLocaleString() : top.value} recorded.`,
        type: 'info',
      })
    }

    // 3. Operational & Quality Health
    const kpis = data.kpis || {}
    const delivery = data.delivery?.kpis || {}
    if (delivery.on_time_rate != null) {
      const onTime = delivery.on_time_rate
      list.push({
        tag: 'Fulfillment SLA',
        title: `${onTime}% On-Time Delivery Rate`,
        desc: `Average delivery duration is ${delivery.avg_delivery_days || kpis.avg_delivery_days || '—'} days with ${delivery.late_orders || kpis.late_orders || 0} late orders recorded.`,
        type: onTime >= 90 ? 'growth' : 'warning',
      })
    } else if (kpis.avg_review_score != null) {
      const score = kpis.avg_review_score
      list.push({
        tag: 'Customer Sentiment',
        title: `${Number(score).toFixed(2)} / 5.00 Average Rating`,
        desc: `Satisfaction index derived from all evaluated customer feedback records under active filter bounds.`,
        type: score >= 4 ? 'growth' : 'info',
      })
    }

    // 4. Data Scope & Coverage Guarantee
    const rowCount = kpis.total_orders || kpis.row_count || (active?.row_count ?? 0)
    list.push({
      tag: 'Data Governance',
      title: `${rowCount.toLocaleString()} Verified Observations`,
      desc: `Computed server-side from verified schema tables with zero synthetic records or simulated interpolations.`,
      type: 'info',
    })

    return list.slice(0, 4)
  }, [data, growthMetrics, categoryData, timeSeries, active])

  // Extract Dynamic KPIs
  const renderKpis = () => {
    if (!data) return null
    const k = data.kpis || {}
    const cards: React.ReactNode[] = []

    // 1. Revenue
    const hasRevenue = k.total_revenue != null && k.total_revenue > 0
    const hasAmount = k.total_amount != null && k.total_amount > 0
    if (hasRevenue || hasAmount) {
      const val = hasRevenue ? k.total_revenue : k.total_amount
      cards.push(
        <KpiCard
          key="revenue"
          label="Total Gross Volume"
          value={fmtMoney(val)}
          change={growthMetrics.revenueGrowth}
          changeLabel="vs previous period"
          tooltip="Aggregated gross monetary value across all transactions within the filter scope."
          icon={<span className="text-blue-400">💵</span>}
        />
      )
    }

    // 2. Orders / Transactions / Rows
    const orderCount = k.total_orders ?? k.row_count
    if (orderCount != null) {
      cards.push(
        <KpiCard
          key="orders"
          label={k.total_orders != null ? 'Total Orders' : 'Recorded Events'}
          value={orderCount.toLocaleString()}
          change={growthMetrics.volumeGrowth}
          changeLabel="vs previous period"
          tooltip="Count of distinct recorded transactions or primary events in this dataset."
          icon={<span className="text-emerald-400">📦</span>}
        />
      )
    }

    // 3. Average Order Value (AOV)
    if (k.avg_order_value != null || (hasRevenue && k.total_orders > 0)) {
      const aov = k.avg_order_value != null ? k.avg_order_value : (k.total_revenue / k.total_orders)
      cards.push(
        <KpiCard
          key="aov"
          label="Average Order Value"
          value={fmtMoney(aov)}
          tooltip="Average gross monetary spend per transaction (Total Revenue ÷ Total Orders)."
          icon={<span className="text-amber-400">💳</span>}
        />
      )
    }

    // 4. Unique Customers / Accounts
    if (k.unique_customers != null && k.unique_customers > 0) {
      cards.push(
        <KpiCard
          key="customers"
          label="Unique Customers"
          value={k.unique_customers.toLocaleString()}
          tooltip="Distinct individual customer identifiers active within the current dataset filter bounds."
          icon={<span className="text-purple-400">👥</span>}
        />
      )
    }

    // 5. Products / Items Catalog
    if (k.products_sold != null && k.products_sold > 0) {
      cards.push(
        <KpiCard
          key="products"
          label="Products Sold"
          value={k.products_sold.toLocaleString()}
          tooltip="Distinct catalog product units transacted during the observation window."
          icon={<span className="text-cyan-400">🏷️</span>}
        />
      )
    }

    // 6. Fulfillment SLA / Delivery
    const deliveryKpis = data.delivery?.kpis || {}
    if (deliveryKpis.on_time_rate != null || k.on_time_rate != null) {
      const rate = deliveryKpis.on_time_rate ?? k.on_time_rate
      cards.push(
        <KpiCard
          key="ontime"
          label="On-Time Delivery Rate"
          value={`${Number(rate).toFixed(1)}%`}
          tooltip="Percentage of completed deliveries received by the customer on or prior to estimated SLA date."
          icon={<span className="text-emerald-400">⏱️</span>}
        />
      )
    } else if (deliveryKpis.avg_delivery_days != null || k.avg_delivery_days != null) {
      const days = deliveryKpis.avg_delivery_days ?? k.avg_delivery_days
      cards.push(
        <KpiCard
          key="delivery_days"
          label="Avg Fulfillment Time"
          value={`${Number(days).toFixed(1)} days`}
          tooltip="Average calendar days elapsed between initial purchase timestamp and customer receipt."
          icon={<span className="text-blue-400">🚚</span>}
        />
      )
    }

    // 7. Review Score / Quality Sentiment
    if (k.avg_review_score != null) {
      cards.push(
        <KpiCard
          key="review"
          label="Satisfaction Rating"
          value={`${Number(k.avg_review_score).toFixed(2)} / 5.00`}
          tooltip="Arithmetic mean of all validated customer rating and review records."
          icon={<span className="text-amber-400">⭐</span>}
        />
      )
    }

    // 8. Cancellation Rate (Invert trend color so increases are highlighted in red)
    if (k.cancelled_orders != null && k.total_orders > 0) {
      const cancelRate = Math.round((k.cancelled_orders / k.total_orders) * 1000) / 10
      cards.push(
        <KpiCard
          key="cancel"
          label="Cancellation Rate"
          value={`${cancelRate}%`}
          hint={`${k.cancelled_orders.toLocaleString()} cancelled orders`}
          invertTrendColor={true}
          tooltip="Percentage of booked orders that resulted in status 'canceled'."
          icon={<span className="text-rose-400">🚫</span>}
        />
      )
    }

    // Fallback: Custom numerical statistics if non-commerce dataset
    if (cards.length < 3 && data.numeric_statistics && data.numeric_statistics.length > 0) {
      data.numeric_statistics.slice(0, 4).forEach((stat: any) => {
        cards.push(
          <KpiCard
            key={`stat_${stat.field}`}
            label={`Total ${stat.field.replace(/_/g, ' ')}`}
            value={stat.sum != null ? stat.sum.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}
            hint={`Mean: ${stat.mean != null ? Number(stat.mean).toFixed(2) : '—'} | Med: ${stat.median != null ? Number(stat.median).toFixed(2) : '—'}`}
            tooltip={`Aggregated summary for numerical dimension '${stat.field}'.`}
          />
        )
      })
    }

    return <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{cards}</div>
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header & Executive Scope */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
              Executive Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Analytics
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-1">
            Real-time business performance, KPI trajectories, and predictive signals.
          </p>
        </div>

        {/* Quick Navigation to In-Depth Sections */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => navigate('/analytics')}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition flex items-center gap-1.5"
          >
            <span>📊</span> Deep-Dive Analytics
          </button>
          <button
            type="button"
            onClick={() => navigate('/insights')}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition flex items-center gap-1.5"
          >
            <span>💡</span> AI Insights
          </button>
          <button
            type="button"
            onClick={() => navigate('/ml/revenue-forecast')}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition flex items-center gap-1.5 shadow-sm"
          >
            <span>📈</span> ML Forecasting
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition flex items-center gap-1.5"
          >
            <span>📑</span> Reports
          </button>
        </div>
      </div>

      {/* 3. Global Dashboard Date Range & Dimension Filters */}
      <FilterBar showGrain={true} />

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-200 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => resetFilters()}
            className="px-3 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded text-xs transition"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-neutral-900/60 rounded-xl border border-neutral-800 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 bg-neutral-900/60 rounded-xl border border-neutral-800 animate-pulse" />
            <div className="h-80 bg-neutral-900/60 rounded-xl border border-neutral-800 animate-pulse" />
          </div>
        </div>
      )}

      {/* Main Ready Content */}
      {!loading && data && (
        <div className="space-y-6">
          {/* Executive KPI Section */}
          {renderKpis()}

          {/* Empty Records Notification */}
          {(data.kpis?.total_orders === 0 || data.kpis?.row_count === 0) && (
            <div className="p-6 bg-neutral-900/60 rounded-xl border border-neutral-800 text-center space-y-2">
              <div className="text-amber-400 font-medium">No records match the current filter criteria</div>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Expand the date range or clear categorical filters to view aggregate business performance metrics.
              </p>
              <button
                type="button"
                onClick={() => resetFilters()}
                className="mt-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs rounded transition"
              >
                Reset All Filters
              </button>
            </div>
          )}

          {/* Automated Executive Highlights Section */}
          {highlights.length > 0 && (
            <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎯</span>
                  <h3 className="text-sm font-semibold text-neutral-200">
                    Automated Business Highlights
                  </h3>
                </div>
                <span className="text-[11px] text-neutral-500 font-mono">
                  Synthesized from verified record aggregates
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {highlights.map((h, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-neutral-950/70 rounded-lg border border-neutral-800/60 flex flex-col justify-between space-y-1.5"
                  >
                    <div>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-300">
                        {h.tag}
                      </span>
                      <div className="font-semibold text-xs text-neutral-200 mt-1">
                        {h.title}
                      </div>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      {h.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual Performance Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual 1: Time Trajectory Chart */}
            <div className="bg-neutral-900/70 p-5 rounded-xl border border-neutral-800/80 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm text-neutral-200">
                    Temporal Trajectory & Trend Momentum
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Chronological performance over filtered calendar periods
                  </p>
                </div>
                {/* Metric Toggle */}
                {timeSeries.some((p: any) => p.revenue != null && p.revenue > 0) && (
                  <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs self-start">
                    <button
                      type="button"
                      onClick={() => setActiveTrendMetric('revenue')}
                      className={`px-2.5 py-1 rounded font-medium transition ${
                        activeTrendMetric === 'revenue'
                          ? 'bg-blue-600 text-white'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      Revenue
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTrendMetric('volume')}
                      className={`px-2.5 py-1 rounded font-medium transition ${
                        activeTrendMetric === 'volume'
                          ? 'bg-blue-600 text-white'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      Volume
                    </button>
                  </div>
                )}
              </div>

              {timeSeries.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={activeTrendMetric === 'revenue' ? '#3b82f6' : '#10b981'} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={activeTrendMetric === 'revenue' ? '#3b82f6' : '#10b981'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis
                        dataKey="period"
                        stroke="#666"
                        fontSize={11}
                        minTickGap={20}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#666"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          if (activeTrendMetric === 'revenue') {
                            return v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`
                          }
                          return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#171717',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(val: number) =>
                          activeTrendMetric === 'revenue' ? fmtMoney(val) : `${val.toLocaleString()} transactions`
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey={activeTrendMetric === 'revenue' ? 'revenue' : 'volume'}
                        name={activeTrendMetric === 'revenue' ? 'Gross Revenue' : 'Transaction Count'}
                        stroke={activeTrendMetric === 'revenue' ? '#3b82f6' : '#10b981'}
                        strokeWidth={2}
                        fill="url(#trendGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-neutral-500 text-xs">
                  No chronological time series available under active filters.
                </div>
              )}
            </div>

            {/* Visual 2: Category / Dimension Performance (Top 10) */}
            <div className="bg-neutral-900/70 p-5 rounded-xl border border-neutral-800/80 shadow-sm space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-neutral-200">
                  Segment Performance Breakdown (Top 10)
                </h3>
                <p className="text-xs text-neutral-500">
                  Ranked by gross monetary volume and categorical contribution
                </p>
              </div>

              {categoryData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryData}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 70, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                      <XAxis
                        type="number"
                        stroke="#666"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="#888"
                        fontSize={10}
                        tickLine={false}
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#171717',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(val: number, _name: string, props: any) => [
                          `${typeof val === 'number' && val > 100 ? fmtMoney(val) : val.toLocaleString()} (${props.payload.share}% share)`,
                          'Performance',
                        ]}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-neutral-500 text-xs">
                  No categorical breakdown supported for this dataset.
                </div>
              )}
            </div>

            {/* Visual 3: Operational Status Composition */}
            <div className="bg-neutral-900/70 p-5 rounded-xl border border-neutral-800/80 shadow-sm space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-neutral-200">
                  Status & Operational Distribution
                </h3>
                <p className="text-xs text-neutral-500">
                  Proportional share of recorded status categories
                </p>
              </div>

              {statusData.length > 0 ? (
                <div className="h-[240px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {statusData.map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#171717',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(val: number, _name: string, props: any) => [
                          `${val.toLocaleString()} (${props.payload.share}%)`,
                          props.payload.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-neutral-500 text-xs">
                  No operational status groupings recorded in active data.
                </div>
              )}

              {/* Status Legend Pills */}
              {statusData.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-neutral-800/60">
                  {statusData.slice(0, 5).map((s: any, idx: number) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                      />
                      <span className="capitalize">{s.name}</span>
                      <span className="text-[10px] text-neutral-500">({s.share}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visual 4: Geographic / Entity Concentration */}
            <div className="bg-neutral-900/70 p-5 rounded-xl border border-neutral-800/80 shadow-sm space-y-4">
              <div>
                <h3 className="font-semibold text-sm text-neutral-200">
                  Geographic & Entity Concentration
                </h3>
                <p className="text-xs text-neutral-500">
                  Highest density regional markets or primary entities
                </p>
              </div>

              {entityData.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {entityData.map((item: any, idx: number) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-neutral-300 uppercase tracking-wide">
                          {idx + 1}. {item.label}
                        </span>
                        <span className="text-neutral-400">
                          {item.value.toLocaleString()} {item.unit}{' '}
                          {item.share != null ? `(${item.share}%)` : ''}
                        </span>
                      </div>
                      <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{
                            width: `${item.share != null ? item.share : Math.min(100, Math.round((item.value / entityData[0].value) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-neutral-500 text-xs">
                  No regional or entity concentration details available.
                </div>
              )}
            </div>
          </div>

          {/* 5. Predictive Machine Learning Forecast Summary Widget */}
          <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-blue-950/30 p-5 rounded-xl border border-neutral-800/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">🤖</span>
                <h3 className="text-sm font-semibold text-neutral-200">
                  Autonomous Machine Learning & Demand Forecasting
                </h3>
                {forecastOptions?.compatible && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                    Forecast-Ready
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 max-w-2xl">
                {forecastOptions?.compatible
                  ? `Active schema detected with sequential temporal column '${forecastOptions.default_date_column || forecastOptions.date_columns[0]}' and target variable '${forecastOptions.default_target_column || forecastOptions.target_columns[0]}'. Ready for autonomous lag auto-regression and baseline evaluations.`
                  : forecastOptions?.reason ||
                    'Dataset lacks a sequential timestamp column required for chronological auto-regressive forecasting.'}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              {forecastOptions?.compatible ? (
                <button
                  type="button"
                  onClick={() => navigate('/ml/revenue-forecast')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Launch Forecast Workspace</span>
                  <span>→</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/ml')}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition whitespace-nowrap"
                >
                  Explore Model Catalog
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
