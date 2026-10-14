import { useState } from 'react'
import { Eye, FileSpreadsheet, FileText, FileType2 } from 'lucide-react'
import { download, errMsg, useApi } from '../api/client.js'
import api from '../api/client.js'
import { EmptyData } from '../components/common.jsx'
import { Async, Card, Modal, PageHeader, Spinner, fmtDate, useToast, num } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const DESC = { inventory: 'Stock on hand, valuation and status for every product.', 'dead-stock': 'Dead, slow-moving and overstocked products.', risk: 'DSRS scores with the reasons behind each.', sales: 'Sales transactions for a period.',
  purchases: 'Purchases for a period.', 'blocked-capital': 'Products holding blocked capital, by category and supplier.', recommendations: 'Recommended actions with estimated effects.', executive: 'One-page KPI summary with charts and top risks.' }

export default function Reports() {
  const { ws, can } = useAuth()
  const toast = useToast()
  const cat = useApi('/reports')
  const [period, setPeriod] = useState({ start: '', end: '' })
  const [busy, setBusy] = useState('')
  const [prev, setPrev] = useState(null)
  const params = (r) => (r.uses_period ? { start: period.start || undefined, end: period.end || undefined } : {})
  const get = async (r, format) => {
    setBusy(r.kind + format)
    try { await download(`/reports/${r.kind}`, { ...params(r), format }, `${r.kind}.${format}`); toast(`${r.title} downloaded.`) } catch (e) { toast(errMsg(e), 'error') } finally { setBusy('') }
  }
  const preview = async (r) => { setBusy(r.kind + 'json'); try { setPrev((await api.get(`/reports/${r.kind}`, { params: { ...params(r), format: 'json' } })).data) } catch (e) { toast(errMsg(e), 'error') } finally { setBusy('') } }
  if (ws && !ws.has_data) return <><PageHeader title="Reports" /><EmptyData title="No data available for reports." canUpload={can('data.import')} /></>
  return (
    <>
      <PageHeader title="Reports" subtitle="Export workspace reports as CSV, Excel or a formatted PDF. Reports contain only this workspace's data." />
      <Card className="mb-5"><div className="flex flex-wrap items-end gap-4"><p className="text-sm text-slate-200">Period for sales & purchase reports</p>
        <label className="text-xs text-muted">From<input type="date" className="input mt-1" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></label>
        <label className="text-xs text-muted">To<input type="date" className="input mt-1" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></label></div></Card>
      <Async state={cat}>{(rs) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rs.map((r) => (
          <Card key={r.kind} title={r.title} subtitle={DESC[r.kind]}>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !py-1.5" onClick={() => preview(r)} disabled={!!busy}><Eye size={14} />Preview</button>
              <button className="btn-ghost !py-1.5" onClick={() => get(r, 'csv')} disabled={!!busy}><FileText size={14} />CSV</button>
              <button className="btn-ghost !py-1.5" onClick={() => get(r, 'xlsx')} disabled={!!busy}><FileSpreadsheet size={14} />Excel</button>
              <button className="btn-primary !py-1.5" onClick={() => get(r, 'pdf')} disabled={!!busy}><FileType2 size={14} />{busy === r.kind + 'pdf' ? 'Building...' : 'PDF'}</button>
            </div></Card>))}</div>)}</Async>
      <Modal open={!!prev} title={prev?.meta.title} onClose={() => setPrev(null)} wide>
        {prev && <div className="space-y-3"><p className="text-xs text-muted">{prev.meta.company} · {prev.meta.period} · generated {prev.meta.generated_at}{prev.meta.demo ? ' · DEMO DATA' : ''}</p>
          {Object.keys(prev.totals).length > 0 && <div className="flex flex-wrap gap-3">{Object.entries(prev.totals).map(([k, v]) => <div key={k} className="rounded-lg bg-ink/60 px-3 py-2"><p className="text-xs text-muted">{k}</p><p className="font-medium text-slate-100">{typeof v === 'number' ? num(v) : v}</p></div>)}</div>}
          <div className="max-h-96 overflow-auto rounded-lg border border-line"><table className="w-full min-w-max text-xs"><thead className="sticky top-0 bg-panel"><tr>{prev.columns.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-line/60">{prev.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-1.5">{c ?? ''}</td>)}</tr>)}</tbody></table></div>
          <p className="text-xs text-muted">Preview shows the first 100 rows. Downloads contain the full report.</p></div>}
      </Modal>
    </>
  )
}
