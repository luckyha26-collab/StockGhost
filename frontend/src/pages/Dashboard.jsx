import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Banknote, Boxes, Coins, PackageX, RefreshCw, Repeat, TrendingDown, TrendingUp, Warehouse } from 'lucide-react'
import api, { errMsg, useApi } from '../api/client.js'
import { C, ChartBox, MoneyBar, MoneyLine, MoneyPie } from '../components/charts.jsx'
import { EmptyData, fmtDateTime } from '../components/common.jsx'
import { Async, Card, PageHeader, RiskBadge, ScoreBar, Stat, StatusBadge, inr, inrShort, num, riskColor, useToast, STATUS_COLOR } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export const RANGES = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['12m', 'Last 12 months'], ['custom', 'Custom range']]

export function FilterBar({ f, set, options }) {
  const sel = (k, label, opts) => (
    <select className="input !w-auto !py-1.5" aria-label={label} value={f[k] || ''} onChange={(e) => set({ ...f, [k]: e.target.value })}>
      <option value="">{label}: all</option>{opts.map((o) => <option key={o.id ?? o} value={o.id ?? o}>{o.name ?? o}</option>)}</select>)
  return (
    <div className="card mb-5 flex flex-wrap items-center gap-2 p-3">
      <select className="input !w-auto !py-1.5" aria-label="Date range" value={f.range} onChange={(e) => set({ ...f, range: e.target.value })}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {f.range === 'custom' && <><input type="date" className="input !w-auto !py-1.5" aria-label="Start date" value={f.start || ''} onChange={(e) => set({ ...f, start: e.target.value })} /><input type="date" className="input !w-auto !py-1.5" aria-label="End date" value={f.end || ''} onChange={(e) => set({ ...f, end: e.target.value })} /></>}
      {options?.categories?.length > 0 && sel('category', 'Category', options.categories)}
      {options?.suppliers?.length > 0 && sel('supplier_id', 'Supplier', options.suppliers)}
      {options?.warehouses?.length > 0 && sel('warehouse', 'Warehouse', options.warehouses)}
      {options?.regions?.length > 0 && sel('region', 'Region', options.regions)}
      <button className="btn-ghost !py-1.5" onClick={() => set({ range: '30d' })}>Reset</button>
    </div>
  )
}

