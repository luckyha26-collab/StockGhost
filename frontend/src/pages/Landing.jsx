import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Boxes, FileUp, Gauge, Ghost, LineChart, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { errMsg } from '../api/client.js'

const FEATURES = [
  [FileUp, 'Bring your own data', 'Upload CSV or Excel files. StockGhost maps your column names, validates every row and shows exactly what was cleaned or rejected.'],
  [Gauge, 'Dead-stock risk score (DSRS)', 'A transparent 0-100 score per product, tuned to your business type, with a plain-language explanation of why.'],
  [LineChart, 'Demand forecasting', 'Statistical forecasts with measured back-test accuracy. When history is too short, StockGhost says so instead of guessing.'],
  [Boxes, 'Blocked-capital tracking', 'See how much cash is stuck in slow and dead stock - by category, supplier, warehouse and product.'],
  [Sparkles, 'Actionable recommendations', 'Clearance, promotion, reorder or stop buying - each with the reasons and clearly labelled estimates.'],
  [SlidersHorizontal, 'What-if simulator', 'Try discounts and demand changes and see projected blocked capital before you commit.'],
  [BarChart3, 'Reports & exports', 'Inventory, risk, sales, purchase and executive reports as CSV, Excel or PDF.'],
  [ShieldCheck, 'Private by design', 'Every company gets an isolated workspace with role-based access. Your data is never shared across tenants.'],
]
const STEPS = ['Create your account & workspace', 'Upload sales, inventory or purchase files', 'Review the column mapping and validation report', 'Get risk scores, forecasts and recommendations']

export default function Landing() {
  const { demoLogin, user } = useAuth()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  const demo = async () => { try { await demoLogin(); nav('/dashboard') } catch (x) { setErr(errMsg(x)) } }
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5"><span className="rounded-lg bg-brand p-1.5 text-ink"><Ghost size={18} /></span><span className="text-lg font-semibold text-slate-50">StockGhost</span></div>
        <nav className="flex items-center gap-2">
          {user ? <Link className="btn-primary" to="/dashboard">Open dashboard</Link> : <><Link className="btn-ghost" to="/login">Sign in</Link><Link className="btn-primary" to="/register">Get started</Link></>}
        </nav>
      </header>
      <section className="mx-auto max-w-4xl px-5 pb-16 pt-12 text-center sm:pt-20">
        <p className="mx-auto mb-5 inline-block rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">Inventory intelligence for growing businesses</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-5xl">Find the cash <span className="text-brand">hiding in your stockroom</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">Upload your own sales and inventory data. StockGhost detects dead stock, quantifies blocked capital, forecasts demand and tells you what to do next.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/register" className="btn-primary !px-5 !py-2.5">Create free workspace <ArrowRight size={16} /></Link>
          <button className="btn-ghost !px-5 !py-2.5" onClick={demo}>Explore demo data</button>
        </div>
        {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, t, d]) => (
            <div key={t} className="card p-5"><span className="inline-flex rounded-lg bg-brand/10 p-2 text-brand"><Icon size={18} /></span>
              <h3 className="mt-3 text-sm font-semibold text-slate-100">{t}</h3><p className="mt-1.5 text-sm text-muted">{d}</p></div>))}
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-5 pb-20">
        <h2 className="mb-6 text-center text-2xl font-semibold text-slate-50">How it works</h2>
        <ol className="space-y-3">{STEPS.map((s, i) => (
          <li key={s} className="card flex items-center gap-4 p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-ink">{i + 1}</span><span className="text-sm text-slate-200">{s}</span></li>))}</ol>
        <p className="mt-6 text-center text-xs text-muted">DSRS is rule-based analytics and forecasts are statistical - StockGhost does not claim machine-learning predictions it does not make.</p>
      </section>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">© {new Date().getFullYear()} StockGhost</footer>
    </div>
  )
}
