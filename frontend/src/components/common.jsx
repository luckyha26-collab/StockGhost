import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Database, Search, Upload } from 'lucide-react'
import api, { errMsg } from '../api/client.js'
import { Empty, ErrorBox, Modal, Spinner } from './ui.jsx'

export function useDebounce(value, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** Backend timestamps are UTC; naive strings get a Z so they render in the viewer's local time. */
export const fmtDateTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}
export const fileSize = (b) => (!b ? '-' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)

export const DemoBadge = () => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-300" title="This workspace contains sample data, not real company data">
    <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />DEMO DATA
  </span>
)

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-ink p-0.5">
      {tabs.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${value === v ? 'bg-brand/15 text-brand' : 'text-muted hover:text-slate-100'}`}>{label}</button>
      ))}
    </div>
  )
}

/** The standard "no data" state: no fake numbers, just a path to upload. */
export function EmptyData({ title = 'No inventory data available.', text = 'Upload your business dataset to begin analysis.', canUpload = true }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="rounded-full bg-brand/10 p-3 text-brand"><Database size={24} /></span>
      <h2 className="text-base font-semibold text-slate-50">{title}</h2>
      <p className="max-w-md text-sm text-muted">{text}</p>
      {canUpload
        ? <Link to="/data-import" className="btn-primary mt-1"><Upload size={16} />Upload Data</Link>
        : <p className="text-xs text-muted">Ask a workspace owner or admin to upload data.</p>}
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, requireText, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState('')
  useEffect(() => { if (open) setTyped('') }, [open])
  const go = async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }
  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onClose}>
      <div className="space-y-4 text-sm text-slate-300">
        <div>{message}</div>
        {requireText && (
          <label className="block"><span className="label">Type <b className="text-slate-100">{requireText}</b> to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>)}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={go} disabled={busy || (requireText && typed !== requireText)}>{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Search-as-you-type product selector. value = product object | null. */
export function ProductPicker({ value, onChange, placeholder = 'Search product name or SKU' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const dq = useDebounce(q, 250)
  const box = useRef(null)
  useEffect(() => { if (open) api.get('/products/options', { params: { q: dq } }).then((r) => setItems(r.data)).catch(() => setItems([])) }, [dq, open])
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={box}>
      <input className="input" aria-label="Product" placeholder={placeholder} value={open ? q : value ? `${value.name} (${value.sku || ''})`.replace(' ()', '') : ''}
        onFocus={() => { setOpen(true); setQ('') }} onChange={(e) => setQ(e.target.value)} />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-panel shadow-xl">
          {!items.length && <li className="px-3 py-2 text-sm text-muted">No matching products.</li>}
          {items.map((p) => (
            <li key={p.id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-panel2"
              onClick={() => { onChange(p); setOpen(false) }}><span><span className="text-slate-100">{p.name}</span> <span className="text-xs text-muted">{p.sku}</span></span>
              <span className="text-xs text-muted">{p.quantity} in stock</span></button></li>))}
        </ul>)}
    </div>
  )
}

/**
 * Server-side table: pagination, sorting and search are done by the API (never loads all rows).
 * columns: {key,label,render,align,sort?:'apiSortKey'}   onData(data) receives each response (totals, summaries...).
 */
export function ServerTable({ url, params, columns, pageSize = 25, search = true, searchPlaceholder = 'Search...', toolbar, reloadKey, onData, onRowClick, empty }) {
  const [q, setQ] = useState('')
  const dq = useDebounce(q)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [st, setSt] = useState({ data: null, loading: true, error: null })
  const pkey = JSON.stringify(params || {})
  useEffect(() => { setPage(1) }, [dq, pkey, sort.key, sort.dir, url])
  useEffect(() => {
    let live = true
    setSt((s) => ({ ...s, loading: true, error: null }))
    api.get(url, { params: { ...(params || {}), q: dq || undefined, page, per_page: pageSize, sort: sort.key || undefined, dir: sort.key ? sort.dir : undefined } })
      .then((r) => { if (live) { setSt({ data: r.data, loading: false, error: null }); onData?.(r.data) } })
      .catch((e) => live && setSt({ data: null, loading: false, error: errMsg(e) }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pkey, dq, page, pageSize, sort.key, sort.dir, reloadKey])
  const d = st.data
  const rows = d?.items || []
  return (
    <div>
      {(search || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          {search && (
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </div>)}
          {toolbar}
          {d && <span className="ml-auto text-xs text-muted">{d.total?.toLocaleString('en-IN')} record{d.total === 1 ? '' : 's'}</span>}
        </div>)}
      {st.error && <div className="px-5 pb-4"><ErrorBox message={st.error} /></div>}
      <div className={`overflow-x-auto ${st.loading && d ? 'opacity-60' : ''}`}>
        <table className="w-full min-w-max">
          <thead className="border-y border-line bg-ink/40"><tr>
            {columns.map((c) => (
              <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`} aria-sort={sort.key === c.sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sort ? <button className="inline-flex items-center gap-1 hover:text-slate-100" onClick={() => setSort((s) => ({ key: c.sort, dir: s.key === c.sort && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                  {c.label}{sort.key === c.sort && <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>}</button> : c.label}
              </th>))}
          </tr></thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((r, i) => (
              <tr key={r.id ?? r.product_id ?? i} className={`transition hover:bg-panel2/60 ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>))}
          </tbody>
        </table>
        {st.loading && !d && <Spinner />}
        {!st.loading && !rows.length && !st.error && <Empty>{empty || 'No records match.'}</Empty>}
      </div>
      {d && d.pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
          <span>Page {d.page} of {d.pages}</span>
          <div className="flex gap-1">
            <button className="btn-ghost !px-2 !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <button className="btn-ghost !px-2 !py-1" disabled={page >= d.pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>)}
    </div>
  )
}
