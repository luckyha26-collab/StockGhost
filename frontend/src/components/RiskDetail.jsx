import { Link } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { useApi } from '../api/client.js'
import { Async, Modal, RiskBadge, ScoreRing, StatusBadge, fmtDate, inr, num, riskColor } from './ui.jsx'

const Fact = ({ k, v }) => <div className="rounded-lg bg-ink/60 p-3"><p className="text-xs text-muted">{k}</p><p className="mt-0.5 text-sm font-medium text-slate-100">{v}</p></div>

/** Explains WHY a product received its DSRS score. productId=null closes it. */
export default function RiskDetail({ productId, onClose }) {
  const st = useApi(`/analytics/risk/${productId}`, null, !!productId)
  return (
    <Modal open={!!productId} onClose={onClose} title="Risk explanation (DSRS)" wide>
      <Async state={st}>{(d) => {
        const rec = d.recommendation
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <ScoreRing score={d.dsrs_score} level={d.risk_level} size={104} />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-slate-50">{d.product_name}</h3>
                <p className="text-sm text-muted">{d.sku} · {d.category}{d.supplier_name ? ` · ${d.supplier_name}` : ''}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><RiskBadge level={d.risk_level} /><StatusBadge status={d.stock_status} />
                  <span className="text-sm text-slate-300">DSRS Score: <b style={{ color: riskColor(d.risk_level) }}>{d.dsrs_score}/100</b></span></div>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-100">Why this score</h4>
              {d.reasons?.length ? <ul className="space-y-1.5 text-sm text-slate-300">{d.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: riskColor(d.risk_level) }} />{r}</li>)}</ul>
                : <p className="text-sm text-muted">No major risk drivers - this product is moving normally.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact k="In stock" v={`${num(d.quantity)} units`} /><Fact k="Inventory value" v={inr(d.inventory_value)} />
              <Fact k="Blocked capital" v={inr(d.blocked_capital)} /><Fact k="Days since last sale" v={d.last_sale_days ?? 'No sale recorded'} />
              <Fact k="Stock age" v={d.stock_age == null ? 'Unknown' : `${Math.round(d.stock_age)} days`} /><Fact k="Sales velocity" v={`${d.avg_daily_demand} / day`} />
              <Fact k="Forecast demand (30d)" v={`${num(Math.round(d.forecast_units))} units`} /><Fact k="Cover" v={d.cover_days == null ? 'No demand' : `${Math.round(d.cover_days)} days`} />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-100">Score breakdown <span className="font-normal text-muted">(rule-based, weights set for your business type)</span></h4>
              <div className="space-y-2">
                {d.factors.map((f) => (
                  <div key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[180px_1fr_70px]">
                    <span className="text-sm text-slate-300">{f.label} <span className="text-xs text-muted">({f.weight}%)</span></span>
                    <div className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-line sm:order-none sm:col-span-1" title={f.risk == null ? 'No data' : `Risk ${Math.round(f.risk * 100)}%`}>
                      {f.risk != null && <div className="fill-bar h-full rounded-full" style={{ width: f.risk * 100 + '%', background: riskColor(d.risk_level) }} />}</div>
                    <span className="text-right text-xs text-muted">{f.points == null ? 'no data' : `${f.points} pts`}</span>
                  </div>))}
              </div>
              {d.missing_factors?.length > 0 && <p className="mt-2 text-xs text-amber-300/90">Not scored (data not available): {d.missing_factors.join(', ')}. Remaining factors were re-weighted.</p>}
            </div>

            {rec && (
              <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-100">Recommended action: <span className="text-brand">{rec.action}</span></h4>
                  <Link to={`/simulator?product=${d.product_id}`} className="btn-ghost !py-1 text-xs"><SlidersHorizontal size={14} />Simulate</Link></div>
                <p className="mt-1.5 text-sm text-slate-300">{rec.summary}</p>
                {rec.estimate?.capital_recovery != null && <p className="mt-2 text-xs text-muted">Estimate: could reduce about {num(rec.estimate.units_reduction)} units and recover roughly {inr(rec.estimate.capital_recovery)} of cost. {rec.estimate.note}</p>}
                {rec.estimate?.purchase_outlay != null && <p className="mt-2 text-xs text-muted">Estimated outlay about {inr(rec.estimate.purchase_outlay)}. {rec.estimate.note}</p>}
              </div>)}

            {d.recent_movements?.length > 0 && (
              <div><h4 className="mb-2 text-sm font-semibold text-slate-100">Recent stock movements</h4>
                <ul className="divide-y divide-line/70 text-sm">{d.recent_movements.slice(0, 6).map((m) => <li key={m.id} className="flex justify-between gap-3 py-1.5"><span className="text-slate-300">{m.transaction_type.replace(/_/g, ' ').toLowerCase()} · {num(m.quantity)}</span><span className="text-xs text-muted">{fmtDate(m.date)}{m.user ? ` · ${m.user}` : ''}</span></li>)}</ul></div>)}
          </div>)
      }}</Async>
    </Modal>
  )
}
