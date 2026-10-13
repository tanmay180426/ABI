import { NavLink, Outlet, useLocation } from 'react-router-dom'
import FilterBar from '@/components/FilterBar'

const TABS = [
  { to: '/analytics/sales', label: 'Sales' },
  { to: '/analytics/orders', label: 'Orders' },
  { to: '/analytics/customers', label: 'Customers' },
  { to: '/analytics/products', label: 'Products' },
  { to: '/analytics/sellers', label: 'Sellers' },
  { to: '/analytics/delivery', label: 'Delivery' },
]

export default function AnalyticsLayout() {
  const location = useLocation()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-neutral-500">
          In-depth analysis of the active dataset and multi-file collections.
        </p>
      </div>

      <div className="flex items-center gap-4 border-b border-neutral-800 pb-2">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to + location.search}
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${
                isActive ? 'text-blue-400' : 'text-neutral-400 hover:text-neutral-200'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <FilterBar showGrain={true} />

      <div className="pt-2">
        <Outlet />
      </div>
    </div>
  )
}
