import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCircle2, Info, XCircle } from 'lucide-react'
import api, { useApi } from '../api/client.js'
import { fmtDateTime } from '../components/common.jsx'
import { Async, Card, Empty, PageHeader } from '../components/ui.jsx'

const ICON = { critical: [XCircle, '#f43f5e'], warning: [AlertTriangle, '#fbbf24'], success: [CheckCircle2, '#34d399'], info: [Info, '#60a5fa'] }

export default function Notifications() {
  const [page, setPage] = useState(1)
  const st = useApi('/notifications', { page })
  const nav = useNavigate()
  const open = async (n) => { if (!n.is_read) { await api.post(`/notifications/${n.id}/read`); st.reload() } if (n.link) nav(n.link) }
  return (
    <>
      <PageHeader title="Notifications" subtitle="High-risk products, blocked-capital changes, stock-out predictions, import results and finished reports."
        actions={<button className="btn-ghost" onClick={async () => { await api.post('/notifications/read-all'); st.reload() }}>Mark all as read</button>} />
      <Async state={st}>{(d) => (
        <Card pad={false}>{d.items.length === 0 ? <Empty><Bell size={22} />You're all caught up.</Empty> : (
          <ul className="divide-y divide-line/70">{d.items.map((n) => { const [Icon, color] = ICON[n.severity] || ICON.info; return (
            <li key={n.id}><button className={`flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-panel2/60 ${n.is_read ? 'opacity-60' : ''}`} onClick={() => open(n)}>
              <Icon size={18} style={{ color }} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-100">{n.title}{!n.is_read && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-brand" aria-label="unread" />}</p>
                <p className="mt-0.5 text-sm text-muted">{n.message}</p></div><span className="shrink-0 text-xs text-muted">{fmtDateTime(n.created_at)}</span></button></li>) })}</ul>)}
          {d.pages > 1 && <div className="flex justify-between border-t border-line px-5 py-3 text-xs text-muted"><span>Page {d.page} of {d.pages}</span><div className="flex gap-2"><button className="btn-ghost !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-ghost !py-1" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}</Card>)}</Async>
    </>
  )
}
