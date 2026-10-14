import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('sg_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  (r) => {
    // Unwrap the {success, data} envelope so callers receive the payload directly.
    if (r.data && typeof r.data === 'object' && r.data.success === true && !(r.data instanceof Blob)) r.data = r.data.data
    return r
  },
  async (err) => {
    const url = err.config?.url || ''
    const authCall = /\/auth\/(login|register|forgot-password|reset-password|demo-login)/.test(url)
    if (err.response?.status === 401 && !authCall) {
      localStorage.removeItem('sg_token')
      window.dispatchEvent(new Event('sg-unauthorized'))
    }
    if (err.response?.data instanceof Blob) {                      // error bodies of blob downloads
      try { err.response.data = JSON.parse(await err.response.data.text()) } catch { /* ignore */ }
    }
    return Promise.reject(err)
  }
)

export const errMsg = (e) => e?.response?.data?.message || (e?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check your connection.' : 'Something went wrong. Please try again.')
export const errCode = (e) => e?.response?.data?.code

/** GET helper: const { data, loading, error, reload } = useApi('/products', params) */
export function useApi(url, params, enabled = true) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null })
  const key = JSON.stringify(params || {})
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve()
    setState((s) => ({ ...s, loading: true, error: null }))
    return api.get(url, { params: params || undefined })
      .then((r) => setState({ data: r.data, loading: false, error: null }))
      .catch((e) => setState({ data: null, loading: false, error: errMsg(e) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, enabled])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

/** Download a file from an authenticated endpoint. */
export async function download(url, params, fallbackName = 'download') {
  const r = await api.get(url, { params, responseType: 'blob' })
  const cd = r.headers['content-disposition'] || ''
  const m = /filename="?([^";]+)"?/.exec(cd)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(r.data)
  a.download = m ? m[1] : fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export default api
