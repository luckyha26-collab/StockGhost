import { useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errMsg } from '../api/client.js'
import { Field } from '../components/ui.jsx'
import AuthShell from './AuthShell.jsx'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { setRes((await api.post('/auth/forgot-password', { email })).data) } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link className="text-brand hover:underline" to="/login">Back to sign in</Link>}>
      {res ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">{res.message}</p>
          {res.dev_reset_link && <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">Development mode (no SMTP configured): <a className="break-all underline" href={res.dev_reset_link}>open reset link</a></p>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {err && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</div>}
          <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
        </form>)}
    </AuthShell>
  )
}
