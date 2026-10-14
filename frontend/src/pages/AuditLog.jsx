import { useState } from 'react'
import { useApi } from '../api/client.js'
import { ServerTable, fmtDateTime } from '../components/common.jsx'
import { Badge, Card, PageHeader } from '../components/ui.jsx'

export default function AuditLog() {
  const [action, setAction] = useState('')
  const meta = useApi('/audit-log', { per_page: 1 })
  const cols = [
    { key: 'created_at', label: 'Time', render: (a) => fmtDateTime(a.created_at) }, { key: 'user_name', label: 'User' },
    { key: 'action', label: 'Action', render: (a) => <Badge color={/FAIL|DELETE/.test(a.action) ? '#f43f5e' : /LOGIN|LOGOUT/.test(a.action) ? '#60a5fa' : '#34d3c1'}>{a.action.replace(/_/g, ' ')}</Badge> },
    { key: 'detail', label: 'Detail' }, { key: 'ip', label: 'IP', render: (a) => <span className="text-xs text-muted">{a.ip}</span> },
  ]
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what in this workspace - sign-ins, imports, data changes, analysis runs, reports and settings." />
      <Card pad={false}><ServerTable url="/audit-log" params={{ action: action || undefined }} columns={cols} pageSize={50} searchPlaceholder="Search details"
        toolbar={<select className="input !w-auto !py-1.5" aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{meta.data?.actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}</select>} /></Card>
    </>
  )
}
