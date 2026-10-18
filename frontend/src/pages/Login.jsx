import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errMsg } from '../api/client.js'
import { Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import AuthShell from './AuthShell.jsx'

export default function Login() {
  const { login, demoLogin } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const done = (p) => nav(!p.workspace.onboarding_completed && ['OWNER', 'ADMIN'].includes(p.user.role) ? '/onboarding' : loc.state?.from || '/dashboard', { replace: true })
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { done(await login(f.email, f.password)) } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  const demo = async () => { setBusy(true); setErr(''); try { await demoLogin(); nav('/dashboard') } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) } }
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your StockGhost workspace."
      footer={<>New to StockGhost? <Link className="text-brand hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {err && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</div>}
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <div className="text-right"><Link className="text-xs text-brand hover:underline" to="/forgot-password">Forgot password?</Link></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      <button className="btn-ghost w-full" onClick={demo} disabled={busy}>Explore the read-only demo workspace</button>
    </AuthShell>
  )
}
