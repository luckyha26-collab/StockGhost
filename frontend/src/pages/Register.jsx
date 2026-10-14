import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Circle } from 'lucide-react'
import { errMsg } from '../api/client.js'
import { Field } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import AuthShell from './AuthShell.jsx'

export const BUSINESS_TYPES = ['Retail', 'E-commerce', 'Wholesale', 'Manufacturing', 'Electronics', 'Fashion', 'Grocery', 'Furniture', 'Other']
export const pwRules = (p) => [['At least 8 characters', p.length >= 8], ['An uppercase letter', /[A-Z]/.test(p)], ['A lowercase letter', /[a-z]/.test(p)], ['A number', /\d/.test(p)]]

export function PasswordRules({ value }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {pwRules(value).map(([t, ok]) => <li key={t} className={`flex items-center gap-1.5 ${ok ? 'text-emerald-300' : 'text-muted'}`}>{ok ? <Check size={12} /> : <Circle size={10} />}{t}</li>)}
    </ul>
  )
}

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [f, setF] = useState({ full_name: '', company_name: '', business_type: 'Retail', email: '', password: '', confirm_password: '', invite_code: sp.get('invite') || '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [joining, setJoining] = useState(!!sp.get('invite'))
  const invited = joining
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const valid = useMemo(() => pwRules(f.password).every(([, ok]) => ok) && f.password === f.confirm_password, [f.password, f.confirm_password])
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { const p = await register({ ...f, invite_code: joining ? f.invite_code : '' }); nav(p.user.role === 'OWNER' ? '/onboarding' : '/dashboard', { replace: true }) } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }
  return (
    <AuthShell title="Create your workspace" subtitle="Start analysing your own inventory in minutes."
      footer={<>Already have an account? <Link className="text-brand hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {err && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</div>}
        <Field label="Full name"><input className="input" required autoComplete="name" value={f.full_name} onChange={set('full_name')} /></Field>
        {!invited && <>
          <Field label="Company name"><input className="input" required value={f.company_name} onChange={set('company_name')} /></Field>
          <Field label="Business type"><select className="input" value={f.business_type} onChange={set('business_type')}>{BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}</select></Field></>}
        <Field label="Work email"><input className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Password"><input className="input" type="password" required autoComplete="new-password" value={f.password} onChange={set('password')} /><PasswordRules value={f.password} /></Field>
        <Field label="Confirm password"><input className="input" type="password" required autoComplete="new-password" value={f.confirm_password} onChange={set('confirm_password')} />
          {f.confirm_password && f.password !== f.confirm_password && <span className="mt-1 block text-xs text-rose-300">Passwords do not match.</span>}</Field>
        {invited
          ? <Field label="Invite code" hint="You are joining an existing workspace."><input className="input" value={f.invite_code} onChange={set('invite_code')} /></Field>
          : <button type="button" className="text-xs text-brand hover:underline" onClick={() => setJoining(true)}>I have an invite code to join a workspace</button>}
        <button className="btn-primary w-full" disabled={busy || !valid}>{busy ? 'Creating...' : 'Create account'}</button>
      </form>
    </AuthShell>
  )
}
