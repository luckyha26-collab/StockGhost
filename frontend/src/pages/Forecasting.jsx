import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import { useApi } from '../api/client.js'
import { C, ChartBox } from '../components/charts.jsx'
import { EmptyData, ServerTable, Tabs } from '../components/common.jsx'
import { Async, Badge, Card, Modal, PageHeader, Stat, num } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const RISK_C = { HIGH: '#f43f5e', MEDIUM: '#fbbf24', LOW: '#34d399' }

function ForecastModal({ id, onClose }) {
  const st = useApi(`/analytics/forecast/${id}`, null, !!id)
  return (
    <Modal open={!!id} title="Demand forecast" onClose={onClose} wide>
      <Async state={st}>{(d) => {
        const labels = [...d.history.map((h) => h.week), ...d.forecast.map((h) => h.week)]
        const hist = [...d.history.map((h) => h.units), ...d.forecast.map(() => null)]
        const fc = [...d.history.map((_, i) => (i === d.history.length - 1 ? d.history[i].units : null)), ...d.forecast.map((h) => h.units)]
        return (<div className="space-y-4">
          <div><h3 className="text-lg font-semibold text-slate-50">{d.product.name}</h3><p className="text-xs text-muted">{d.product.sku}</p></div>
          {d.message && <p className="flex gap-2 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200"><Info size={16} className="mt-0.5 shrink-0" />{d.message}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Method', d.method_label], [`Forecast (${d.horizon_days} d)`, num(Math.round(d.forecast_units)) + ' units'], ['Current stock', num(d.current_stock)], ['Expected stock after period', num(Math.round(d.expected_stock))],
              ['Range (80%)', d.low == null ? 'n/a' : `${Math.round(d.low)} - ${Math.round(d.high)}`], ['Back-test accuracy', d.accuracy_pct == null ? 'not measurable' : d.accuracy_pct + '%'], ['Hold-out weeks', d.holdout_weeks || '-']].map(([a, b]) => <div key={a} className="rounded-lg bg-ink/60 p-3"><p className="text-xs text-muted">{a}</p><p className="font-medium text-slate-100">{b}</p></div>)}
          </div>
          {d.history.length > 0 ? <ChartBox height={260}><Line data={{ labels, datasets: [{ label: 'Weekly units sold (history)', data: hist, borderColor: C.brand, backgroundColor: C.brand + '22', fill: true, tension: 0.3 }, ...(d.forecast.length ? [{ label: 'Forecast', data: fc, borderColor: C.amber, borderDash: [6, 4], tension: 0.3 }] : [])] }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { beginAtZero: true } } }} /></ChartBox>
            : <p className="py-8 text-center text-sm text-muted">No sales history for this product.</p>}
          <p className="text-xs text-muted">Statistical forecast (moving average / exponential smoothing / damped Holt trend, selected by hold-out accuracy). Not machine learning.</p>
        </div>)
      }}</Async>
    </Modal>
  )
}

export default function Forecasting() {
  const { ws, can } = useAuth()
  const [sp] = useSearchParams()
  const [flag, setFlag] = useState('')
  const [sum, setSum] = useState(null)
  const [sel, setSel] = useState(sp.get('product') ? Number(sp.get('product')) : null)
  const cols = [
    { key: 'p', label: 'Product', render: (r) => <div><p className="font-medium text-slate-100">{r.product_name}</p><p className="text-xs text-muted">{r.sku}</p></div> },
    { key: 'quantity', label: 'Current stock', sort: 'quantity', align: 'right', render: (r) => num(r.quantity) },
    { key: 'velocity', label: 'Avg daily demand', sort: 'velocity', align: 'right', render: (r) => r.avg_daily_demand },
    { key: 'forecast', label: `Forecast demand`, sort: 'forecast', align: 'right', render: (r) => num(Math.round(r.forecast_units)) },
    { key: 'expected', label: 'Expected stock', align: 'right', render: (r) => <span className={r.expected_stock < 0 ? 'text-rose-300' : ''}>{num(r.expected_stock)}</span> },
    { key: 'shortfall', label: 'Potential stockout', sort: 'shortfall', align: 'right', render: (r) => r.forecast_shortfall > 0 ? <span className="text-rose-300">{num(r.forecast_shortfall)} short</span> : '-' },
    { key: 'excess', label: 'Potential overstock', sort: 'excess', align: 'right', render: (r) => r.forecast_excess > 0 ? <span className="text-violet">{num(r.forecast_excess)} extra</span> : '-' },
    { key: 'so', label: 'Stockout risk', render: (r) => r.stockout_risk ? <Badge color={RISK_C[r.stockout_risk]}>{r.stockout_risk}</Badge> : <span className="text-muted">no demand</span> },
    { key: 'm', label: 'Method', render: (r) => <span className="text-xs text-muted">{r.forecast_method === 'average_velocity' ? 'limited data' : r.forecast_wape == null ? '' : `${Math.round((1 - r.forecast_wape) * 100)}% back-test`}</span> },
  ]
  if (ws && !ws.has_data) return <><PageHeader title="Forecasting" /><EmptyData title="No inventory data available." canUpload={can('data.import')} /></>
  return (
    <>
      <PageHeader title="Inventory & demand forecasting" subtitle="Expected demand per product over the forecast period, and what it means for stock-outs and overstock." />
      {sum && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Stockout risk (high)" value={num(sum.summary.stockout_high)} color="#f43f5e" /><Stat label="Stockout risk (medium)" value={num(sum.summary.stockout_medium)} color="#fbbf24" />
        <Stat label="Overstock / excess" value={num(sum.summary.overstock)} color="#8b7cf6" /><Stat label="Statistical forecasts" value={num(sum.summary.statistical)} sub={`${num(sum.summary.limited_history)} with limited history`} /></div>
        <p className="mb-5 mt-4 flex gap-2 text-xs text-muted"><Info size={14} className="shrink-0" />{sum.method_note} Products with fewer than 8 weeks of history use a simple average-velocity estimate and are labelled "limited data". Horizon: {sum.horizon_days} days.</p></>}
      <Card pad={false}>
        <ServerTable url="/analytics/forecast" params={{ flag: flag || undefined }} columns={cols} onData={setSum} onRowClick={(r) => setSel(r.product_id)}
          toolbar={<Tabs value={flag} onChange={setFlag} tabs={[['', 'All'], ['stockout', 'Stockout risk'], ['overstock', 'Overstock'], ['limited', 'Limited data']]} />} />
      </Card>
      <ForecastModal id={sel} onClose={() => setSel(null)} />
    </>
  )
}
