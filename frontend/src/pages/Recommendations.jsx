import { useState } from 'react'
import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/client.js'
import { EmptyData, Tabs, useDebounce } from '../components/common.jsx'
import RiskDetail from '../components/RiskDetail.jsx'
import { Async, Badge, Card, PageHeader, Stat, inr, inrShort, num } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const PC = { Critical: '#f43f5e', High: '#fb923c', Medium: '#fbbf24', Watch: '#8592ad' }

export default function Recommendations() {
  const { ws, can } = useAuth()
  const [tier, setTier] = useState('')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const dq = useDebounce(q)
  const [sel, setSel] = useState(null)
  const st = useApi('/analytics/recommendations', { tier: tier || undefined, page, q: dq || undefined })
  if (ws && !ws.has_data) return <><PageHeader title="Recommendations" /><EmptyData title="No inventory data available." canUpload={can('data.import')} /></>
  return (
    <>
      <PageHeader title="Recommendations" subtitle="Specific actions for specific products, each with the reasons behind it. Financial effects are estimates from the simulator's model - not guarantees." />
      <Async state={st}>{(d) => (<>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Object.keys(PC).map((p) => <Stat key={p} label={`${p} priority`} value={num(d.priority_counts[p] || 0)} color={PC[p]} />)}
          <Stat label="Estimated capital recovery" value={inrShort(d.estimated_recovery)} sub="estimate, 30-day clearance model" color="#34d3c1" /></div>
        <div className="mb-4 mt-5 flex flex-wrap items-center gap-3"><Tabs value={tier} onChange={(v) => { setTier(v); setPage(1) }} tabs={[['', 'All'], ['reorder', 'Reorder'], ['clearance', 'Clearance'], ['promotion', 'Promotion'], ['monitor', 'Reduce / monitor'], ['supplier', 'Supplier']]} />
          <input className="input !w-56 !py-1.5" placeholder="Search product" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} aria-label="Search recommendations" /></div>
        {d.items.length === 0 && <Card><p className="py-8 text-center text-sm text-muted">No recommendations in this view - nothing needs action right now.</p></Card>}
        <div className="space-y-3">{d.items.map((r, i) => (
          <article key={(r.product_id || 's') + r.type + i} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-50">{r.product_name}</h3><Badge color={PC[r.priority]}>{r.priority}</Badge>{r.dsrs_score != null && <span className="text-xs text-muted">DSRS {r.dsrs_score}</span>}</div>
                {r.sku && <p className="text-xs text-muted">{r.sku} · {r.category} · {num(r.quantity)} in stock</p>}</div>
              {r.product_id && <button className="btn-ghost !py-1 text-xs" onClick={() => setSel(r.product_id)}>Why this score?</button>}
            </div>
            <p className="mt-3 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-brand">Recommendation</span><br /><span className="text-base font-semibold text-slate-50">{r.action}</span></p>
            <p className="mt-1 text-sm text-slate-300">{r.summary}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">{r.reasons.map((x) => <li key={x}>• {x}</li>)}</ul>
            {r.estimate?.capital_recovery != null && <div className="mt-3 rounded-lg bg-ink/60 p-3 text-xs"><p className="flex items-center gap-1 font-semibold text-amber-300"><Info size={12} />ESTIMATE</p>
              <p className="mt-1 text-slate-300">Potential inventory reduction: {num(r.estimate.units_reduction)} units · Potential capital recovery: {inr(r.estimate.capital_recovery)} · Projected DSRS after: {r.estimate.projected_dsrs}{r.estimate.below_cost ? ' · priced below cost' : ''}</p></div>}
            {r.estimate?.purchase_outlay != null && <p className="mt-3 rounded-lg bg-ink/60 p-3 text-xs text-slate-300">Estimated purchase outlay: {inr(r.estimate.purchase_outlay)} for {num(r.suggested_quantity)} units (quantity x current cost).</p>}
            {r.estimate?.excess_units != null && <p className="mt-3 rounded-lg bg-ink/60 p-3 text-xs text-slate-300">Forecast excess: {num(r.estimate.excess_units)} units ({inr(r.estimate.excess_value)} at cost).</p>}
            {r.product_id && r.suggested_discount > 0 && <div className="mt-3"><Link className="btn-ghost !py-1 text-xs" to={`/simulator?product=${r.product_id}&discount=${r.suggested_discount}`}>Open in simulator</Link></div>}
          </article>))}</div>
        {d.pages > 1 && <div className="mt-4 flex items-center justify-between text-xs text-muted"><span>Page {d.page} of {d.pages} · {num(d.total)} recommendations</span><div className="flex gap-2"><button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-ghost" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}
      </>)}</Async>
      <RiskDetail productId={sel} onClose={() => setSel(null)} />
    </>
  )
}
