import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { C, ChartBox, MoneyBar, MoneyLine } from '../components/charts.jsx'
import { EmptyData, ProductPicker, Tabs, useDebounce } from '../components/common.jsx'
import { Card, Field, PageHeader, RiskBadge, Stat, inr, inrShort, num } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const Row = ({ label, a, b, bad }) => <tr><td className="py-2 text-muted">{label}</td><td className="py-2 text-right text-slate-200">{a}</td><td className={`py-2 text-right font-medium ${bad ? 'text-rose-300' : 'text-emerald-300'}`}>{b}</td></tr>

export default function Simulator() {
  const { ws, can } = useAuth()
  const [sp] = useSearchParams()
  const [mode, setMode] = useState('product')
  const [product, setProduct] = useState(null)
  const [p, setP] = useState({ discount: Number(sp.get('discount')) || 20, demand_change: 0, purchase_qty: 0, horizon: 30, sensitivity: 2.8 })
  const [scope, setScope] = useState({ mode: 'blocked', top_n: 10, category: '' })
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cats = useApi('/products/meta')
  const dp = useDebounce(p, 400)
  const pid = sp.get('product')
  useEffect(() => { if (pid) api.get(`/analytics/risk/${pid}`).then((r) => setProduct({ id: r.data.product_id, name: r.data.product_name })).catch(() => {}) }, [pid])
  useEffect(() => {
    if (!ws?.has_data || (mode === 'product' && !product)) { setRes(null); return }
    let live = true
    setBusy(true); setErr('')
    api.post('/analytics/simulate', { mode, product_id: product?.id, ...dp, scope })
      .then((r) => live && setRes(r.data)).catch((e) => live && (setErr(errMsg(e)), setRes(null))).finally(() => live && setBusy(false))
    return () => { live = false }
  }, [mode, product, dp, scope, ws?.has_data])
  const num_ = (k, min, max, step = 1) => (e) => setP({ ...p, [k]: Math.max(min, Math.min(max, Number(e.target.value))) })
  if (ws && !ws.has_data) return <><PageHeader title="What-if simulator" /><EmptyData title="No inventory data available." canUpload={can('data.import')} /></>
  return (
    <>
      <PageHeader title="What-if simulator" subtitle="Test a discount or demand change and see projected blocked capital. All results are PROJECTIONS based on the stated assumptions." />
      <div className="mb-4"><Tabs value={mode} onChange={(m) => { setMode(m); setRes(null) }} tabs={[['product', 'Single product'], ['portfolio', 'Group of products']]} /></div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Scenario" className="lg:col-span-1"><div className="space-y-4">
          {mode === 'product' ? <Field label="Product"><ProductPicker value={product} onChange={setProduct} /></Field> : <>
            <Field label="Apply to"><select className="input" value={scope.mode} onChange={(e) => setScope({ ...scope, mode: e.target.value })}><option value="blocked">All blocked-capital products</option><option value="top_dead">Top dead-stock products</option><option value="category">One category</option><option value="all">Every product</option></select></Field>
            {scope.mode === 'top_dead' && <Field label="How many (top by value)"><input className="input" type="number" min="1" max="500" value={scope.top_n} onChange={(e) => setScope({ ...scope, top_n: Number(e.target.value) })} /></Field>}
            {scope.mode === 'category' && <Field label="Category"><select className="input" value={scope.category} onChange={(e) => setScope({ ...scope, category: e.target.value })}><option value="">Choose...</option>{cats.data?.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>}</>}
          <Field label={`Discount: ${p.discount}%`}><input type="range" min="0" max="70" step="1" value={p.discount} onChange={num_('discount', 0, 70)} className="w-full accent-teal-400" /></Field>
          <Field label={`Demand change: ${p.demand_change > 0 ? '+' : ''}${p.demand_change}%`}><input type="range" min="-50" max="100" step="5" value={p.demand_change} onChange={num_('demand_change', -50, 100)} className="w-full accent-teal-400" /></Field>
          <Field label="Forecast period (days)"><input className="input" type="number" min="7" max="365" value={p.horizon} onChange={num_('horizon', 7, 365)} /></Field>
          {mode === 'product' && <Field label="Additional purchase quantity" hint="Extra units you are considering ordering"><input className="input" type="number" min="0" value={p.purchase_qty} onChange={num_('purchase_qty', 0, 1e7)} /></Field>}
          <Field label={`Price sensitivity: ${p.sensitivity}`} hint="How strongly a discount lifts sell-through (assumption).">
            <input type="range" min="0.5" max="6" step="0.1" value={p.sensitivity} onChange={num_('sensitivity', 0.5, 6)} className="w-full accent-teal-400" /></Field>
        </div></Card>
        <div className="space-y-5 lg:col-span-2">
          {err && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{err}</p>}
          {!res && !err && <Card><p className="py-12 text-center text-sm text-muted">{mode === 'product' && !product ? 'Choose a product to simulate.' : 'Calculating...'}</p></Card>}
          {res && res.mode === 'product' && (<>
            <Card title={res.product.name} subtitle="PROJECTION - not a guarantee" actions={<><RiskBadge level={res.before.risk_level} /><span className="text-muted">→</span><RiskBadge level={res.after.risk_level} /></>}>
              <table className="w-full text-sm"><thead><tr className="text-xs text-muted"><th className="text-left font-medium" /><th className="text-right font-medium">Current</th><th className="text-right font-medium">Projected</th></tr></thead><tbody className="divide-y divide-line/60">
                <Row label="DSRS score" a={res.before.dsrs_score} b={res.after.dsrs_score} bad={res.after.dsrs_score > res.before.dsrs_score} />
                <Row label="Blocked capital" a={inr(res.before.blocked_capital)} b={inr(res.after.blocked_capital)} bad={res.after.blocked_capital > res.before.blocked_capital} />
                <Row label="Units in stock" a={num(res.before.stock)} b={num(res.after.stock)} /><Row label="Inventory value" a={inr(res.before.inventory_value)} b={inr(res.after.inventory_value)} /></tbody></table>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Est. units sold" value={num(res.estimated_units_sold)} sub={`${res.sell_through_pct}% sell-through`} /><Stat label="Est. sales" value={inrShort(res.revenue)} /><Stat label="Capital recovered" value={inrShort(res.capital_recovered)} /><Stat label="Margin on sales" value={inrShort(res.profit_or_loss)} color={res.profit_or_loss < 0 ? '#f43f5e' : '#34d399'} /></div>
              {res.below_cost && <p className="mt-3 text-xs text-rose-300">At this discount the selling price ({inr(res.discounted_price)}) is below cost.</p>}</Card>
            <Card title="Outcome by discount level" subtitle="Projected capital recovered and remaining blocked capital"><ChartBox height={240}><MoneyLine data={{ labels: res.curve.map((c) => c.discount_pct + '%'), datasets: [{ label: 'Capital recovered', data: res.curve.map((c) => c.capital_recovered), borderColor: C.brand }, { label: 'Remaining blocked capital', data: res.curve.map((c) => c.remaining_blocked_capital), borderColor: C.rose }] }} /></ChartBox></Card></>)}
          {res && res.mode === 'portfolio' && (<>
            <Card title={`${res.products} products`} subtitle={`PROJECTION over ${res.horizon_days} days at ${res.discount_pct}% discount`}>
              <table className="w-full text-sm"><thead><tr className="text-xs text-muted"><th className="text-left font-medium" /><th className="text-right font-medium">Current</th><th className="text-right font-medium">Projected</th></tr></thead><tbody className="divide-y divide-line/60">
                <Row label="Blocked capital" a={inr(res.current.blocked_capital)} b={inr(res.projected.blocked_capital)} bad={res.projected.blocked_capital > res.current.blocked_capital} />
                <Row label="Inventory value" a={inr(res.current.inventory_value)} b={inr(res.projected.inventory_value)} /><Row label="Units in stock" a={num(res.current.units)} b={num(res.projected.units)} />
                <Row label="Average DSRS" a={res.current.avg_dsrs} b={res.projected.avg_dsrs} bad={res.projected.avg_dsrs > res.current.avg_dsrs} /></tbody></table>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Est. units sold" value={num(res.projected.units_sold)} /><Stat label="Projected sales" value={inrShort(res.projected.sales)} /><Stat label="Capital recovered" value={inrShort(res.projected.capital_recovered)} /><Stat label="Margin on sales" value={inrShort(res.projected.profit_or_loss)} color={res.projected.profit_or_loss < 0 ? '#f43f5e' : '#34d399'} /></div></Card>
            <Card title="Blocked capital by discount level" subtitle="Compare scenarios"><ChartBox height={240}><MoneyBar data={{ labels: res.curve.map((c) => c.discount_pct + '% off'), datasets: [{ label: 'Projected blocked capital', data: res.curve.map((c) => c.blocked_capital), backgroundColor: C.rose, borderRadius: 4 }] }} /></ChartBox></Card></>)}
          {res && <Card title="Assumptions" pad><ul className="space-y-1.5 text-xs text-muted">{res.assumptions.map((a) => <li key={a} className="flex gap-2"><Info size={13} className="mt-0.5 shrink-0" />{a}</li>)}</ul></Card>}
        </div>
      </div>
    </>
  )
}
