import { useState } from 'react'
import { Layers, Play } from 'lucide-react'
import { api, downloadDataUrl } from '../api'
import { useApp } from '../store'
import { useRunner } from '../hooks'
import { CLASS_COLORS, num, pct } from '../fmt'
import { Button, Card, ImagePanel, Legend, Notice, PageHeader, Segmented, Slider, Stat, Tabs } from '../components/ui'
import { ErrorNote, NeedImage } from '../components/Shared'
import { Bars, Donut } from '../components/charts'
import CompareSlider from '../components/CompareSlider'
import ComponentsTable from '../components/ComponentsTable'

const ORDER = ['Vegetation', 'Water', 'Built-up', 'Bare land']
const KEYS = { Vegetation: 'vegetation', Water: 'water', 'Built-up': 'built_up', 'Bare land': 'bare' }

export default function LandCover() {
  const { active, settings } = useApp()
  const [k, setK] = useState(8)
  const [morph, setMorph] = useState(5)
  const [minArea, setMinArea] = useState(40)
  const [gsd, setGsd] = useState('')
  const [view, setView] = useState('overlay')
  const [tab, setTab] = useState('Vegetation')
  const r = useRunner((b, s) => api.landcover(b, s))
  if (!active) return <><PageHeader icon={Layers} title="Land Cover Lab" /><NeedImage /></>
  const d = r.data
  const run = () => r.run({ image_id: active.id, k, morph, min_area: minArea, gsd: gsd ? Number(gsd) : null })
  const stats = d && ORDER.map((n) => d.stats.find((s) => s.name === n))

  return (
    <>
      <PageHeader icon={Layers} title="Land Cover Lab" subtitle="K-means clusters pixels by colour and texture, then rules name each cluster as vegetation, water, built-up or bare land. Morphology cleans the result.">
        <Button icon={Play} onClick={run} loading={r.loading}>Run classification</Button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
        <div className="space-y-5">
          <Card title="Parameters">
            <div className="space-y-5">
              <Slider label="K-means clusters (k)" min={3} max={12} value={k} onChange={setK} hint="8 works well for most scenes. Low k can merge classes." />
              <Slider label="Morphology kernel" min={1} max={15} step={2} value={morph} onChange={setMorph} format={(v) => `${v} px`} hint="Opening then closing removes specks and fills holes." />
              <Slider label="Minimum region size" min={0} max={400} step={10} value={minArea} onChange={setMinArea} format={(v) => `${v} px`} />
              <label className="block"><span className="label">Metres per pixel</span>
                <input className="input" type="number" min="0.01" step="any" placeholder={`Default: ${settings?.gsd_m ?? 10}`} value={gsd} onChange={(e) => setGsd(e.target.value)} /></label>
            </div>
          </Card>
          <Notice tone="warn" title="Estimates only">Labels come from colour and texture rules, not a trained model. Shadows and dark forest can look like water.</Notice>
        </div>

        <div className="space-y-6">
          <ErrorNote error={r.error} />
          {!d && !r.loading && <Card><p className="py-10 text-center text-muted">Press <b className="text-white">Run classification</b> to segment {active.name}.</p></Card>}
          {(d || r.loading) && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented value={view} onChange={setView} options={[{ value: 'overlay', label: 'Overlay' }, { value: 'segmentation', label: 'Segmentation map' }, { value: 'swipe', label: 'Swipe' }, { value: 'boxes', label: 'Regions' }]} />
                <Legend items={ORDER.map((n) => ({ name: n, color: CLASS_COLORS[n] }))} />
              </div>
              {view === 'swipe' && d ? <CompareSlider a={d.images.original} b={d.images.segmentation} labelA="Original" labelB="Classified" />
                : <div className="grid gap-4 lg:grid-cols-2">
                  <ImagePanel title="Original" src={d?.images.original} loading={r.loading} />
                  <ImagePanel title={{ overlay: 'Classified overlay', segmentation: 'Land-cover map', boxes: 'Largest regions' }[view] || 'Result'} src={d?.images[view === 'swipe' ? 'overlay' : view]} loading={r.loading} />
                </div>}
            </>
          )}

          {d && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {stats.map((s) => <Stat key={s.name} label={s.name} value={pct(s.pct)} color={s.color} sub={`${num(s.area_ha, 1)} ha · ${num(s.pixels)} px`} />)}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Area distribution"><Donut data={stats.map((s) => ({ name: s.name, value: s.pct, color: s.color }))} /></Card>
                <Card title="Coverage by class"><Bars data={stats.map((s) => ({ name: s.name, pct: +s.pct.toFixed(2) }))} keys={[{ key: 'pct', name: 'Coverage', color: '#22d3ee' }]} /></Card>
              </div>
              <Card title="Class masks" subtitle="Binary masks you can download for your report.">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {ORDER.map((n) => (
                    <figure key={n} className="overflow-hidden rounded-xl border border-white/10">
                      <img src={d.images.masks[KEYS[n]]} alt={`${n} mask`} className="w-full bg-black" />
                      <figcaption className="flex items-center justify-between px-3 py-2 text-xs"><span className="flex items-center gap-1.5 text-slate-200"><span className="h-2 w-2 rounded-sm" style={{ background: CLASS_COLORS[n] }} />{n}</span>
                        <button className="text-scope hover:underline" onClick={() => downloadDataUrl(d.images.masks[KEYS[n]], `mask_${KEYS[n]}.png`)}>Download</button></figcaption>
                    </figure>
                  ))}
                </div>
              </Card>
              <Card title="K-means clusters" subtitle="Each colour cluster and the class the rules gave it.">
                <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Cluster</th><th>Mean colour</th><th>Named as</th><th>Share</th><th>Excess-Green</th><th>Blue index</th><th>Saturation</th><th>Texture</th></tr></thead>
                  <tbody>{d.clusters.map((c) => (
                    <tr key={c.cluster}><td>{c.cluster}</td><td><span className="inline-block h-5 w-10 rounded align-middle ring-1 ring-white/20" style={{ background: c.color }} /></td>
                      <td><span className="chip"><span className="h-2 w-2 rounded-sm" style={{ background: CLASS_COLORS[c.label] }} />{c.label}</span></td>
                      <td>{pct(c.pct)}</td><td>{c.exg.toFixed(3)}</td><td>{c.wi.toFixed(3)}</td><td>{c.sat.toFixed(2)}</td><td>{c.tex.toFixed(2)}</td></tr>
                  ))}</tbody></table></div>
              </Card>
              <Card title="Connected regions" subtitle="Largest regions per class, with shape descriptors.">
                <Tabs value={tab} onChange={setTab} tabs={['Vegetation', 'Water', 'Built-up'].map((n) => ({ value: n, label: `${n} (${d.components[n].count})` }))} />
                <ComponentsTable className="mt-3" rows={d.components[tab].rows} />
              </Card>
              <div className="flex justify-end"><Button variant="ghost" onClick={() => downloadDataUrl(d.images.segmentation, 'land_cover_map.png')}>Download land-cover map</Button></div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
