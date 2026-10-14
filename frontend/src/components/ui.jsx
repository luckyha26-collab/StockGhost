import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X } from 'lucide-react'

/* ---------- formatters ---------- */
export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
export const inrShort = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr'
  if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L'
  return inr(v)
}
export const num = (n) => (Number(n) || 0).toLocaleString('en-IN')
export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')
export const today = () => new Date().toISOString().slice(0, 10)

export const LEVEL = {
  LOW: { color: '#34d399', label: 'Low' }, MEDIUM: { color: '#fbbf24', label: 'Medium' },
  HIGH: { color: '#fb923c', label: 'High' }, CRITICAL: { color: '#f43f5e', label: 'Critical' },
}
export const STATUS_COLOR = {
  'Dead Stock': '#f43f5e', 'Slow Moving': '#fbbf24', Healthy: '#34d399', 'Fast Moving': '#60a5fa', Overstock: '#8b7cf6', 'Stockout Risk': '#fb923c',
}
export const riskColor = (level) => LEVEL[level]?.color || '#8592ad'

/* ---------- small pieces ---------- */
export function Badge({ color = '#8592ad', children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color, background: color + '1f', border: `1px solid ${color}40` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}
export const RiskBadge = ({ level }) => <Badge color={riskColor(level)}>{LEVEL[level]?.label || level}</Badge>
export const StatusBadge = ({ status }) => <Badge color={STATUS_COLOR[status] || '#8592ad'}>{status}</Badge>

export function ScoreBar({ score, level }) {
  const color = riskColor(level)
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className="fill-bar h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="w-7 text-right text-sm font-semibold" style={{ color }}>{score}</span>
    </div>
  )
}

export function ScoreRing({ score, level, size = 120 }) {
  const r = 44, c = 2 * Math.PI * r, color = riskColor(level)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`DSRS ${score} out of 100, ${level}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#212d49" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 50 50)" className="fill-bar" style={{ transition: 'stroke-dasharray .7s ease' }} />
      <text x="50" y="50" textAnchor="middle" fontSize="26" fontWeight="700" fill={color}>{score}</text>
      <text x="50" y="66" textAnchor="middle" fontSize="8.5" fill="#8592ad">DSRS</text>
    </svg>
  )
}

export function Card({ title, subtitle, actions, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-100">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, icon: Icon, color = '#34d3c1' }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon && <span className="rounded-lg p-1.5" style={{ background: color + '1f', color }}><Icon size={16} /></span>}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Loader2 className="animate-spin" size={18} />{label}...</div>
)

export const ErrorBox = ({ message, onRetry }) => (
  <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
    <AlertTriangle size={18} /><span className="flex-1">{message}</span>
    {onRetry && <button className="btn-ghost" onClick={onRetry}>Retry</button>}
  </div>
)

export const Empty = ({ children = 'Nothing to show yet.' }) => (
  <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted"><Inbox size={22} />{children}</div>
)

/** Render loading / error states, then children(data). */
export function Async({ state, children }) {
  if (state.loading && !state.data) return <Spinner />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  return state.data ? children(state.data) : null
}

/* ---------- forms ---------- */
export const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
)

export function Modal({ open, title, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card animate-pop my-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl shadow-black/50`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          <button className="rounded-md p-1 text-muted hover:bg-panel2 hover:text-slate-100" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2)
    setItems((s) => [...s, { id, type, message }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200)
  }, [])
  const api = useMemo(() => {
    // callable: toast('Saved'), toast('Failed', 'error'); also toast.ok(..) / toast.err(..)
    const fn = (m, kind) => push(kind === 'error' || kind === 'err' ? 'err' : 'ok', m)
    fn.ok = (m) => push('ok', m); fn.err = (m) => push('err', m)
    return fn
  }, [push])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`animate-pop flex items-start gap-2.5 rounded-lg border p-3 text-sm shadow-xl ${t.type === 'ok' ? 'border-emerald-500/30 bg-[#0c2620] text-emerald-100' : 'border-rose-500/30 bg-[#2a1119] text-rose-100'}`}>
            {t.type === 'ok' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- data table: search, sort, pagination ---------- */
export function DataTable({ columns, rows, pageSize = 10, searchable = true, searchKeys, toolbar, empty, onRowClick, dense = false }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 1 })
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = rows || []
    if (needle) {
      out = out.filter((r) => (searchKeys || Object.keys(r)).some((k) => String(r[k] ?? '').toLowerCase().includes(needle)))
    }
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key)
      const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key])
      out = [...out].sort((a, b) => {
        const x = val(a), y = val(b)
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))) * sort.dir
      })
    }
    return out
  }, [rows, q, sort, columns, searchKeys])

  useEffect(() => setPage(0), [q, rows])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const view = filtered.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div>
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          {searchable && (
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search table" />
            </div>
          )}
          {toolbar}
          <span className="ml-auto text-xs text-muted">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead className="border-y border-line bg-ink/40">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.sortable === false ? c.label : (
                    <button className="inline-flex items-center gap-1 hover:text-slate-100" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}>
                      {c.label}{sort.key === c.key && <span aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span>}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {view.map((r, i) => (
              <tr key={r.id ?? i} className={`transition hover:bg-panel2/60 ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={`td ${dense ? '!py-2' : ''} ${c.align === 'right' ? 'text-right' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length && <Empty>{empty || 'No records match.'}</Empty>}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
          <span>Page {page + 1} of {pages}</span>
          <div className="flex gap-1">
            <button className="btn-ghost !px-2 !py-1" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <button className="btn-ghost !px-2 !py-1" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
