import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { errMsg } from '../api/client.js'
import { ConfirmDialog, Tabs } from '../components/common.jsx'
import { Card, Field, PageHeader, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { BUSINESS_TYPES, PasswordRules } from './Register.jsx'

const WL = { stock_age: 'Stock age', last_sale: 'Days since last sale', sales_frequency: 'Sales velocity / cover', inventory_value: 'Inventory value', quantity: 'Quantity vs reorder level', demand_trend: 'Demand trend', seasonality: 'Seasonality (needs 12+ months of sales)', expiry: 'Expiry / shelf life (needs expiry dates)' }

export default function Settings() {
  const { user, ws, can, loadWorkspace, applySession } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState('profile')
  const mgr = can('settings.manage')
  const tabs = [['profile', 'Profile'], ...(mgr ? [['workspace', 'Workspace'], ['risk', 'Risk configuration'], ['data', 'Data']] : [])]
  const [prof, setProf] = useState({ name: user.name, email: user.email })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [wsf, setWsf] = useState({ name: ws?.name || '', business_type: ws?.business_type || 'Retail' })
  const [cfg, setCfg] = useState(null)
  const [confirm, setConfirm] = useState(null)
  useEffect(() => { if (ws?.config) setCfg(JSON.parse(JSON.stringify(ws.config))) }, [ws])
  const run = async (fn, ok) => { try { await fn(); toast(ok); await loadWorkspace() } catch (e) { toast(errMsg(e), 'error') } }
  const saveCfg = () => run(async () => { await api.put('/workspace', { config: cfg }); await api.post('/analytics/refresh') }, 'Settings saved and analysis refreshed.')
  const setW = (k, v) => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: Number(v) } })
  return (
    <>
      <PageHeader title="Settings" />
      <div className="mb-5"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      {tab === 'profile' && <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Your profile"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => api.put('/auth/me', prof), 'Profile updated.') }}>
          <Field label="Name"><input className="input" value={prof.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} /></Field><Field label="Email"><input className="input" type="email" value={prof.email} onChange={(e) => setProf({ ...prof, email: e.target.value })} /></Field>
          <p className="text-xs text-muted">Role: {user.role.replace('_', ' ')}</p><button className="btn-primary">Save profile</button></form></Card>
        <Card title="Change password"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api.post('/auth/change-password', pw); await applySession(r.data); setPw({ current_password: '', new_password: '' }) }, 'Password changed.') }}>
          <Field label="Current password"><input className="input" type="password" required autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password"><input className="input" type="password" required autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /><PasswordRules value={pw.new_password} /></Field><button className="btn-primary">Update password</button></form></Card></div>}
      {tab === 'workspace' && <Card title="Workspace" className="max-w-xl"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => api.put('/workspace', wsf), 'Workspace updated.') }}>
        <Field label="Company name"><input className="input" required value={wsf.name} onChange={(e) => setWsf({ ...wsf, name: e.target.value })} /></Field>
        <Field label="Business type" hint="Changing the type resets risk thresholds to that type's defaults."><select className="input" value={wsf.business_type} onChange={(e) => setWsf({ ...wsf, business_type: e.target.value })}>{BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <button className="btn-primary">Save</button></form></Card>}
      {tab === 'risk' && cfg && <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Thresholds" subtitle={`Defaults for ${ws.business_type}. Saving re-runs the analysis.`}><div className="space-y-4">
          {[['blocked_threshold', 'Blocked-capital threshold (DSRS above)', 1, 99], ['dead_days', 'Dead stock after (days without sale)', 1, 3650], ['overstock_cover_days', 'Overstock when cover exceeds (days)', 1, 3650], ['stockout_cover_days', 'Stockout lead-time buffer (days)', 1, 365], ['forecast_days', 'Forecast period (days)', 7, 365]].map(([k, l, mn, mx]) => (
            <Field key={k} label={l} hint={`Default: ${ws.defaults[k]}`}><input className="input" type="number" min={mn} max={mx} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} /></Field>))}
          <Field label="Analysis reference date" hint="Use 'latest data' when analysing historical files."><select className="input" value={cfg.as_of} onChange={(e) => setCfg({ ...cfg, as_of: e.target.value })}><option value="today">Today</option><option value="latest_data">Latest date in my data</option></select></Field></div></Card>
        <Card title="DSRS factor weights" subtitle="Relative importance. Factors with no data are skipped and the rest re-weighted."><div className="space-y-3">
          {Object.keys(WL).map((k) => <Field key={k} label={`${WL[k]}: ${cfg.weights[k] ?? 0}`}><input type="range" min="0" max="40" value={cfg.weights[k] ?? 0} onChange={(e) => setW(k, e.target.value)} className="w-full accent-teal-400" /></Field>)}
          <div className="flex gap-2 pt-2"><button className="btn-primary" onClick={saveCfg}>Save & re-run analysis</button><button className="btn-ghost" onClick={() => setCfg(JSON.parse(JSON.stringify(ws.defaults)))}>Reset to {ws.business_type} defaults</button></div></div></Card></div>}
      {tab === 'data' && <div className="max-w-2xl space-y-5">
        <Card title="Sample data" subtitle="Load a demonstration catalogue (clearly labelled DEMO DATA) - only into an empty workspace."><button className="btn-ghost" disabled={ws.has_data} onClick={() => run(() => api.post('/workspace/load-demo'), 'Sample data loaded.')}>Load sample data</button>{ws.has_data && <p className="mt-2 text-xs text-muted">This workspace already has data.</p>}</Card>
        {can('workspace.delete_data') && <Card title="Delete all business data" subtitle="Removes every product, sale, purchase, supplier, import and analysis from this workspace. Users, settings and the audit log are kept."><button className="btn-danger" onClick={() => setConfirm(true)}>Delete all data</button></Card>}</div>}
      <ConfirmDialog open={!!confirm} danger requireText={ws?.name} title="Delete all business data?" confirmLabel="Permanently delete" onClose={() => setConfirm(null)}
        message="This cannot be undone. All products, sales, purchases, inventory history, imports and analysis results for this workspace will be erased." onConfirm={async () => { await run(() => api.delete('/workspace/data'), 'All business data deleted.'); setConfirm(null); nav('/dashboard') }} />
    </>
  )
}
