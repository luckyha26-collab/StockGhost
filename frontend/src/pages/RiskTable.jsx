import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApi } from '../api/client.js'
import { EmptyData, ServerTable } from '../components/common.jsx'
import RiskDetail from '../components/RiskDetail.jsx'
import { Card, PageHeader, RiskBadge, ScoreBar, StatusBadge, inr, num, LEVEL, STATUS_COLOR } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

/** Shared table for Risk Analysis and Dead Stock pages. */
export default function RiskTable({ mode }) {
  const dead = mode === 'dead'
  const { ws, can } = useAuth()
  const [sp] = useSearchParams()
  const [f, setF] = useState({ status: dead ? undefined : undefined })
  const [sel, setSel] = useState(sp.get('product') ? Number(sp.get('product')) : null)
  const [summary, setSummary] = useState(null)
  const meta = useApi('/products/meta')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value || undefined })
  const cols = [
    { key: 'p', label: 'Product', sort: 'name', render: (r) => <div><p className="font-medium text-slate-100">{r.product_name}</p><p className="text-xs text-muted">{r.sku} · {r.category}</p></div> },
    { key: 'quantity', label: 'Qty', sort: 'quantity', align: 'right', render: (r) => num(r.quantity) },
    { key: 'value', label: 'Inventory value', sort: 'value', align: 'right', render: (r) => inr(r.inventory_value) },
    { key: 'last_sale', label: 'Days since sale', sort: 'last_sale', align: 'right', render: (r) => r.last_sale_days ?? 'never' },
    { key: 'velocity', label: 'Velocity /day', sort: 'velocity', align: 'right', render: (r) => r.avg_daily_demand },
    { key: 'score', label: 'DSRS', sort: 'score', render: (r) => <ScoreBar score={r.dsrs_score} level={r.risk_level} /> },
    { key: 'lvl', label: 'Risk', render: (r) => <RiskBadge level={r.risk_level} /> }, { key: 'st', label: 'Status', render: (r) => <StatusBadge status={r.stock_status} /> },
    dead ? { key: 'act', label: 'Recommended action', render: (r) => <span className="text-xs text-slate-300">{r.recommended_action}</span> }
      : { key: 'blocked', label: 'Blocked capital', sort: 'blocked', align: 'right', render: (r) => inr(r.blocked_capital) },
  ]
  const sel2 = (k, label, opts) => <select className="input !w-auto !py-1.5" aria-label={label} value={f[k] || ''} onChange={set(k)}><option value="">{label}: all</option>{opts.map((o) => <option key={o} value={o}>{LEVEL[o]?.label || o}</option>)}</select>
  if (ws && !ws.has_data) return <><PageHeader title={dead ? 'Dead stock' : 'Risk analysis'} /><EmptyData title="No inventory data available." canUpload={can('data.import')} /></>
  return (
    <>
      <PageHeader title={dead ? 'Dead stock & stock classification' : 'Risk analysis (DSRS)'}
        subtitle={dead ? 'Classify every product as dead, slow, healthy, fast moving, overstocked or at risk of stocking out - using your uploaded data.' : 'Dead-Stock Risk Score: a transparent, rule-based 0-100 score. Click a product to see exactly why it scored what it did.'} />
      {dead && summary?.summary && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Object.entries(summary.summary).map(([s, v]) => <button key={s} onClick={() => setF({ ...f, status: f.status === s ? undefined : s })} aria-pressed={f.status === s}
          className={`card p-3 text-left transition ${f.status === s ? 'border-brand' : 'hover:bg-panel2'}`}><p className="text-xs" style={{ color: STATUS_COLOR[s] }}>{s}</p><p className="text-xl font-semibold text-slate-50">{num(v.count)}</p><p className="text-xs text-muted">{inr(v.value)}</p></button>)}</div>}
      {!dead && summary?.level_counts && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries(summary.level_counts).map(([l, n]) => (
        <button key={l} onClick={() => setF({ ...f, level: f.level === l ? undefined : l })} aria-pressed={f.level === l} className={`card p-3 text-left transition ${f.level === l ? 'border-brand' : 'hover:bg-panel2'}`}>
          <p className="text-xs" style={{ color: LEVEL[l].color }}>{LEVEL[l].label}</p><p className="text-xl font-semibold text-slate-50">{num(n)}</p></button>))}</div>}
      <Card pad={false}>
        <ServerTable url={dead ? '/analytics/dead-stock' : '/analytics/risk'} params={f} columns={cols} onData={setSummary} onRowClick={(r) => setSel(r.product_id)} searchPlaceholder="Search name or SKU"
          toolbar={<>{sel2('level', 'Risk', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])}{sel2('status', 'Status', Object.keys(STATUS_COLOR))}
            {meta.data?.categories.length > 0 && <select className="input !w-auto !py-1.5" aria-label="Category" value={f.category || ''} onChange={set('category')}><option value="">Category: all</option>{meta.data.categories.map((c) => <option key={c}>{c}</option>)}</select>}</>} />
      </Card>
      <RiskDetail productId={sel} onClose={() => setSel(null)} />
    </>
  )
}
