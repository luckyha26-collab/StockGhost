import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { C, ChartBox, MoneyBar } from '../components/charts.jsx'
import { EmptyData, ProductPicker, ServerTable, Tabs } from '../components/common.jsx'
import { Async, Badge, Card, Field, Modal, PageHeader, Stat, StatusBadge, fmtDate, inr, inrShort, num, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const TYPES = [['STOCK_IN', 'Stock in (received)'], ['STOCK_OUT', 'Stock out (issued)'], ['ADJUSTMENT', 'Adjustment (set counted quantity)'], ['WRITE_OFF', 'Write-off (damaged / expired)']]

export default function Inventory() {
  const { can, loadWorkspace } = useAuth()
  const toast = useToast()
  const sum = useApi('/inventory/summary')
  const [tab, setTab] = useState('stock')
  const [key, setKey] = useState(0)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const adjust = async (e) => {
    e.preventDefault(); setBusy(true)
    try { await api.post('/inventory/adjust', { product_id: form.product.id, type: form.type, quantity: form.quantity, note: form.note }); toast('Stock updated.'); setForm(null); setKey((k) => k + 1); sum.reload(); loadWorkspace() }
    catch (x) { toast(errMsg(x), 'error') } finally { setBusy(false) }
  }
  const stockCols = [
    { key: 'name', label: 'Product', sort: 'name', render: (p) => <div><p className="font-medium text-slate-100">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div> },
    { key: 'category', label: 'Category', sort: 'category' }, { key: 'warehouse', label: 'Location', render: (p) => p.warehouse || '-' },
    { key: 'quantity', label: 'In stock', sort: 'quantity', align: 'right', render: (p) => <span className={p.quantity <= p.reorder_level ? 'text-amber-300' : ''}>{num(p.quantity)}</span> },
    { key: 'reorder_level', label: 'Reorder at', align: 'right' }, { key: 'cost_price', label: 'Unit cost', align: 'right', render: (p) => inr(p.cost_price) },
    { key: 'value', label: 'Valuation', sort: 'value', align: 'right', render: (p) => inr(p.inventory_value) },
    { key: 'st', label: 'Status', render: (p) => p.risk ? <StatusBadge status={p.risk.stock_status} /> : '-' },
    ...(can('inventory.write') ? [{ key: 'a', label: '', render: (p) => <button className="btn-ghost !px-2 !py-1" onClick={() => setForm({ product: p, type: 'STOCK_IN', quantity: '', note: '' })}><SlidersHorizontal size={14} />Adjust</button> }] : []),
  ]
  const moveCols = [
    { key: 'date', label: 'Date', render: (m) => fmtDate(m.date) }, { key: 'product_name', label: 'Product', render: (m) => <div><p className="text-slate-100">{m.product_name}</p><p className="text-xs text-muted">{m.sku}</p></div> },
    { key: 'transaction_type', label: 'Type', render: (m) => <Badge color={/IN|PURCHASE|OPENING|REVERSAL/.test(m.transaction_type) ? '#34d399' : /SNAPSHOT/.test(m.transaction_type) ? '#8592ad' : '#fb923c'}>{m.transaction_type.replace('_', ' ')}</Badge> },
    { key: 'quantity', label: 'Qty', align: 'right', render: (m) => num(m.quantity) }, { key: 'user', label: 'By', render: (m) => m.user || '-' }, { key: 'note', label: 'Note' },
  ]
  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock on hand, valuation, ageing and every stock movement with who made it." />
      <Async state={sum}>{(s) => s.products === 0 ? <EmptyData title="No inventory data available." canUpload={can('data.import')} /> : (<>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Inventory valuation (at cost)" value={inrShort(s.valuation)} sub={`${num(s.units)} units`} /><Stat label="Products" value={num(s.products)} />
          <Stat label="At or below reorder level" value={num(s.low_stock)} color="#fbbf24" /><Stat label="Out of stock" value={num(s.out_of_stock)} color="#f43f5e" /></div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Inventory ageing" subtitle="Value by how long stock has been held (FIFO). 'Unknown' means no receipt dates were uploaded."><ChartBox height={230}><MoneyBar data={{ labels: s.aging.map((a) => a.bucket), datasets: [{ label: 'Value', data: s.aging.map((a) => a.value), backgroundColor: C.violet, borderRadius: 4 }] }} /></ChartBox></Card>
          <Card title="Valuation by category"><ChartBox height={230}><MoneyBar horizontal data={{ labels: s.by_category.slice(0, 8).map((a) => a.category), datasets: [{ label: 'Value', data: s.by_category.slice(0, 8).map((a) => a.value), backgroundColor: C.brand, borderRadius: 4 }] }} /></ChartBox></Card></div>
        <div className="mb-3 mt-6"><Tabs value={tab} onChange={setTab} tabs={[['stock', 'Stock on hand'], ['movements', 'Stock movements']]} /></div>
        <Card pad={false}>{tab === 'stock'
          ? <ServerTable url="/products" columns={stockCols} reloadKey={key} searchPlaceholder="Search name or SKU" toolbar={null} />
          : <ServerTable url="/inventory/movements" columns={moveCols} reloadKey={key} searchPlaceholder="Search product" empty="No stock movements recorded yet." />}</Card>
      </>)}</Async>
      <Modal open={!!form} title="Adjust stock" onClose={() => setForm(null)}>
        {form && <form onSubmit={adjust} className="space-y-4">
          <div className="rounded-lg bg-ink/60 p-3 text-sm"><b className="text-slate-100">{form.product.name}</b> · currently {num(form.product.quantity)} in stock</div>
          <Field label="Type"><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={form.type === 'ADJUSTMENT' ? 'Counted quantity' : 'Quantity'}><input className="input" type="number" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
          <Field label="Note (optional)"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Apply'}</button></div></form>}
      </Modal>
    </>
  )
}
