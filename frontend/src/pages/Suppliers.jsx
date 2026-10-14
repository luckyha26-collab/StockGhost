import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { ConfirmDialog } from '../components/common.jsx'
import { Async, Card, DataTable, Field, Modal, PageHeader, Stat, fmtDate, inr, num, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function Suppliers() {
  const { can } = useAuth()
  const toast = useToast()
  const st = useApi('/suppliers')
  const [form, setForm] = useState(null)
  const [del, setDel] = useState(null)
  const [detail, setDetail] = useState(null)
  const w = can('suppliers.write')
  const save = async (e) => {
    e.preventDefault()
    try { if (form.id) await api.put(`/suppliers/${form.id}`, form); else await api.post('/suppliers', form); toast('Supplier saved.'); setForm(null); st.reload() } catch (x) { toast(errMsg(x), 'error') }
  }
  const open = async (s) => { try { setDetail((await api.get(`/suppliers/${s.id}`)).data) } catch (x) { toast(errMsg(x), 'error') } }
  const cols = [
    { key: 'name', label: 'Supplier', render: (s) => <span className="font-medium text-slate-100">{s.name}</span> },
    { key: 'contact', label: 'Contact', render: (s) => <div><p>{s.contact || '-'}</p><p className="text-xs text-muted">{s.email || s.phone}</p></div> },
    { key: 'products', label: 'Products', align: 'right' },
    { key: 'purchases', label: 'Purchases', align: 'right', render: (s) => num(s.purchases) },
    { key: 'purchase_value', label: 'Purchase value', align: 'right', render: (s) => inr(s.purchase_value) },
    { key: 'blocked_capital', label: 'Blocked capital', align: 'right', render: (s) => <span className={s.blocked_capital ? 'text-rose-300' : ''}>{inr(s.blocked_capital)}</span> },
    { key: 'avg_lead_time', label: 'Avg lead time', align: 'right', render: (s) => s.avg_lead_time == null ? <span className="text-muted" title="Needs received dates">n/a</span> : s.avg_lead_time + ' d' },
    { key: 'reliability', label: 'Reliability', align: 'right', render: (s) => s.reliability == null ? <span className="text-muted" title="Needs at least 3 deliveries with received dates">n/a</span> : s.reliability + '%' },
    ...(w ? [{ key: 'a', label: '', sortable: false, render: (s) => <div className="flex gap-1" onClick={(e) => e.stopPropagation()}><button className="btn-ghost !px-2 !py-1" aria-label="Edit" onClick={() => setForm({ ...s })}><Pencil size={14} /></button><button className="btn-danger !px-2 !py-1" aria-label="Delete" onClick={() => setDel(s)}><Trash2 size={14} /></button></div> }] : []),
  ]
  const d = detail?.supplier
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Who you buy from, how much, and how much of it is stuck. Reliability uses received dates when your purchase data includes them."
        actions={w && <button className="btn-primary" onClick={() => setForm({ name: '', contact: '', email: '', phone: '', lead_time_days: '' })}><Plus size={16} />Add supplier</button>} />
      <Async state={st}>{(rows) => <Card pad={false}><DataTable columns={cols} rows={rows} searchKeys={['name', 'contact', 'email']} onRowClick={open} empty="No suppliers yet. Add one or import supplier / purchase data." /></Card>}</Async>
      <Modal open={!!form} title={form?.id ? 'Edit supplier' : 'Add supplier'} onClose={() => setForm(null)}>
        {form && <form onSubmit={save} className="space-y-4"><Field label="Name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Contact person"><input className="input" value={form.contact || ''} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Phone"><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field></div>
          <Field label="Quoted lead time (days)"><input className="input" type="number" min="0" value={form.lead_time_days ?? ''} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary">Save</button></div></form>}
      </Modal>
      <Modal open={!!detail} title={d?.name} onClose={() => setDetail(null)} wide>
        {detail && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Purchase value" value={inr(d.purchase_value)} /><Stat label="Purchases / month" value={d.purchases_per_month} /><Stat label="Top-product dependency" value={d.top_product_dependency_pct == null ? 'n/a' : d.top_product_dependency_pct + '%'} sub="share of spend on one product" /><Stat label="Reliability" value={d.reliability == null ? 'n/a' : d.reliability + '%'} sub={d.avg_lead_time == null ? 'no received dates' : `avg lead ${d.avg_lead_time} days`} /></div>
          <div><p className="label">Products supplied ({detail.products.length})</p><div className="max-h-48 overflow-auto rounded-lg border border-line"><table className="w-full text-sm"><tbody className="divide-y divide-line/60">{detail.products.map((p) => <tr key={p.id}><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 text-muted">{p.sku}</td><td className="px-3 py-2 text-right">{num(p.quantity)} in stock</td></tr>)}</tbody></table></div></div>
          <div><p className="label">Recent purchases</p><div className="max-h-48 overflow-auto rounded-lg border border-line"><table className="w-full text-sm"><tbody className="divide-y divide-line/60">{detail.purchases.map((p) => <tr key={p.id}><td className="px-3 py-2">{fmtDate(p.purchase_date)}</td><td className="px-3 py-2">{p.product_name}</td><td className="px-3 py-2 text-right">{num(p.quantity)}</td><td className="px-3 py-2 text-right">{inr(p.total_cost)}</td></tr>)}</tbody></table></div></div>
        </div>}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete supplier?" confirmLabel="Delete" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.delete(`/suppliers/${del.id}`); toast('Supplier deleted.'); setDel(null); st.reload() } catch (x) { toast(errMsg(x), 'error'); setDel(null) } }}
        message={<>Delete <b>{del?.name}</b>? Linked products and purchases are kept but lose their supplier link.</>} />
    </>
  )
}
