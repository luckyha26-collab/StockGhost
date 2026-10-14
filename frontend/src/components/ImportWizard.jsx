import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud, XCircle } from 'lucide-react'
import api, { download, errCode, errMsg, useApi } from '../api/client.js'
import { ConfirmDialog, fileSize } from './common.jsx'
import { Async, Card, ErrorBox, num, useToast } from './ui.jsx'

const HELP = {
  products: 'One row per product: SKU, name, category, prices, stock and reorder level.',
  inventory: 'Current stock levels per SKU (optionally with the last received date).',
  sales: 'One row per sale line: product/SKU, quantity, sale date and price.',
  purchases: 'One row per purchase: product/SKU, quantity, purchase date, cost and supplier.',
  suppliers: 'Supplier names with contact details and lead time.',
  combined: 'A single file with product info and sale/purchase transactions together.',
}
const STEPS = [['upload', 'Upload'], ['map', 'Map columns'], ['validate', 'Validate & clean'], ['done', 'Import']]

export default function ImportWizard({ onStep, onDone }) {
  const toast = useToast()
  const schema = useApi('/imports/schema')
  const [stage, setStageRaw] = useState('upload')
  const [dtype, setDtype] = useState('products')
  const [job, setJob] = useState(null)
  const [mapping, setMapping] = useState({})
  const [opts, setOpts] = useState({ auto_fix: false, remove_duplicates: true, exclude_outliers: false, date_format: 'auto' })
  const [res, setRes] = useState(null)         // { report, issues }
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [replace, setReplace] = useState(false)
  const [result, setResult] = useState(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)
  const setStage = useCallback((s) => { setStageRaw(s); onStep?.(s) }, [onStep])
  const sch = schema.data?.datasets.find((d) => d.type === dtype)
  const limits = schema.data?.limits

  const reset = () => { setJob(null); setMapping({}); setRes(null); setResult(null); setError(''); setStage('upload') }

  const upload = async (file) => {
    setError('')
    if (!file) return
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return setError('Unsupported file type. Please choose a .csv, .xlsx or .xls file.')
    if (limits && file.size > limits.max_mb * 1048576) return setError(`The file is larger than the ${limits.max_mb} MB limit.`)
    const fd = new FormData(); fd.append('file', file); fd.append('dataset_type', dtype)
    setBusy('upload'); setProgress(0)
    try {
      const { data } = await api.post('/imports', fd, { onUploadProgress: (e) => setProgress(e.total ? Math.round((e.loaded / e.total) * 100) : null) })
      setJob(data); setMapping(data.suggested_mapping || {}); setStage('map')
    } catch (e) { setError(errMsg(e)) } finally { setBusy(''); setProgress(null) }
  }

  const validate = async (o = opts) => {
    setError(''); setBusy('validate')
    try {
      const { data } = await api.post(`/imports/${job.id}/validate`, { mapping, options: o })
      setRes(data); setOpts(o); setStage('validate')
    } catch (e) { setError(errMsg(e)) } finally { setBusy('') }
  }

  const doImport = async (replaceDemo = replace) => {
    setError(''); setBusy('import')
    try {
      const { data } = await api.post(`/imports/${job.id}/confirm`, { mapping, options: opts, replace_demo: replaceDemo, run_analysis: true })
      setResult(data); setStage('done'); toast('Import completed. Analysis has been updated.'); onDone?.(data)
    } catch (e) {
      if (errCode(e) === 'demo_data_present') setReplace('ask'); else setError(errMsg(e))
    } finally { setBusy('') }
  }

  // header -> field, for the mapping table
  const h2f = Object.fromEntries(Object.entries(mapping).map(([f, h]) => [h, f]))
  const setField = (header, field) => {
    const next = { ...mapping }
    Object.keys(next).forEach((f) => { if (next[f] === header) delete next[f] })
    if (field) { delete next[field]; next[field] = header }
    setMapping(next)
  }
  const missingRequired = sch ? sch.fields.filter((f) => f.required && !mapping[f.name]) : []
  const missingOneOf = sch && sch.one_of.length && !sch.one_of.some((f) => mapping[f]) ? sch.one_of : []
  const canContinue = !missingRequired.length && !missingOneOf.length

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2" aria-label="Import progress">
        {STEPS.map(([k, label], i) => {
          const idx = STEPS.findIndex((s) => s[0] === stage); const state = i < idx ? 'done' : i === idx ? 'now' : 'todo'
          return <li key={k} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${state === 'now' ? 'border-brand text-brand' : state === 'done' ? 'border-brand/30 text-brand/80' : 'border-line text-muted'}`}>
            <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${state === 'todo' ? 'bg-line' : 'bg-brand text-ink'}`}>{state === 'done' ? '✓' : i + 1}</span>{label}</li>
        })}
      </ol>
      {error && <ErrorBox message={error} />}

      {stage === 'upload' && (
        <Async state={schema}>{() => (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <Card title="1. What are you uploading?" subtitle="You can import several files - start with products or inventory, then sales and purchases.">
              <div className="space-y-2" role="radiogroup" aria-label="Dataset type">
                {schema.data.datasets.map((d) => (
                  <button key={d.type} role="radio" aria-checked={dtype === d.type} onClick={() => setDtype(d.type)}
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition ${dtype === d.type ? 'border-brand bg-brand/10' : 'border-line hover:bg-panel2'}`}>
                    <p className={`text-sm font-medium ${dtype === d.type ? 'text-brand' : 'text-slate-100'}`}>{d.label}</p><p className="text-xs text-muted">{HELP[d.type]}</p></button>))}
              </div>
              <button className="mt-4 inline-flex items-center gap-1.5 text-xs text-brand hover:underline" onClick={() => download(`/imports/template/${dtype}`, null, `stockghost_${dtype}_template.csv`).catch((e) => toast(errMsg(e), 'error'))}>
                <Download size={14} />Download a {sch?.label.toLowerCase()} CSV template</button>
            </Card>
            <Card title="2. Choose your file" subtitle={`CSV, XLSX or XLS · up to ${limits.max_mb} MB · up to ${num(limits.max_rows)} rows. Column names don't need to match - you map them next.`}>
              <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]) }}
                className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-brand bg-brand/5' : 'border-line'}`}>
                {busy === 'upload' ? (<><Loader2 className="animate-spin text-brand" size={30} /><p className="text-sm text-slate-200">Uploading and checking file{progress != null ? ` - ${progress}%` : ''}...</p>
                  <div className="h-1.5 w-56 overflow-hidden rounded-full bg-line"><div className="fill-bar h-full bg-brand" style={{ width: (progress ?? 100) + '%' }} /></div></>) : (<>
                  <UploadCloud size={32} className="text-brand" /><p className="text-sm text-slate-200">Drag and drop your file here</p>
                  <p className="text-xs text-muted">or</p>
                  <button className="btn-primary" onClick={() => fileRef.current?.click()}>Browse files</button></>)}
                <input ref={fileRef} type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              <p className="mt-3 text-xs text-muted">Uploaded files are private to your workspace. Excel files: the first sheet containing data is used.</p>
            </Card>
          </div>)}</Async>)}

      {stage === 'map' && job && sch && (
        <Card title="Map your columns to StockGhost fields" subtitle={`${job.filename} · ${fileSize(job.file_size)} · ${num(job.rows_total)} rows · ${job.columns.length} columns. We matched what we could - correct anything that looks wrong.`}
          actions={<button className="btn-ghost" onClick={reset}>Choose another file</button>}>
          <div className="mb-4 flex flex-wrap gap-2">
            {sch.fields.filter((f) => f.required).map((f) => <span key={f.name} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${mapping[f.name] ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{mapping[f.name] ? '✓' : '✕'} {f.label} <span className="opacity-60">required</span></span>)}
            {sch.one_of.length > 0 && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${missingOneOf.length ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{missingOneOf.length ? '✕' : '✓'} {sch.fields.filter((f) => f.one_of).map((f) => f.label).join(' or ')} <span className="opacity-60">required</span></span>}
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px]"><thead className="bg-ink/40"><tr><th className="th">Your column</th><th className="th">Example values</th><th className="th">StockGhost field</th></tr></thead>
              <tbody className="divide-y divide-line/70">
                {job.columns.map((h, ci) => (
                  <tr key={h}><td className="td font-medium text-slate-100">{h}</td>
                    <td className="td max-w-[260px] truncate text-xs text-muted">{job.preview.slice(0, 3).map((r) => r[ci]).filter(Boolean).join(' · ') || '-'}</td>
                    <td className="td"><div className="flex items-center gap-2"><select className="input !py-1.5" aria-label={`Field for ${h}`} value={h2f[h] || ''} onChange={(e) => setField(h, e.target.value)}>
                      <option value="">- Ignore this column -</option>
                      {sch.fields.map((f) => <option key={f.name} value={f.name}>{f.label}{f.required ? ' *' : ''}</option>)}</select>
                      {h2f[h] && <span className="text-emerald-400" aria-hidden>✓</span>}</div></td></tr>))}
              </tbody></table></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{canContinue ? `${Object.keys(mapping).length} of ${job.columns.length} columns mapped.` : 'Map all required fields to continue.'}</p>
            <button className="btn-primary" disabled={!canContinue || busy === 'validate'} onClick={() => validate()}>{busy === 'validate' ? <><Loader2 className="animate-spin" size={16} />Validating...</> : 'Validate data'}</button></div>
        </Card>)}

      {stage === 'validate' && res && job && (() => {
        const r = res.report
        const errs = r.by_code.filter((c) => c.severity === 'error'), warns = r.by_code.filter((c) => c.severity === 'warning'), fixed = r.by_code.filter((c) => c.severity === 'fixed')
        return (
          <div className="space-y-5">
            <Card title="Data validation" subtitle={`${job.filename} · ${job.dataset_type}`}>
              <p className="text-2xl font-semibold text-slate-50">{num(r.rows_total)} <span className="text-base font-normal text-muted">rows detected</span></p>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="text-emerald-300"><CheckCircle2 className="mr-2 inline" size={16} />{num(r.rows_valid)} valid rows</li>
                {warns.map((c) => <li key={c.code} className="text-amber-300"><AlertTriangle className="mr-2 inline" size={16} />{num(c.count)} {c.label.toLowerCase()}</li>)}
                {r.duplicates_removed > 0 && <li className="text-amber-300"><AlertTriangle className="mr-2 inline" size={16} />{num(r.duplicates_removed)} duplicate rows removed</li>}
                {errs.map((c) => <li key={c.code} className="text-rose-300"><XCircle className="mr-2 inline" size={16} />{num(c.count)} {c.label.toLowerCase()}</li>)}
              </ul>
              {r.rows_rejected > 0 && <p className="mt-3 text-xs text-muted">Rejected rows are <b>not imported</b>. Download the error report to see each one and fix it in your file.</p>}
              <div className="mt-4 grid gap-3 rounded-lg bg-ink/60 p-4 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted">Before cleaning</p><p className="font-semibold text-slate-100">{num(r.rows_total)} rows</p></div>
                <div><p className="text-xs text-muted">After cleaning</p><p className="font-semibold text-emerald-300">{num(r.rows_valid)} rows</p></div>
                <div><p className="text-xs text-muted">Removed</p><p className="text-slate-300">{num(r.duplicates_removed)} duplicates · {num(r.rows_rejected)} invalid</p></div></div>
              {(r.products_created > 0 || r.products_updated > 0) && <p className="mt-3 text-xs text-muted">This will create {num(r.products_created)} new product{r.products_created === 1 ? '' : 's'} and update {num(r.products_updated)} existing.</p>}
              {fixed.length > 0 || r.cleaning.length > 0 ? (
                <div className="mt-3 text-xs text-muted"><p className="mb-1 font-medium text-slate-300">Cleaning applied (nothing is changed silently):</p>
                  <ul className="list-inside list-disc">{[...r.cleaning, ...fixed.filter((f) => !r.cleaning.some((c) => c.code === f.code))].map((c) => <li key={c.code}>{c.label}: {num(c.count)}</li>)}</ul></div>) : null}
            </Card>

            <Card title="Cleaning options">
              <div className="grid gap-3 sm:grid-cols-2">
                {[['auto_fix', 'Fix automatically', 'Round decimal quantities, fill missing prices from your product list, generate SKUs from product names.'],
                  ['remove_duplicates', 'Remove duplicate rows', 'Identical rows are treated as duplicates. Turn off if your file legitimately repeats identical transactions.'],
                  ['exclude_outliers', 'Exclude extreme quantities', 'Skip quantities far above typical (flagged as possible outliers).']].map(([k, label, hint]) => (
                  <label key={k} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 hover:bg-panel2"><input type="checkbox" className="mt-1 accent-[#34d3c1]" checked={!!opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
                    <span><span className="block text-sm text-slate-100">{label}</span><span className="text-xs text-muted">{hint}</span></span></label>))}
                <label className="block rounded-lg border border-line p-3"><span className="block text-sm text-slate-100">Date format</span>
                  <select className="input mt-1.5 !py-1.5" value={opts.date_format} onChange={(e) => setOpts({ ...opts, date_format: e.target.value })}><option value="auto">Detect automatically</option><option value="dayfirst">Day first (31/12/2026)</option><option value="monthfirst">Month first (12/31/2026)</option></select></label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-ghost" disabled={!!busy} onClick={() => validate({ ...opts, auto_fix: true })}>Fix Automatically</button>
                <button className="btn-ghost" disabled={!!busy} onClick={() => validate(opts)}>Re-check with these options</button>
                <button className="btn-ghost" disabled={!job.id} onClick={() => download(`/imports/${job.id}/errors.csv`, null, 'import_errors.csv').catch((e) => toast(errMsg(e), 'error'))}><Download size={15} />Download Error Report</button>
              </div>
            </Card>

            {res.issues.length > 0 && (
              <Card title="Issues found" subtitle={`Showing the first ${Math.min(res.issues.filter((i) => i.severity !== 'fixed').length, 12)} problems - the full list is in the error report.`} pad={false}>
                <div className="overflow-x-auto"><table className="w-full min-w-max"><thead className="border-y border-line bg-ink/40"><tr><th className="th">Row</th><th className="th">Field</th><th className="th">Issue</th><th className="th">Value</th></tr></thead>
                  <tbody className="divide-y divide-line/70">{res.issues.filter((i) => i.severity !== 'fixed').slice(0, 12).map((i, k) => <tr key={k}><td className="td">{i.row || '-'}</td><td className="td text-muted">{i.field || '-'}</td><td className={`td ${i.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>{i.message}</td><td className="td max-w-[200px] truncate text-muted">{i.value}</td></tr>)}</tbody></table></div></Card>)}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button className="btn-ghost" onClick={() => setStage('map')}>Back to mapping</button>
              <button className="btn-primary" disabled={!!busy || r.rows_valid === 0} onClick={() => doImport()}>{busy === 'import' ? <><Loader2 className="animate-spin" size={16} />Importing and analysing...</> : `Import ${num(r.rows_valid)} valid records`}</button></div>
            {r.rows_valid === 0 && <p className="text-sm text-rose-300">There are no valid rows to import. Fix the issues above and upload the file again.</p>}
          </div>)
      })()}

      {stage === 'done' && result && (
        <Card><div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-brand" /><h2 className="text-lg font-semibold text-slate-50">Import completed</h2>
          <p className="max-w-lg text-sm text-muted"><FileSpreadsheet className="mr-1 inline" size={14} />{result.filename}: {num(result.rows_imported)} of {num(result.rows_total)} rows imported, {num(result.rows_rejected)} rejected.
            Risk scores, forecasts and recommendations were refreshed from your data.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2"><Link to="/dashboard" className="btn-primary">Open dashboard</Link><button className="btn-ghost" onClick={reset}>Import another file</button><Link to="/data-sources" className="btn-ghost">View import history</Link></div></div></Card>)}

      <ConfirmDialog open={replace === 'ask'} danger title="Replace the sample data?" confirmLabel="Remove sample data and import" onClose={() => setReplace(false)}
        message="This workspace currently contains SAMPLE (demo) data. To avoid mixing demo and real numbers, the sample data will be removed before your file is imported."
        onConfirm={async () => { setReplace(true); await doImport(true); setReplace(false) }} />
    </div>
  )
}
