import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { ConfirmDialog, EmptyData, ProductPicker, ServerTable } from '../components/common.jsx'
import { Card, Field, Modal, PageHeader, Stat, fmtDate, inr, inrShort, num, today, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

/** Shared list + create page for sales and purchases. */
export default function TxPage({ kind }) {
  const sales = kind === 'sales'
  const { can, ws, loadWorkspace } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({})
  const [key, setKey] = useState(0)
  const [form, setForm] = useState(null)
  const [del, setDel] = useState(null)
  const [totals, setTotals] = useState(null)
  const [busy, setBusy] = useState(false)
  const regions = useApi('/analytics/dashboard', { range: '12m' }, sales)
  const sup = useApi('/suppliers', null, !sales)
  const w = can(sales ? 'sales.write' : 'purchases.write')
  const dateKey = sales ? 'sale_date' : 'purchase_date'
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      await api.post(`/${kind}`, { product_id: form.product?.id, quantity: form.quantity, [sales ? 'unit_price' : 'unit_cost']: form.price, [dateKey]: form.date, ...(sales ? { customer: form.customer, region: form.region } : { supplier_id: form.supplier_id || null, reference: form.reference }) })
      toast(sales ? 'Sale recorded.' : 'Purchase recorded.'); setForm(null); setKey((k) => k + 1); loadWorkspace()
    } catch (x) { toast(errMsg(x), 'error') } finally { setBusy(false) }
  }
  const remove = async () => { try { await api.delete(`/${kind}/${del.id}`); toast('Deleted.'); setDel(null); setKey((k) => k + 1); loadWorkspace() } catch (x) { toast(errMsg(x), 'error'); setDel(null) } }
  const cols = [
    { key: 'd', label: 'Date', sort: sales ? 'date' : undefined, render: (r) => fmtDate(r[dateKey]) },
    { key: 'p', label: 'Product', render: (r) => <div><p className="font-medium text-slate-100">{r.product_name}</p><p className="text-xs text-muted">{r.sku}</p></div> },
    { key: 'quantity', label: 'Qty', align: 'right', render: (r) => num(r.quantity) },
    { key: 'u', label: sales ? 'Unit price' : 'Unit cost', align: 'right', render: (r) => inr(sales ? r.unit_price : r.unit_cost) },
    { key: 't', label: sales ? 'Revenue' : 'Total cost', align: 'right', render: (r) => inr(sales ? r.revenue : r.total_cost) },
    sales ? { key: 'customer', label: 'Customer', render: (r) => r.customer || '-' } : { key: 'supplier_name', label: 'Supplier', render: (r) => r.supplier_name || '-' },
    sales ? { key: 'region', label: 'Region', render: (r) => r.region || '-' } : { key: 'reference', label: 'Reference', render: (r) => r.reference || '-' },
    ...(w ? [{ key: 'a', label: '', render: (r) => <button className="btn-danger !px-2 !py-1" aria-label="Delete" onClick={() => setDel(r)}><Trash2 size={14} /></button> }] : []),
  ]
  const label = sales ? 'sales' : 'purchases'
  return (
    <>
      <PageHeader title={sales ? 'Sales' : 'Purchases'} subtitle={sales ? 'Every sale in this workspace - imported history and manually recorded sales.' : 'Goods purchased from suppliers, imported or recorded manually.'}
        actions={w && <button className="btn-primary" onClick={() => setForm({ product: null, quantity: '', price: '', date: today(), customer: '', region: '', supplier_id: '', reference: '' })}><Plus size={16} />{sales ? 'Record sale' : 'Record purchase'}</button>} />
      {ws && !ws.has_data ? <EmptyData title={`No ${label} data available.`} canUpload={can('data.import')} /> : (<>
        {totals && <div className="mb-5 grid gap-4 sm:grid-cols-3"><Stat label="Records (filtered)" value={num(totals.records)} /><Stat label="Units" value={num(totals.units)} /><Stat label={sales ? 'Revenue' : 'Total cost'} value={inrShort(totals.revenue ?? totals.cost)} /></div>}
        <Card pad={false}>
          <ServerTable url={`/${kind}`} params={f} columns={cols} reloadKey={key} onData={(d) => setTotals(d.totals)} searchPlaceholder={sales ? 'Search product or customer' : 'Search product'} empty={`No ${label} match these filters.`}
            toolbar={<>
              <input type="date" className="input !w-auto !py-1.5" aria-label="From date" value={f.start || ''} onChange={(e) => setF({ ...f, start: e.target.value || undefined })} />
              <input type="date" className="input !w-auto !py-1.5" aria-label="To date" value={f.end || ''} onChange={(e) => setF({ ...f, end: e.target.value || undefined })} />
              {sales && regions.data?.filters?.regions?.length > 0 && <select className="input !w-auto !py-1.5" aria-label="Region" value={f.region || ''} onChange={(e) => setF({ ...f, region: e.target.value || undefined })}><option value="">Region: all</option>{regions.data.filters.regions.map((r) => <option key={r}>{r}</option>)}</select>}
              {!sales && sup.data?.length > 0 && <select className="input !w-auto !py-1.5" aria-label="Supplier" value={f.supplier_id || ''} onChange={(e) => setF({ ...f, supplier_id: e.target.value || undefined })}><option value="">Supplier: all</option>{sup.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
            </>} />
        </Card></>)}
      <Modal open={!!form} title={sales ? 'Record a sale' : 'Record a purchase'} onClose={() => setForm(null)}>
        {form && <form onSubmit={save} className="space-y-4">
          <Field label="Product"><ProductPicker value={form.product} onChange={(p) => setForm({ ...form, product: p, price: p ? (sales ? p.selling_price : p.cost_price) : '' })} /></Field>
          <div className="grid grid-cols-2 gap-4"><Field label="Quantity"><input className="input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label={sales ? 'Unit price (₹)' : 'Unit cost (₹)'}><input className="input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field></div>
          <Field label="Date"><input className="input" type="date" max={today()} required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          {sales ? <div className="grid grid-cols-2 gap-4"><Field label="Customer (optional)"><input className="input" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></Field><Field label="Region (optional)"><input className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></Field></div>
            : <div className="grid grid-cols-2 gap-4"><Field label="Supplier"><select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">Product's default</option>{sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><Field label="Reference (optional)"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field></div>}
          <p className="text-xs text-muted">{sales ? 'Recording a sale reduces stock on hand.' : 'Recording a purchase increases stock on hand.'}</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={busy || !form.product}>{busy ? 'Saving...' : 'Save'}</button></div></form>}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete record?" confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={remove}
        message={del?.imported ? 'This record came from an import. Deleting it removes it from analytics but does not change current stock.' : `Deleting this record ${sales ? 'puts the sold units back into' : 'removes the purchased units from'} stock.`} />
    </>
  )
}
