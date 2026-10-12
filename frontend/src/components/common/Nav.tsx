import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getStoredUser, isAdmin, logout } from '@/services/auth'

const BI_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/multi-dataset-analysis', label: 'Multi-Dataset' },
  { to: '/ml', label: 'Machine Learning' },
  { to: '/insights', label: 'AI Insights' },
  { to: '/reports', label: 'Reports' },
]

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/health', label: 'System Health' },
  { to: '/admin/data', label: 'Data / ETL' },
  { to: '/admin/warehouse', label: 'Warehouse' },
  { to: '/admin/ml', label: 'ML Admin' },
  { to: '/admin/settings', label: 'Settings' },
]

export default function Nav() {
  const user = getStoredUser()
  const navigate = useNavigate()
  const location = useLocation()

  const signOut = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <div className="flex items-center gap-4">
        <span className="text-[11px] uppercase tracking-wide text-neutral-600">BI</span>
        {BI_LINKS.map((l) => (
          <Link key={l.to} to={l.to + location.search}>
            {l.label}
          </Link>
        ))}
      </div>

      {isAdmin() && (
        <div className="flex items-center gap-4 pl-4 border-l border-neutral-800">
          <span className="text-[11px] uppercase tracking-wide text-neutral-600">Admin</span>
          {ADMIN_LINKS.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </div>
      )}

      {user ? (
        <span className="flex items-center gap-2 text-neutral-400">
          <span className="text-neutral-200">{user.username}</span>
          <span className="text-xs uppercase text-neutral-500">{user.role}</span>
          <button onClick={signOut} className="text-red-400 hover:text-red-300">
            Sign out
          </button>
        </span>
      ) : (
        <Link to="/login" className="text-blue-400">
          Sign in
        </Link>
      )}
    </nav>
  )
}
