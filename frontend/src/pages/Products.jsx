import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { ConfirmDialog, ServerTable } from '../components/common.jsx'
import { Card, Field, Modal, PageHeader, Badge, RiskBadge, inr, num, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const blank = { name: '', sku: '', category: '', cost_price: '', selling_price: '', quantity: 0, reorder_level: 10, supplier_id: '', warehouse: '', status: 'active' }

export default function Products() {
  const { can, loadWorkspace } = useAuth()
  const toast = useToast()
  const meta = useApi('/products/meta')
  const sup = useApi('/suppliers')
  const [filters, setFilters] = useState({})
  const [key, setKey] = useState(0)
  const [form, setForm] = useState(null)
  const [del, setDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const w = can('products.write')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      const body = { ...form, supplier_id: form.supplier_id || null }
      if (form.id) await api.put(`/products/${form.id}`, body); else await api.post('/products', body)
      toast('Product saved.'); setForm(null); setKey((k) => k + 1); loadWorkspace()
    } catch (x) { toast(errMsg(x), 'error') } finally { setBusy(false) }
  }
  const remove = async () => { try { await api.delete(`/products/${del.id}`); toast('Product deleted.'); setDel(null); setKey((k) => k + 1); loadWorkspace() } catch (x) { toast(errMsg(x), 'error'); setDel(null) } }
  const cols = [
    { key: 'name', label: 'Product', sort: 'name', render: (p) => <div><p className="font-medium text-slate-100">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div> },
    { key: 'category', label: 'Category', sort: 'category' },
    { key: 'supplier_name', label: 'Supplier', render: (p) => p.supplier_name || <span className="text-muted">-</span> },
    { key: 'cost_price', label: 'Cost', sort: 'cost_price', align: 'right', render: (p) => inr(p.cost_price) },
    { key: 'selling_price', label: 'Price', sort: 'selling_price', align: 'right', render: (p) => inr(p.selling_price) },
    { key: 'quantity', label: 'Qty', sort: 'quantity', align: 'right', render: (p) => <span className={p.quantity <= p.reorder_level ? 'text-amber-300' : ''}>{num(p.quantity)}</span> },
    { key: 'reorder_level', label: 'Reorder at', align: 'right' },
    { key: 'value', label: 'Value', sort: 'value', align: 'right', render: (p) => inr(p.inventory_value) },
    { key: 'risk', label: 'Risk', sort: 'risk', render: (p) => p.risk ? <RiskBadge level={p.risk.risk_level} /> : <span className="text-muted">-</span> },
    { key: 'status', label: 'Status', render: (p) => <Badge color={p.status === 'active' ? '#34d399' : '#8592ad'}>{p.status}</Badge> },
    ...(w ? [{ key: 'a', label: '', render: (p) => <div className="flex gap-1"><button className="btn-ghost !px-2 !py-1" aria-label="Edit" onClick={() => setForm({ ...p, supplier_id: p.supplier_id || '' })}><Pencil size={14} /></button><button className="btn-danger !px-2 !py-1" aria-label="Delete" onClick={() => setDel(p)}><Trash2 size={14} /></button></div> }] : []),
  ]
  const fsel = (k, label, opts) => <select className="input !w-auto !py-1.5" aria-label={label} value={filters[k] || ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value || undefined })}><option value="">{label}: all</option>{opts.map((o) => <option key={o.id ?? o} value={o.id ?? o}>{o.name ?? o}</option>)}</select>
  return (
    <>
      <PageHeader title="Products" subtitle="Your product catalogue. Prices, stock levels and risk at a glance." actions={w && <button className="btn-primary" onClick={() => setForm({ ...blank })}><Plus size={16} />Add product</button>} />
      <Card pad={false}>
        <ServerTable url="/products" params={filters} columns={cols} reloadKey={key} searchPlaceholder="Search name or SKU" empty="No products yet. Add one, or import your product master from Import data."
          toolbar={<>{meta.data && fsel('category', 'Category', meta.data.categories)}{fsel('status', 'Status', ['active', 'discontinued'])}{fsel('level', 'Risk', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])}
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-teal-400" checked={filters.low_stock === '1'} onChange={(e) => setFilters({ ...filters, low_stock: e.target.checked ? '1' : undefined })} />Low stock only</label></>} />
      </Card>
      <Modal open={!!form} title={form?.id ? 'Edit product' : 'Add product'} onClose={() => setForm(null)} wide>
        {form && <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
          <Field label="SKU"><input className="input" required value={form.sku} onChange={set('sku')} /></Field>
          <Field label="Category"><input className="input" list="cats" value={form.category} onChange={set('category')} /><datalist id="cats">{meta.data?.categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Supplier"><select className="input" value={form.supplier_id} onChange={set('supplier_id')}><option value="">- none -</option>{sup.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Cost price (₹)"><input className="input" type="number" min="0" step="0.01" required value={form.cost_price} onChange={set('cost_price')} /></Field>
          <Field label="Selling price (₹)"><input className="input" type="number" min="0" step="0.01" required value={form.selling_price} onChange={set('selling_price')} /></Field>
          {!form.id && <Field label="Opening quantity"><input className="input" type="number" min="0" value={form.quantity} onChange={set('quantity')} /></Field>}
          <Field label="Reorder level"><input className="input" type="number" min="0" value={form.reorder_level} onChange={set('reorder_level')} /></Field>
          <Field label="Warehouse"><input className="input" value={form.warehouse || ''} onChange={set('warehouse')} /></Field>
          <Field label="Status"><select className="input" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="discontinued">Discontinued</option></select></Field>
          {form.id && <p className="self-end text-xs text-muted">To change stock levels use Inventory → Adjust stock so the change is recorded.</p>}
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save product'}</button></div>
        </form>}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete product?" confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={remove}
        message={<>Delete <b>{del?.name}</b> and all of its sales, purchases and stock history? This cannot be undone.</>} />
    </>
  )
}
