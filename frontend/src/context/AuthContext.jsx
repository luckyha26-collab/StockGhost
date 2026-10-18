import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ws, setWs] = useState(null)         // workspace incl. config, freshness, has_data
  const [loading, setLoading] = useState(!!localStorage.getItem('sg_token'))

  const loadWorkspace = useCallback(() => api.get('/workspace').then((r) => { setWs(r.data); return r.data }), [])

  const start = useCallback(async (payload) => {
    localStorage.setItem('sg_token', payload.access_token)
    setUser(payload.user)
    await loadWorkspace()
    return payload
  }, [loadWorkspace])

  useEffect(() => {
    if (!localStorage.getItem('sg_token')) return
    api.get('/auth/me').then((r) => { setUser(r.data.user); return loadWorkspace() })
      .catch(() => localStorage.removeItem('sg_token')).finally(() => setLoading(false))
  }, [loadWorkspace])

  useEffect(() => {
    const h = () => { setUser(null); setWs(null) }
    window.addEventListener('sg-unauthorized', h)
    return () => window.removeEventListener('sg-unauthorized', h)
  }, [])

  const value = useMemo(() => ({
    user, ws, loading, loadWorkspace,
    can: (perm) => !!user?.permissions?.includes(perm),
    login: (email, password) => api.post('/auth/login', { email, password }).then((r) => start(r.data)),
    register: (form) => api.post('/auth/register', form).then((r) => start(r.data)),
    demoLogin: () => api.post('/auth/demo-login').then((r) => start(r.data)),
    applySession: (payload) => start(payload),
    logout: async () => {
      try { await api.post('/auth/logout') } catch { /* token may already be invalid */ }
      localStorage.removeItem('sg_token'); setUser(null); setWs(null)
    },
  }), [user, ws, loading, loadWorkspace, start])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
