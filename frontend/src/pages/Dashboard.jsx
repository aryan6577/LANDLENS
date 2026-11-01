import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, FlaskConical, ImageIcon, UploadCloud } from 'lucide-react'
import { api, imgUrl } from '../api'
import { useApp } from '../store'
import { ago, KIND_LABEL, pct } from '../fmt'
import { Button, Card, PageHeader, Stat } from '../components/ui'
import { Donut } from '../components/charts'

function summaryText(s) {
  return Object.entries(s.summary || {}).slice(0, 3).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · ')
}

export default function Dashboard() {
  const { images, setActiveId, refreshImages, toast } = useApp()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  useEffect(() => { api.dashboard().then(setD).catch((e) => toast(e.message, 'error')) }, [images.length, toast])
  const L = d?.latest
  const donut = L ? [
    { name: 'Vegetation', value: L.vegetation || 0, color: '#34d399' }, { name: 'Water', value: L.water || 0, color: '#38a0fd' },
    { name: 'Built-up', value: L.built_up || 0, color: '#f97316' }, { name: 'Bare land', value: L.bare || 0, color: '#c9a86a' },
  ].filter((x) => x.value > 0) : []
  const sample = async () => {
    try { const m = await api.loadSample('delta_2024'); await refreshImages(); setActiveId(m.id); nav('/landcover') } catch (e) { toast(e.message, 'error') }
  }
  return (
    <>
      <PageHeader icon={Activity} title="Dashboard" subtitle="Live numbers from your own analyses. Nothing here is hardcoded.">
        <Button icon={UploadCloud} onClick={() => nav('/upload')}>Quick upload</Button>
        <Button variant="ghost" icon={FlaskConical} onClick={sample}>Load sample</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Images analysed" value={d ? images.length : '-'} />
        <Stat label="Analysis sessions" value={d?.sessions ?? '-'} />
        <Stat label="Vegetation" value={pct(L?.vegetation)} color="#34d399" sub="latest analysis" />
        <Stat label="Water" value={pct(L?.water)} color="#38a0fd" sub="latest analysis" />
        <Stat label="Built-up" value={pct(L?.built_up)} color="#f97316" sub="latest analysis" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Latest land cover" subtitle={L?.image_name ? `From ${L.image_name}` : 'Run the Land Cover Lab to fill this in'}>
          {donut.length ? <Donut data={donut} /> : <div className="grid h-[240px] place-items-center text-sm text-dim">No analysis yet</div>}
        </Card>
        <Card title="Recent projects" subtitle="Your image library" actions={<Link to="/upload" className="text-xs text-scope hover:underline">Manage</Link>}>
          {images.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.slice(0, 6).map((i) => (
                <button key={i.id} onClick={() => { setActiveId(i.id); nav('/landcover') }} className="group overflow-hidden rounded-xl border border-white/10 text-left transition hover:border-scope/50">
                  <img src={imgUrl(i.id, { thumb: true })} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="truncate px-3 py-2 text-xs text-slate-300 group-hover:text-white">{i.name}</div>
                </button>
              ))}
            </div>
          ) : <div className="grid h-[200px] place-items-center text-sm text-dim"><div className="text-center"><ImageIcon className="mx-auto mb-2" />No images yet</div></div>}
        </Card>
      </div>

      <Card title="Recent activity" className="mt-6" subtitle="Newest first">
        {d?.recent?.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>When</th><th>Analysis</th><th>Image</th><th>Result</th></tr></thead>
              <tbody>
                {d.recent.map((s) => (
                  <tr key={s.id}><td className="whitespace-nowrap text-muted">{ago(s.when)}</td><td><span className="chip">{KIND_LABEL[s.kind] || s.kind}</span></td>
                    <td className="max-w-[220px] truncate">{s.image_name}</td><td className="text-muted">{summaryText(s)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-dim">Run any lab and it will appear here.</p>}
      </Card>
    </>
  )
}
