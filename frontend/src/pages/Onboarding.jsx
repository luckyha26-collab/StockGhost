import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Ghost, Sparkles, Upload } from 'lucide-react'
import api, { errMsg } from '../api/client.js'
import ImportWizard from '../components/ImportWizard.jsx'
import { Field, useToast } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { BUSINESS_TYPES } from './Register.jsx'

const TYPE_NOTE = {
  Retail: 'Balanced weighting across age, sales recency, velocity and demand trend.', 'E-commerce': 'Recent sales and demand trend count more.',
  Wholesale: 'Longer dead-stock window; quantity and value weigh more.', Manufacturing: 'Long inventory cycles; relaxed time thresholds.',
  Electronics: 'Demand decline and product lifecycle matter more; shorter dead-stock window.', Fashion: 'Seasonality gets extra weight (needs 12+ months of sales history).',
  Grocery: 'Expiry / shelf life is scored when expiry dates exist; very short time thresholds.', Furniture: 'Long inventory cycles are not automatically treated as dead stock.',
  Other: 'Default balanced profile. You can fine-tune thresholds in Settings.',
}

export default function Onboarding() {
  const { user, ws, loadWorkspace } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [stage, setStage] = useState('info')      // info | type | start | wizard | analyse
  const [company, setCompany] = useState(ws?.name || '')
  const [btype, setBtype] = useState(ws?.business_type || 'Retail')
  const [wstep, setWstep] = useState('upload')
  const [busy, setBusy] = useState(false)
  const n = { info: 2, type: 3, start: 4, wizard: { upload: 4, map: 5, validate: 6, done: 7 }[wstep], analyse: 8 }[stage]

  const save = async (patch, next) => {
    setBusy(true)
    try { await api.put('/workspace', patch); await loadWorkspace(); setStage(next) } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }
  const finish = async () => { await api.put('/workspace', { onboarding_completed: true }).catch(() => {}); await loadWorkspace(); nav('/dashboard') }
  const demo = async () => {
    setBusy(true)
    try { await api.post('/workspace/load-demo'); await loadWorkspace(); await api.put('/workspace', { onboarding_completed: true }); await loadWorkspace(); nav('/dashboard') }
    catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }
  if (!['OWNER', 'ADMIN'].includes(user.role)) return <Navigate to="/dashboard" replace />

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5"><span className="rounded-lg bg-brand p-1.5 text-ink"><Ghost size={18} /></span><span className="text-lg font-semibold text-slate-50">StockGhost setup</span></div>
        <button className="text-xs text-muted hover:text-slate-200" onClick={finish}>Skip for now</button>
      </div>
      <div className="mb-6"><div className="mb-1.5 flex justify-between text-xs text-muted"><span>Step {n} of 8</span><span>{['', '', 'Business information', 'Business type', 'Choose your data', 'Map columns', 'Validate & clean', 'Import', 'Run analysis'][n]}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand transition-all" style={{ width: (n / 8) * 100 + '%' }} /></div></div>

      {stage === 'info' && (
        <div className="card space-y-4 p-6"><h1 className="text-lg font-semibold text-slate-50">Tell us about your business</h1><p className="text-sm text-muted">Your account is ready (step 1). Confirm the company name for your workspace.</p>
          <Field label="Company name"><input className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <div className="flex justify-end"><button className="btn-primary" disabled={!company.trim() || busy} onClick={() => save({ name: company }, 'type')}>Continue</button></div></div>)}

      {stage === 'type' && (
        <div className="card space-y-4 p-6"><h1 className="text-lg font-semibold text-slate-50">What kind of business is it?</h1><p className="text-sm text-muted">This tunes how the risk score treats slow stock. You can change thresholds later.</p>
          <div className="grid gap-2 sm:grid-cols-3">{BUSINESS_TYPES.map((b) => (
            <button key={b} aria-pressed={btype === b} onClick={() => setBtype(b)} className={`rounded-lg border px-3 py-2.5 text-sm transition ${btype === b ? 'border-brand bg-brand/10 text-brand' : 'border-line text-slate-300 hover:bg-panel2'}`}>{b}</button>))}</div>
          <p className="rounded-lg bg-ink/60 p-3 text-xs text-muted">{TYPE_NOTE[btype]}</p>
          <div className="flex justify-between"><button className="btn-ghost" onClick={() => setStage('info')}>Back</button><button className="btn-primary" disabled={busy} onClick={() => save({ business_type: btype }, 'start')}>Continue</button></div></div>)}

      {stage === 'start' && (
        <div className="space-y-4"><h1 className="text-lg font-semibold text-slate-50">How would you like to start?</h1>
          <div className="grid gap-4 sm:grid-cols-2">
            <button className="card p-6 text-left transition hover:border-brand" onClick={() => setStage('wizard')}><span className="inline-flex rounded-lg bg-brand/10 p-2 text-brand"><Upload size={20} /></span><h2 className="mt-3 font-semibold text-slate-50">Upload my business data</h2><p className="mt-1 text-sm text-muted">Import your own CSV or Excel files. Recommended.</p></button>
            <button className="card p-6 text-left transition hover:border-brand" disabled={busy} onClick={demo}><span className="inline-flex rounded-lg bg-amber-400/10 p-2 text-amber-300"><Sparkles size={20} /></span><h2 className="mt-3 font-semibold text-slate-50">Explore demo data</h2><p className="mt-1 text-sm text-muted">Load a sample catalogue, clearly labelled DEMO DATA. You can remove it any time.</p></button>
          </div>
          <button className="btn-ghost" onClick={() => setStage('type')}>Back</button></div>)}

      {stage === 'wizard' && <ImportWizard onStep={setWstep} onDone={() => { loadWorkspace(); setStage('analyse') }} />}

      {stage === 'analyse' && (
        <div className="card flex flex-col items-center gap-3 p-8 text-center"><h1 className="text-xl font-semibold text-slate-50">Your analysis is ready</h1>
          <p className="max-w-md text-sm text-muted">Your data was imported and DSRS risk scores, forecasts and recommendations were generated from it. Add more files (sales, purchases) for better forecasts.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2"><button className="btn-primary" onClick={finish}>Open dashboard</button><button className="btn-ghost" onClick={() => setStage('wizard')}>Import another file</button></div></div>)}
    </div>
  )
}
