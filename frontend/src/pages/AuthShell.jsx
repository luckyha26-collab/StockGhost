import { Link } from 'react-router-dom'
import { Ghost } from 'lucide-react'

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="rounded-lg bg-brand p-1.5 text-ink"><Ghost size={20} /></span>
          <span className="text-xl font-semibold tracking-tight text-slate-50">StockGhost</span>
        </Link>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-slate-50">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  )
}
