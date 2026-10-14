import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api, { errMsg } from '../api/client.js'
import { Field, useToast } from '../components/ui.jsx'
import AuthShell from './AuthShell.jsx'
import { PasswordRules } from './Register.jsx'

export default function ResetPassword() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState({ password: '', confirm_password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await api.post('/auth/reset-password', { ...f, token: sp.get('token') }); toast('Password updated. Please sign in.'); nav('/login') } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  if (!sp.get('token')) return <AuthShell title="Link missing" footer={<Link className="text-brand hover:underline" to="/forgot-password">Request a new link</Link>}><p className="text-sm text-muted">This reset link is incomplete.</p></AuthShell>
  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        {err && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</div>}
        <Field label="New password"><input className="input" type="password" required autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><PasswordRules value={f.password} /></Field>
        <Field label="Confirm password"><input className="input" type="password" required autoComplete="new-password" value={f.confirm_password} onChange={(e) => setF({ ...f, confirm_password: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Update password'}</button>
      </form>
    </AuthShell>
  )
}
