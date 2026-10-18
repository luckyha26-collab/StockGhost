import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { Spinner } from './components/ui.jsx'
import { useAuth } from './context/AuthContext.jsx'

const L = (f) => lazy(f)
const Landing = L(() => import('./pages/Landing.jsx'))
const Login = L(() => import('./pages/Login.jsx'))
const Register = L(() => import('./pages/Register.jsx'))
const ForgotPassword = L(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword = L(() => import('./pages/ResetPassword.jsx'))
const Onboarding = L(() => import('./pages/Onboarding.jsx'))
const Dashboard = L(() => import('./pages/Dashboard.jsx'))
const Executive = L(() => import('./pages/Executive.jsx'))
const DataImport = L(() => import('./pages/DataImport.jsx'))
const DataSources = L(() => import('./pages/DataSources.jsx'))
const Products = L(() => import('./pages/Products.jsx'))
const Inventory = L(() => import('./pages/Inventory.jsx'))
const Sales = L(() => import('./pages/Sales.jsx'))
const Purchases = L(() => import('./pages/Purchases.jsx'))
const Suppliers = L(() => import('./pages/Suppliers.jsx'))
const DeadStock = L(() => import('./pages/DeadStock.jsx'))
const RiskAnalysis = L(() => import('./pages/RiskAnalysis.jsx'))
const Forecasting = L(() => import('./pages/Forecasting.jsx'))
const Recommendations = L(() => import('./pages/Recommendations.jsx'))
const Simulator = L(() => import('./pages/Simulator.jsx'))
const Copilot = L(() => import('./pages/Copilot.jsx'))
const Reports = L(() => import('./pages/Reports.jsx'))
const Notifications = L(() => import('./pages/Notifications.jsx'))
const Users = L(() => import('./pages/Users.jsx'))
const SettingsPage = L(() => import('./pages/Settings.jsx'))
const AuditLog = L(() => import('./pages/AuditLog.jsx'))

function Protected({ perm, children }) {
  const { user, loading, can } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner label="Loading your workspace" />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (perm && !can(perm)) return <Navigate to="/dashboard" replace />
  return children
}

function PublicOnly({ children }) {
  const { user, ws, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return children
  if (!ws) return <Spinner label="Opening your workspace" />       // workspace is still loading right after sign-in
  return <Navigate to={user.role === 'OWNER' && !ws.onboarding_completed && !ws.has_data ? '/onboarding' : '/dashboard'} replace />
}

export default function App() {
  const P = (perm, el) => <Protected perm={perm}>{el}</Protected>
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/onboarding" element={P(null, <Onboarding />)} />
        <Route element={P(null, <Layout />)}>
          <Route path="/dashboard" element={P('dashboard.view', <Dashboard />)} />
          <Route path="/executive" element={P('dashboard.view', <Executive />)} />
          <Route path="/data-import" element={P('data.import', <DataImport />)} />
          <Route path="/data-sources" element={P('data.import', <DataSources />)} />
          <Route path="/products" element={P('products.read', <Products />)} />
          <Route path="/inventory" element={P('inventory.read', <Inventory />)} />
          <Route path="/sales" element={P('sales.read', <Sales />)} />
          <Route path="/purchases" element={P('purchases.read', <Purchases />)} />
          <Route path="/suppliers" element={P('suppliers.read', <Suppliers />)} />
          <Route path="/dead-stock" element={P('analytics.view', <DeadStock />)} />
          <Route path="/risk-analysis" element={P('analytics.view', <RiskAnalysis />)} />
          <Route path="/forecasting" element={P('analytics.view', <Forecasting />)} />
          <Route path="/recommendations" element={P('analytics.view', <Recommendations />)} />
          <Route path="/simulator" element={P('analytics.view', <Simulator />)} />
          <Route path="/copilot" element={P('analytics.view', <Copilot />)} />
          <Route path="/reports" element={P('reports.view', <Reports />)} />
          <Route path="/notifications" element={P('notifications.view', <Notifications />)} />
          <Route path="/users" element={P('users.manage', <Users />)} />
          <Route path="/audit-log" element={P('audit.view', <AuditLog />)} />
          <Route path="/settings" element={P(null, <SettingsPage />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
