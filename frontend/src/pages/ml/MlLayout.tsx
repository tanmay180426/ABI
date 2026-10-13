import { Outlet, NavLink, useLocation } from 'react-router-dom'

const nav = [
  { name: 'Prediction & Forecasting', path: '/ml/revenue-forecast' },
  { name: 'Product Segmentation', path: '/ml/product-segmentation' },
  { name: 'Model Registry & Catalog', path: '/ml/metrics' },
]

export default function MlLayout() {
  const location = useLocation()
  return (
    <div className="space-y-6">
      <div className="flex space-x-6 border-b border-neutral-800 text-sm">
        {nav.map((n) => (
          <NavLink
            key={n.name}
            to={n.path + location.search}
            className={({ isActive }) =>
              `pb-3 border-b-2 font-medium transition-colors ${
                isActive
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
              }`
            }
          >
            {n.name}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
