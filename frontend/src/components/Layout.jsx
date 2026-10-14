import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Bell, Bot, Boxes, ClipboardList, Database, FileBarChart, FileClock, Gauge, LayoutDashboard, LineChart, LogOut, Menu, Package, Settings,
  ShoppingCart, SlidersHorizontal, Sparkles, Truck, Upload, Users, Warehouse, X, ShoppingBag, Crown, Ghost } from 'lucide-react'
import api from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { DemoBadge } from './common.jsx'

const NAV = [
  ['Overview', [['/dashboard', 'Dashboard', LayoutDashboard, 'dashboard.view'], ['/executive', 'Executive view', Crown, 'dashboard.view']]],
  ['Data', [['/data-import', 'Import data', Upload, 'data.import'], ['/data-sources', 'Import history', Database, 'data.import']]],
  ['Operations', [['/products', 'Products', Package, 'products.read'], ['/inventory', 'Inventory', Warehouse, 'inventory.read'], ['/sales', 'Sales', ShoppingCart, 'sales.read'],
    ['/purchases', 'Purchases', ShoppingBag, 'purchases.read'], ['/suppliers', 'Suppliers', Truck, 'suppliers.read']]],
  ['Intelligence', [['/dead-stock', 'Dead stock', Boxes, 'analytics.view'], ['/risk-analysis', 'Risk analysis (DSRS)', Gauge, 'analytics.view'], ['/forecasting', 'Forecasting', LineChart, 'analytics.view'],
    ['/recommendations', 'Recommendations', Sparkles, 'analytics.view'], ['/simulator', 'What-if simulator', SlidersHorizontal, 'analytics.view'], ['/copilot', 'Business Copilot', Bot, 'analytics.view']]],
  ['Insights', [['/reports', 'Reports', FileBarChart, 'reports.view'], ['/notifications', 'Notifications', Bell, 'notifications.view']]],
  ['Admin', [['/users', 'Users & roles', Users, 'users.manage'], ['/audit-log', 'Audit log', FileClock, 'audit.view'], ['/settings', 'Settings', Settings, null]]],
]

export default function Layout() {
  const { user, ws, can, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const loc = useLocation()
  const nav = useNavigate()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    const load = () => api.get('/notifications/unread-count').then((r) => setUnread(r.data.unread)).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [loc.pathname])

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Main navigation">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="rounded-lg bg-brand p-1.5 text-ink"><Ghost size={18} /></span>
        <span className="text-lg font-semibold tracking-tight text-slate-50">StockGhost</span>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map(([group, items]) => {
          const vis = items.filter(([, , , perm]) => !perm || can(perm))
          if (!vis.length) return null
          return (
            <div key={group}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">{group}</p>
              {vis.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Icon size={17} /><span className="flex-1">{label}</span>
                  {to === '/notifications' && unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
                </NavLink>))}
            </div>)
        })}
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 px-2 text-xs"><p className="truncate font-medium text-slate-200">{user?.name}</p><p className="truncate text-muted">{user?.role?.replace('_', ' ')}</p></div>
        <button className="nav-link w-full" onClick={async () => { await logout(); nav('/login') }}><LogOut size={17} />Sign out</button>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-panel lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85%] border-r border-line bg-panel animate-pop">
            <button className="absolute right-3 top-4 text-muted" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>{sidebar}
          </aside>
        </div>)}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink/85 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn-ghost !px-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">{ws?.name}</p>
            <p className="text-xs text-muted">{ws?.business_type} workspace</p>
          </div>
          {ws?.is_demo && <DemoBadge />}
          <button className="btn-ghost relative !px-2.5" onClick={() => nav('/notifications')} aria-label={`Notifications (${unread} unread)`}>
            <Bell size={17} />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
          </button>
        </header>
        {ws?.is_demo && (
          <div className="border-b border-amber-400/20 bg-amber-400/10 px-6 py-2 text-xs text-amber-200">
            {ws.is_shared_demo ? 'You are viewing the read-only DEMO workspace with sample data. ' : 'This workspace contains SAMPLE data, not your own. '}
            <NavLink to={ws.is_shared_demo ? '/register' : '/data-import'} className="font-semibold underline">{ws.is_shared_demo ? 'Create a free account' : 'Upload your own data'}</NavLink> to analyse your business.
          </div>)}
        <main className="mx-auto w-full max-w-[1400px] flex-1 animate-rise p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
