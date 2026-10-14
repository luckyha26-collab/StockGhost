import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Eye, RefreshCw, Trash2, Upload } from 'lucide-react'
import api, { download, errMsg } from '../api/client.js'
import { Badge, Card, Modal, PageHeader, num, useToast } from '../components/ui.jsx'
import { ConfirmDialog, ServerTable, fileSize, fmtDateTime } from '../components/common.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const STATUS = { completed: ['#34d399', 'Completed'], failed: ['#f43f5e', 'Failed'], validated: ['#fbbf24', 'Validated - not imported'], uploaded: ['#8592ad', 'Uploaded'], importing: ['#60a5fa', 'Importing'] }
const TYPE = { products: 'Products', inventory: 'Inventory', sales: 'Sales', purchases: 'Purchases', suppliers: 'Suppliers', combined: 'Combined' }

export default function DataSources() {
  const { can, loadWorkspace } = useAuth()
  const toast = useToast()
  const [key, setKey] = useState(0)
  const [view, setView] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const open = async (id) => { try { setView((await api.get(`/imports/${id}`)).data) } catch (e) { toast(errMsg(e), 'error') } }
  const run = async () => {
    const { kind, job } = confirm
    try {
      if (kind === 'delete') await api.delete(`/imports/${job.id}`); else await api.post(`/imports/${job.id}/reprocess`)
      toast(kind === 'delete' ? 'Import deleted.' : 'Import reprocessed.'); setConfirm(null); setKey((k) => k + 1); loadWorkspace()
    } catch (e) { toast(errMsg(e), 'error'); setConfirm(null) }
  }
  const cols = [
    { key: 'filename', label: 'File', render: (j) => <span className="font-medium text-slate-100">{j.filename}</span> },
    { key: 'created_at', label: 'Uploaded', render: (j) => fmtDateTime(j.created_at) },
    { key: 'uploaded_by', label: 'By' },
    { key: 'dataset_type', label: 'Dataset', render: (j) => TYPE[j.dataset_type] },
    { key: 'rows_total', label: 'Rows', align: 'right', render: (j) => num(j.rows_total) },
    { key: 'rows_valid', label: 'Valid', align: 'right', render: (j) => num(j.rows_valid) },
    { key: 'rows_rejected', label: 'Rejected', align: 'right', render: (j) => <span className={j.rows_rejected ? 'text-rose-300' : ''}>{num(j.rows_rejected)}</span> },
    { key: 'status', label: 'Status', render: (j) => <Badge color={STATUS[j.status]?.[0]}>{STATUS[j.status]?.[1] || j.status}</Badge> },
    { key: 'processed_at', label: 'Last processed', render: (j) => fmtDateTime(j.processed_at) },
    { key: 'actions', label: '', render: (j) => (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button className="btn-ghost !px-2 !py-1" title="View details" aria-label="View details" onClick={() => open(j.id)}><Eye size={14} /></button>
        {can('data.manage') && j.status === 'completed' && <button className="btn-ghost !px-2 !py-1" title="Reprocess" aria-label="Reprocess" onClick={() => setConfirm({ kind: 'reprocess', job: j })}><RefreshCw size={14} /></button>}
        {can('data.manage') && <button className="btn-danger !px-2 !py-1" title="Delete import" aria-label="Delete import" onClick={() => setConfirm({ kind: 'delete', job: j })}><Trash2 size={14} /></button>}
      </div>) },
  ]
  return (
    <>
      <PageHeader title="Data sources & import history" subtitle="Every file uploaded to this workspace, what was imported and what was rejected."
        actions={<Link to="/data-import" className="btn-primary"><Upload size={16} />Import data</Link>} />
      <Card pad={false}><ServerTable url="/imports" columns={cols} reloadKey={key} search={false} onRowClick={(j) => open(j.id)} pageSize={15}
        empty="No files imported yet. Use Import data to upload your first dataset." /></Card>
      <Modal open={!!view} title={view?.filename} onClose={() => setView(null)} wide>
        {view && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Dataset', TYPE[view.dataset_type]], ['File size', fileSize(view.file_size)], ['Rows detected', num(view.rows_total)], ['Imported', num(view.rows_imported)], ['Valid', num(view.rows_valid)], ['Rejected', num(view.rows_rejected)],
                ['Duplicates removed', num(view.report?.duplicates_removed || 0)], ['Status', STATUS[view.status]?.[1]]].map(([a, b]) => <div key={a} className="rounded-lg bg-ink/60 p-3"><p className="text-xs text-muted">{a}</p><p className="font-medium text-slate-100">{b}</p></div>)}
            </div>
            {view.error_message && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">{view.error_message}</p>}
            {view.report?.by_code?.length > 0 && <div><p className="label">Findings</p><ul className="divide-y divide-line/60 rounded-lg border border-line">{view.report.by_code.map((c) => <li key={c.code} className="flex justify-between px-3 py-2"><span>{c.label}</span><span className="text-muted">{c.severity} · {num(c.count)}</span></li>)}</ul></div>}
            {view.mapping && <div><p className="label">Column mapping used</p><div className="flex flex-wrap gap-2">{Object.entries(view.mapping).map(([f, h]) => <span key={f} className="rounded-md border border-line px-2 py-1 text-xs"><span className="text-muted">{h}</span> → <span className="text-brand">{f}</span></span>)}</div></div>}
            <div className="flex justify-end"><button className="btn-ghost" onClick={() => download(`/imports/${view.id}/errors.csv`, null, 'errors.csv')}><Download size={15} />Download error report</button></div>
          </div>)}
      </Modal>
      <ConfirmDialog open={!!confirm} danger={confirm?.kind === 'delete'} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm?.kind === 'delete' ? 'Delete this import?' : 'Reprocess this import?'} confirmLabel={confirm?.kind === 'delete' ? 'Delete import' : 'Reprocess'}
        message={confirm?.kind === 'delete'
          ? <>This permanently deletes <b>{confirm?.job.filename}</b> and every record it created ({num(confirm?.job.rows_imported)} rows). Analysis will be recalculated. This cannot be undone.</>
          : <>The stored file is re-imported with the saved mapping. Records previously created by <b>{confirm?.job.filename}</b> are replaced.</>} />
    </>
  )
}