export function Freshness({ fr, onRefresh, refreshing, canRun }) {
  const nav = useNavigate()
  const c = fr.counts
  return (
    <div className="mb-5 space-y-3">
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-xs text-muted">
        <span>Last updated: <b className="text-slate-200">{fr.last_analysis_at ? fmtDateTime(fr.last_analysis_at) : 'never'}</b></span>
        <span>Records analysed: <b className="text-slate-200">{num(c.records_analyzed)}</b></span>
        <span>Products: <b className="text-slate-200">{num(c.products)}</b></span><span>Sales: <b className="text-slate-200">{num(c.sales)}</b></span><span>Purchases: <b className="text-slate-200">{num(c.purchases)}</b></span>
        {canRun && <button className="btn-ghost ml-auto !py-1.5" onClick={onRefresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refresh analysis</button>}
      </div>
      {fr.analysis_stale && <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">Your data changed since the last analysis. Refresh the analysis to update risk scores and forecasts.</div>}
      {fr.data_is_old && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm text-sky-200">
        <span>Your latest data is from {fr.latest_data_date} ({fr.data_age_days} days ago). Analysis is measured against today, so most stock looks old.</span>
        {canRun && <button className="btn-ghost !py-1" onClick={async () => { await api.put('/workspace', { config: { as_of: 'latest_data' } }); await api.post('/analytics/refresh'); window.location.reload() }}>Analyse as of {fr.latest_data_date}</button>}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { ws, can, loadWorkspace } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ range: '30d' })
  const [busy, setBusy] = useState(false)
  const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v))
  const st = useApi('/analytics/dashboard', clean, f.range !== 'custom' || (!!f.start && !!f.end))
  const refresh = async () => { setBusy(true); try { await api.post('/analytics/refresh'); toast('Analysis refreshed.'); st.reload(); loadWorkspace() } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) } }
  const nav = useNavigate()
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live view of inventory health, blocked capital and sales - calculated from this workspace's data." />
      <Async state={st}>{(d) => !d.has_data ? <EmptyData title="No inventory data available." text="Upload your business dataset to begin analysis." canUpload={can('data.import')} /> : (() => {
        const k = d.kpis, s = d.series
        return (<>
          <Freshness fr={d.freshness} onRefresh={refresh} refreshing={busy} canRun={can('analytics.run')} />
          <FilterBar f={f} set={setF} options={d.filters} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Total inventory value" value={inrShort(k.inventory_value)} sub={`${num(k.total_units)} units · ${num(k.total_products)} products`} icon={Warehouse} />
            <Stat label="Blocked capital" value={inrShort(k.blocked_capital)} sub={`${k.blocked_pct}% of inventory`} icon={Banknote} color="#f43f5e" />
            <Stat label="Dead stock value" value={inrShort(k.dead_stock_value)} sub={`${num(k.dead_stock_count)} products`} icon={PackageX} color="#fb923c" />
            <Stat label="High-risk products" value={num(k.high_risk)} sub="DSRS above 60" icon={AlertTriangle} color="#fb923c" />
            <Stat label="Slow-moving products" value={num(k.slow_moving)} icon={TrendingDown} color="#fbbf24" />
            <Stat label="Stockout risk" value={num(k.stockout_risk)} sub="forecast demand exceeds stock" icon={Boxes} color="#8b7cf6" />
            <Stat label="Inventory turnover" value={k.inventory_turnover == null ? 'n/a' : k.inventory_turnover + '×'} sub="annualised, cost of sales / stock value" icon={Repeat} color="#60a5fa" />
            <Stat label="Sales revenue" value={inrShort(k.sales_revenue)} sub={k.revenue_change_pct == null ? `${num(k.units_sold)} units` : `${k.revenue_change_pct >= 0 ? '▲' : '▼'} ${Math.abs(k.revenue_change_pct)}% vs previous period`} icon={Coins} color="#34d399" />
            <Stat label="Potential recovery" value={inrShort(k.potential_recovery)} sub="estimate if recommendations are applied" icon={TrendingUp} color="#34d3c1" />
            <Stat label="Average DSRS" value={k.average_dsrs} sub="0 safe · 100 critical" icon={Activity} color="#8b7cf6" />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card title="Revenue & purchases" subtitle={`${d.period.start} to ${d.period.end}`} className="lg:col-span-2">
              <ChartBox><MoneyLine data={{ labels: s.labels, datasets: [{ label: 'Revenue', data: s.revenue, borderColor: C.brand, backgroundColor: C.brand + '22', fill: true }, { label: 'Purchases', data: s.purchases, borderColor: C.violet }] }} /></ChartBox></Card>
            <Card title="Risk distribution" subtitle="Products by DSRS level"><ChartBox><MoneyPie doughnut money={false} data={{ labels: d.risk_distribution.map((r) => r.level), datasets: [{ data: d.risk_distribution.map((r) => r.count), backgroundColor: d.risk_distribution.map((r) => riskColor(r.level)), borderWidth: 0 }] }} /></ChartBox></Card>
            <Card title="Blocked capital by category" className="lg:col-span-2"><ChartBox>{d.blocked_by_category.some((c) => c.blocked_capital > 0)
              ? <MoneyBar horizontal data={{ labels: d.blocked_by_category.map((c) => c.category), datasets: [{ label: 'Blocked capital', data: d.blocked_by_category.map((c) => c.blocked_capital), backgroundColor: C.rose, borderRadius: 4 }] }} />
              : <p className="py-16 text-center text-sm text-muted">No capital is blocked in the selected scope.</p>}</ChartBox></Card>
            <Card title="Stock status" subtitle="Inventory value by classification"><ChartBox><MoneyPie doughnut data={{ labels: d.status_distribution.map((r) => r.status), datasets: [{ data: d.status_distribution.map((r) => r.inventory_value), backgroundColor: d.status_distribution.map((r) => STATUS_COLOR[r.status]), borderWidth: 0 }] }} /></ChartBox></Card>
          </div>
          <Card title="Top risk products" className="mt-6" pad={false} actions={<Link to="/risk-analysis" className="text-xs text-brand hover:underline">View all</Link>}>
            <div className="overflow-x-auto"><table className="w-full min-w-max"><thead><tr><th className="th">Product</th><th className="th">DSRS</th><th className="th">Status</th><th className="th text-right">Qty</th><th className="th text-right">Blocked capital</th><th className="th">Why</th></tr></thead>
              <tbody className="divide-y divide-line/70">{d.top_risk.map((r) => (
                <tr key={r.product_id} className="cursor-pointer hover:bg-panel2/60" onClick={() => nav('/risk-analysis?product=' + r.product_id)}><td className="td"><p className="font-medium text-slate-100">{r.product_name}</p><p className="text-xs text-muted">{r.sku}</p></td>
                  <td className="td"><ScoreBar score={r.dsrs_score} level={r.risk_level} /></td><td className="td"><StatusBadge status={r.stock_status} /></td><td className="td text-right">{num(r.quantity)}</td><td className="td text-right">{inr(r.blocked_capital)}</td>
                  <td className="td max-w-xs truncate text-xs text-muted">{r.reasons[0]}</td></tr>))}</tbody></table></div></Card>
        </>)
      })()}</Async>
    </>
  )
}
