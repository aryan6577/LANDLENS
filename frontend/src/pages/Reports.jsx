import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, downloadFrom } from '../api'
import { useApp } from '../store'
import { ago, KIND_LABEL } from '../fmt'
import { Button, Card, Notice, PageHeader, Slider, Toggle } from '../components/ui'
import { ImageSelect, NeedImage } from '../components/Shared'

export default function Reports() {
  const { active, activeB, setActiveB, images, settings, toast } = useApp()
  const [withChange, setWithChange] = useState(false)
  const [withAi, setWithAi] = useState(false)
  const [k, setK] = useState(8)
  const [busy, setBusy] = useState('')
  const [aiText, setAiText] = useState('')
  const [history, setHistory] = useState([])
  const loadHistory = () => api.history().then(setHistory).catch(() => {})
  useEffect(() => { loadHistory() }, [])
  const hasAi = settings?.anthropic?.configured
  if (!active) return <><PageHeader icon={FileText} title="Reports" /><NeedImage /></>
  const b = withChange && activeB && activeB !== active.id ? activeB : ''
  const q = `k=${k}${b ? `&image_b_id=${b}` : ''}`

  const pdf = async () => {
    setBusy('pdf')
    try { await downloadFrom(`/report/${active.id}?${q}${withAi && hasAi ? '&ai_insight=1' : ''}`, 'landlens_report.pdf'); toast('Report downloaded', 'ok'); loadHistory() }
    catch (e) { toast(e.message, 'error') } finally { setBusy('') }
  }
  const csv = async () => {
    setBusy('csv')
    try { await downloadFrom(`/export/csv/${active.id}?${q}`, 'landlens.csv'); toast('CSV downloaded', 'ok') }
    catch (e) { toast(e.message, 'error') } finally { setBusy('') }
  }
  const insight = async () => {
    setBusy('ai'); setAiText('')
    try { const r = await api.insights({ image_id: active.id, image_b_id: b || null, k }); setAiText(r.text) }
    catch (e) { toast(e.message, 'error') } finally { setBusy('') }
  }
  const clear = async () => { await api.clearHistory(); loadHistory(); toast('History cleared') }

  return (
    <>
      <PageHeader icon={FileText} title="Reports" subtitle="Run the full pipeline on the active image and export a PDF report, a CSV of every number, and your analysis history." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card title="Build a report" subtitle={`Active image: ${active.name}`}>
          <div className="space-y-5">
            <Slider label="K-means clusters" min={3} max={12} value={k} onChange={setK} />
            <Toggle checked={withChange} onChange={setWithChange} label="Include change detection" hint="Adds a comparison section with a second image." />
            {withChange && (images.length > 1 ? <ImageSelect label="Compare with" value={activeB} onChange={setActiveB} exclude={active.id} /> : <Notice tone="warn">Add a second image to include change detection.</Notice>)}
            <Toggle checked={withAi} onChange={setWithAi} label="Add AI interpretation" hint={hasAi ? 'A written summary of the results, using your Anthropic key.' : 'Needs an Anthropic API key in Settings.'} />
            {withAi && !hasAi && <Notice tone="warn" title="No key yet">Paste one in <Link to="/settings" className="text-scope underline">Settings and API keys</Link>. The PDF is still created without it.</Notice>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button icon={FileDown} onClick={pdf} loading={busy === 'pdf'}>Download PDF report</Button>
              <Button variant="ghost" icon={FileSpreadsheet} onClick={csv} loading={busy === 'csv'}>Export CSV</Button>
              <Button variant="ghost" icon={Sparkles} onClick={insight} loading={busy === 'ai'} disabled={!hasAi}>Preview AI insight</Button>
            </div>
            <p className="text-xs text-dim">Building a report takes a few seconds because every analysis runs again with default settings.</p>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="What the PDF contains">
            <ol className="grid list-decimal gap-x-6 gap-y-1.5 pl-5 text-sm text-slate-300 sm:grid-cols-2">
              {['Project title and image details', 'Resolution, dimensions, channel statistics', 'Original and enhanced image', 'Land-cover segmentation and area table', 'Vegetation, water and built-up statistics', 'Largest regions with shape features', 'Change detection (optional)', 'Charts and histograms', 'Algorithms and parameters', 'AI interpretation (optional)', 'Conclusion and limitations'].map((t) => <li key={t}>{t}</li>)}
            </ol>
          </Card>
          {aiText && <Card title="AI interpretation" subtitle="Written by a language model from your numbers. Check it before you rely on it.">{aiText.split('\n\n').map((p, i) => <p key={i} className="mb-3 text-sm leading-relaxed text-slate-300 last:mb-0">{p}</p>)}</Card>}
        </div>
      </div>

      <Card className="mt-6" title={`Analysis history (${history.length})`} subtitle="Every analysis you run is logged here." actions={<>
        <a className="btn-ghost btn-sm" href={`${import.meta.env.VITE_API_URL || ''}/api/history/csv`}><FileSpreadsheet size={14} /> CSV</a>
        <Button small variant="danger" icon={Trash2} onClick={clear} disabled={!history.length}>Clear</Button></>}>
        {history.length ? (
          <div className="max-h-[420px] overflow-auto"><table className="tbl"><thead><tr><th>When</th><th>Analysis</th><th>Image</th><th>Result</th></tr></thead>
            <tbody>{history.map((s) => <tr key={s.id}><td className="whitespace-nowrap text-muted">{ago(s.when)}</td><td><span className="chip">{KIND_LABEL[s.kind] || s.kind}</span></td><td className="max-w-[200px] truncate">{s.image_name}</td>
              <td className="text-muted">{Object.entries(s.summary).slice(0, 4).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · ')}</td></tr>)}</tbody></table></div>
        ) : <p className="text-sm text-dim">Nothing yet. Run a lab and it will show up here.</p>}
      </Card>
    </>
  )
}
