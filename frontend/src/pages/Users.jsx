import { useState } from 'react'
import { Copy, Plus, Trash2, UserPlus } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { ConfirmDialog, fmtDateTime } from '../components/common.jsx'
import { Async, Badge, Card, DataTable, Field, Modal, PageHeader, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { PasswordRules } from './Register.jsx'

const ROLE_DESC = { OWNER: 'Everything, including deleting workspace data', ADMIN: 'Users, data, settings, reports and analytics', INVENTORY_MANAGER: 'Products, inventory, suppliers, purchases, imports', SALES_MANAGER: 'Sales and sales imports', ANALYST: 'Analytics, forecasting, reports (read-only data)', VIEWER: 'Read-only dashboards and reports' }
const RC = { OWNER: '#f43f5e', ADMIN: '#fb923c', INVENTORY_MANAGER: '#34d3c1', SALES_MANAGER: '#60a5fa', ANALYST: '#8b7cf6', VIEWER: '#8592ad' }

export default function Users() {
  const { user: me } = useAuth()
  const toast = useToast()
  const st = useApi('/users')
  const [form, setForm] = useState(null)
  const [del, setDel] = useState(null)
  const [inv, setInv] = useState('')
  const roles = st.data?.roles || []
  const save = async (e) => {
    e.preventDefault()
    try { if (form.id) await api.put(`/users/${form.id}`, { name: form.name, role: form.role, is_active: form.is_active, ...(form.password ? { password: form.password } : {}) }); else await api.post('/users', form); toast('User saved.'); setForm(null); st.reload() }
    catch (x) { toast(errMsg(x), 'error') }
  }
  const invite = async () => { try { const r = await api.post('/invites', { role: inv }); const link = `${location.origin}/register?invite=${r.data.code}`; await navigator.clipboard?.writeText(link).catch(() => {}); toast('Invite link created and copied.'); st.reload() } catch (x) { toast(errMsg(x), 'error') } }
  const cols = [
    { key: 'name', label: 'Name', render: (u) => <div><p className="font-medium text-slate-100">{u.name}{u.id === me.id && <span className="ml-2 text-xs text-muted">(you)</span>}</p><p className="text-xs text-muted">{u.email}</p></div> },
    { key: 'role', label: 'Role', render: (u) => <Badge color={RC[u.role]}>{u.role.replace('_', ' ')}</Badge> },
    { key: 'is_active', label: 'Status', render: (u) => <Badge color={u.is_active ? '#34d399' : '#8592ad'}>{u.is_active ? 'Active' : 'Disabled'}</Badge> },
    { key: 'last_login_at', label: 'Last sign-in', render: (u) => fmtDateTime(u.last_login_at) },
    { key: 'a', label: '', sortable: false, render: (u) => <div className="flex gap-1"><button className="btn-ghost !py-1 text-xs" onClick={() => setForm({ ...u, password: '' })}>Edit</button>{u.id !== me.id && <button className="btn-danger !px-2 !py-1" aria-label="Delete user" onClick={() => setDel(u)}><Trash2 size={14} /></button>}</div> },
  ]
  return (
    <>
      <PageHeader title="Users & roles" subtitle="Everyone here sees only this workspace's data. Permissions are enforced on the server."
        actions={<button className="btn-primary" onClick={() => setForm({ name: '', email: '', password: '', role: roles.includes('VIEWER') ? 'VIEWER' : roles[0] })}><Plus size={16} />Add user</button>} />
      <Async state={st}>{(d) => (<>
        <Card pad={false}><DataTable columns={cols} rows={d.users} searchKeys={['name', 'email', 'role']} /></Card>
        <Card title="Invite a teammate" subtitle="They register themselves with the link and join this workspace with the role you choose. Links expire after 7 days." className="mt-5">
          <div className="flex flex-wrap items-end gap-3"><Field label="Role"><select className="input" value={inv} onChange={(e) => setInv(e.target.value)}><option value="">Choose role</option>{d.roles.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <button className="btn-primary" disabled={!inv} onClick={invite}><UserPlus size={16} />Create invite link</button></div>
          {d.invites.length > 0 && <ul className="mt-4 space-y-2 text-sm">{d.invites.map((i) => <li key={i.id} className="flex items-center gap-3 rounded-lg bg-ink/60 px-3 py-2"><Badge color={RC[i.role]}>{i.role}</Badge><code className="min-w-0 flex-1 truncate text-xs text-muted">{`${location.origin}/register?invite=${i.code}`}</code>
            <button className="btn-ghost !px-2 !py-1" aria-label="Copy link" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/register?invite=${i.code}`); toast('Copied.') }}><Copy size={13} /></button>
            <button className="btn-danger !px-2 !py-1" aria-label="Revoke" onClick={async () => { await api.delete(`/invites/${i.id}`); st.reload() }}><Trash2 size={13} /></button></li>)}</ul>}</Card>
        <Card title="What each role can do" className="mt-5"><ul className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(ROLE_DESC).map(([r, t]) => <li key={r} className="flex gap-2"><Badge color={RC[r]}>{r.replace('_', ' ')}</Badge><span className="text-muted">{t}</span></li>)}</ul></Card></>)}</Async>
      <Modal open={!!form} title={form?.id ? 'Edit user' : 'Add user'} onClose={() => setForm(null)}>
        {form && <form onSubmit={save} className="space-y-4">
          <Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {!form.id && <Field label="Email"><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
          <Field label="Role"><select className="input" value={form.role} disabled={form.id === me.id} onChange={(e) => setForm({ ...form, role: e.target.value })}>{[...new Set([...roles, form.role])].map((r) => <option key={r} value={r} disabled={!roles.includes(r)}>{r.replace('_', ' ')}</option>)}</select></Field>
          <Field label={form.id ? 'New password (leave blank to keep)' : 'Temporary password'}><input className="input" type="password" required={!form.id} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />{(!form.id || form.password) && <PasswordRules value={form.password} />}</Field>
          {form.id && form.id !== me.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-teal-400" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Account active</label>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary">Save</button></div></form>}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete user?" confirmLabel="Delete user" onClose={() => setDel(null)} message={<>Delete <b>{del?.name}</b> ({del?.email})? They lose access immediately.</>}
        onConfirm={async () => { try { await api.delete(`/users/${del.id}`); toast('User deleted.'); setDel(null); st.reload() } catch (x) { toast(errMsg(x), 'error'); setDel(null) } }} />
    </>
  )
}
