import { useState } from 'react'
import { useApi } from '../api/client.js'
import { C, ChartBox, MoneyBar, MoneyLine } from '../components/charts.jsx'
import { EmptyData, Tabs } from '../components/common.jsx'
import { Async, Card, PageHeader, ScoreRing, Stat, inr, inrShort, num } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { Banknote, Coins, PackageX, Repeat, TrendingUp, Boxes } from 'lucide-react'

export default function Executive() {
  const { can } = useAuth()
  const st = useApi('/analytics/executive', { range: '30d' })
  const [dim, setDim] = useState('by_category')
  return (
    <>
      <PageHeader title="Executive dashboard" subtitle="Where is my money stuck? A one-page summary of inventory health and capital at risk." />
      <Async state={st}>{(d) => !d.has_data ? <EmptyData title="No inventory data available." canUpload={can('data.import')} /> : (() => {
        const k = d.kpis, rows = d.money_stuck[dim]
        const health = d.inventory_health ?? 0
        const lvl = health >= 70 ? 'LOW' : health >= 45 ? 'MEDIUM' : health >= 25 ? 'HIGH' : 'CRITICAL'
        return (<>
          <div className="grid gap-4 lg:grid-cols-4">
            <Card className="flex flex-col items-center justify-center text-center"><p className="mb-2 text-xs font-medium text-muted">Inventory health</p><ScoreRing score={Math.round(health)} level={lvl} /><p className="mt-2 text-xs text-muted">100 − value-weighted DSRS</p></Card>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 xl:grid-cols-3">
              <Stat label="Capital at risk" value={inrShort(k.blocked_capital)} sub={`${k.blocked_pct}% of ${inrShort(k.inventory_value)}`} icon={Banknote} color="#f43f5e" />
              <Stat label="Potential recovery (estimate)" value={inrShort(k.potential_recovery)} sub="if suggested discounts are applied" icon={TrendingUp} />
              <Stat label="Dead stock" value={d.dead_stock_pct + '%'} sub={`${inrShort(k.dead_stock_value)} · ${num(k.dead_stock_count)} products`} icon={PackageX} color="#fb923c" />
              <Stat label="Inventory turnover" value={k.inventory_turnover == null ? 'n/a' : k.inventory_turnover + '×'} sub="annualised" icon={Repeat} color="#60a5fa" />
              <Stat label="Revenue (30 days)" value={inrShort(k.sales_revenue)} icon={Coins} color="#34d399" />
              <Stat label="Stockout risk" value={num(k.stockout_risk)} sub="products" icon={Boxes} color="#8b7cf6" />
            </div>
          </div>
          <Card title="Where is my money stuck?" subtitle="Blocked capital (products with DSRS above the blocked threshold) versus total inventory value" className="mt-6"
            actions={<Tabs value={dim} onChange={setDim} tabs={[['by_category', 'Category'], ['by_product', 'Product'], ['by_supplier', 'Supplier'], ['by_warehouse', 'Warehouse']]} />}>
            {rows.length === 0 || rows.every((r) => !r.blocked_capital) ? <p className="py-10 text-center text-sm text-muted">No capital is blocked in this view.</p> : (
              <div className="grid gap-6 lg:grid-cols-2">
                <ChartBox height={Math.max(260, rows.length * 30)}><MoneyBar horizontal data={{ labels: rows.map((r) => r.name), datasets: [{ label: 'Blocked capital', data: rows.map((r) => r.blocked_capital), backgroundColor: C.rose, borderRadius: 4 }] }} /></ChartBox>
                <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">{dim === 'by_product' ? 'Product' : 'Name'}</th><th className="th text-right">Blocked</th><th className="th text-right">Inventory value</th><th className="th text-right">{dim === 'by_product' ? 'DSRS' : 'Products'}</th></tr></thead>
                  <tbody className="divide-y divide-line/70">{rows.map((r) => <tr key={r.name}><td className="td">{r.name}</td><td className="td text-right text-rose-300">{inr(r.blocked_capital)}</td><td className="td text-right">{inr(r.inventory_value)}</td><td className="td text-right">{r.dsrs ?? r.products}</td></tr>)}</tbody></table></div>
              </div>)}
          </Card>
          <Card title="Revenue trend (30 days)" className="mt-6"><ChartBox height={220}><MoneyLine data={{ labels: d.series.labels, datasets: [{ label: 'Revenue', data: d.series.revenue, borderColor: C.brand, backgroundColor: C.brand + '22', fill: true }] }} /></ChartBox></Card>
        </>)
      })()}</Async>
    </>
  )
}
