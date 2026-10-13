import React, { useState } from 'react'

export interface KpiCardProps {
  label: string
  value: string | number
  hint?: string
  change?: number | null
  changeLabel?: string
  icon?: React.ReactNode
  badge?: string
  tooltip?: string
  invertTrendColor?: boolean
}

export function KpiCard({
  label,
  value,
  hint,
  change,
  changeLabel = 'vs prev. period',
  icon,
  badge,
  tooltip,
  invertTrendColor = false,
}: KpiCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  // Trend formatting
  const hasChange = change != null && !Number.isNaN(change) && Number.isFinite(change)
  const isPositive = hasChange && change! > 0
  const isZero = hasChange && change! === 0

  let trendColor = 'text-neutral-400 bg-neutral-800/60 border-neutral-700/50'
  if (hasChange && !isZero) {
    if ((isPositive && !invertTrendColor) || (!isPositive && invertTrendColor)) {
      trendColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
    } else {
      trendColor = 'text-rose-400 bg-rose-950/60 border-rose-800/60'
    }
  }

  return (
    <div className="relative bg-neutral-900/70 hover:bg-neutral-900/90 transition-all duration-200 p-4 rounded-xl border border-neutral-800/80 shadow-sm flex flex-col justify-between group">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-400 truncate">
              {label}
            </span>
            {tooltip && (
              <div className="relative inline-block">
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip((prev) => !prev)}
                  className="text-neutral-500 hover:text-neutral-300 text-[11px] w-4 h-4 rounded-full flex items-center justify-center border border-neutral-700/60"
                  aria-label={`Info about ${label}`}
                >
                  ℹ
                </button>
                {showTooltip && (
                  <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-neutral-950 text-neutral-300 text-[11px] rounded-lg border border-neutral-700 shadow-xl pointer-events-none">
                    {tooltip}
                  </div>
                )}
              </div>
            )}
          </div>
          {icon && <div className="text-neutral-400 group-hover:text-blue-400 transition-colors text-sm">{icon}</div>}
          {badge && !icon && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-800/60 text-blue-300 font-mono">
              {badge}
            </span>
          )}
        </div>

        <div className="text-2xl font-bold tracking-tight text-neutral-100 mt-2">
          {value}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        {hasChange ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold border ${trendColor}`}
            >
              <span>{isPositive ? '↑' : isZero ? '→' : '↓'}</span>
              <span>{Math.abs(change!)}%</span>
            </span>
            <span className="text-[11px] text-neutral-500 truncate">{changeLabel}</span>
          </div>
        ) : hint ? (
          <span className="text-[11px] text-neutral-500 truncate">{hint}</span>
        ) : (
          <span className="text-[11px] text-neutral-600">Metric verified</span>
        )}
      </div>
    </div>
  )
}

