import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Send, User } from 'lucide-react'
import api, { errMsg } from '../api/client.js'
import { EmptyData } from '../components/common.jsx'
import { PageHeader } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const START = ['Which products are tying up the most money?', 'Show me the top 10 dead-stock products.', 'Which products may stock out next month?', 'What categories have the most blocked capital?', 'What happens if I discount the top 5 dead-stock products by 20%?']

export default function Copilot() {
  const { ws, can } = useAuth()
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, busy])
  const ask = async (q) => {
    if (!q.trim() || busy) return
    setMsgs((m) => [...m, { role: 'user', text: q }]); setText(''); setBusy(true)
    try { const r = await api.post('/chatbot', { message: q }); setMsgs((m) => [...m, { role: 'bot', ...r.data }]) }
    catch (e) { setMsgs((m) => [...m, { role: 'bot', answer: errMsg(e), columns: [], rows: [], suggestions: [] }]) } finally { setBusy(false) }
  }
  if (ws && !ws.has_data) return <><PageHeader title="StockGhost Business Copilot" /><EmptyData title="No business data has been uploaded yet." canUpload={can('data.import')} /></>
  const last = [...msgs].reverse().find((m) => m.role === 'bot')
  return (
    <>
      <PageHeader title="StockGhost Business Copilot" subtitle="Ask about your inventory. Answers are calculated from this workspace's data only - it is a rule-based assistant, not a language model, and it won't invent numbers." />
      <div className="card flex h-[calc(100vh-17rem)] min-h-[420px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
          {msgs.length === 0 && <div className="mx-auto max-w-lg py-8 text-center"><span className="inline-flex rounded-full bg-brand/10 p-3 text-brand"><Bot size={22} /></span><p className="mt-3 text-sm text-muted">Try one of these:</p>
            <div className="mt-3 flex flex-col gap-2">{START.map((s) => <button key={s} className="btn-ghost justify-start text-left" onClick={() => ask(s)}>{s}</button>)}</div></div>}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="flex justify-end gap-2"><p className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand/15 px-4 py-2.5 text-sm text-slate-100">{m.text}</p><User size={18} className="mt-2 shrink-0 text-muted" /></div>
          ) : (
            <div key={i} className="flex gap-2"><Bot size={18} className="mt-2 shrink-0 text-brand" />
              <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-line bg-panel2 px-4 py-3 text-sm text-slate-200"><p>{m.answer}</p>
                {m.rows?.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-max text-xs"><thead><tr>{m.columns.map((c) => <th key={c} className="px-2 py-1.5 text-left font-medium text-muted">{c}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line/60">{m.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="px-2 py-1.5">{c}</td>)}</tr>)}</tbody></table></div>}
                {m.link && <Link to={m.link} className="mt-2 inline-block text-xs text-brand hover:underline">Open related page →</Link>}
                {m.source && <p className="mt-2 text-[11px] text-muted">{m.source}</p>}</div></div>))}
          {busy && <p className="text-sm text-muted">Calculating from your data...</p>}
          <div ref={end} />
        </div>
        {last?.suggestions?.length > 0 && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">{last.suggestions.map((s) => <button key={s} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-slate-100" onClick={() => ask(s)}>{s}</button>)}</div>}
        <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
          <input className="input" placeholder="Ask about your stock..." value={text} maxLength={300} onChange={(e) => setText(e.target.value)} aria-label="Your question" />
          <button className="btn-primary" disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button></form>
      </div>
    </>
  )
}
