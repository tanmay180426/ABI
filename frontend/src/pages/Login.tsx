import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login } from '@/services/auth'

export default function Login() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
      const from = (location.state as { from?: string } | null)?.from || '/dashboard'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-xs text-neutral-500 mt-1">Sem5 BI Platform</p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-neutral-800 rounded px-3 py-2"
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-neutral-800 rounded px-3 py-2"
            autoComplete="current-password"
          />
        </label>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-2 text-sm font-medium"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-neutral-500">
          Two roles: <span className="text-neutral-300">admin</span> (business intelligence +
          platform administration) and{' '}
          <span className="text-neutral-300">analyst</span> (business intelligence).
        </p>
      </form>
    </div>
  )
}
