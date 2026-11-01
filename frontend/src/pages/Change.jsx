import { useEffect, useState } from 'react'
import { GitCompareArrows, Play } from 'lucide-react'
import { api, imgUrl } from '../api'
import { useApp } from '../store'
import { useRunner } from '../hooks'
import { CLASS_COLORS, num, pct } from '../fmt'
import { Button, Card, ImagePanel, Notice, PageHeader, Segmented, Select, Slider, Stat, Toggle } from '../components/ui'
import { ErrorNote, ImageSelect, NeedImage } from '../components/Shared'
import { Bars } from '../components/charts'
import CompareSlider from '../components/CompareSlider'
import ComponentsTable from '../components/ComponentsTable'

export default function Change() {
  const { active, images, activeB, setActiveB } = useApp()
  const [interp, setInterp] = useState('bilinear')
  const [register, setRegister] = useState(true)
  const [match, setMatch] = useState(true)
  const [mode, setMode] = useState('otsu')
  const [thr, setThr] = useState(25)
  const [morph, setMorph] = useState(5)
  const [minArea, setMinArea] = useState(60)
  const [view, setView] = useState('swipe')
  const r = useRunner((b, s) => api.change(b, s))

  useEffect(() => { if (active && images.length > 1 && (!activeB || activeB === active.id)) setActiveB(images.find((i) => i.id !== active.id).id) }, [active?.id, images.length]) // eslint-disable-line

  if (!active) return <><PageHeader icon={GitCompareArrows} title="Change Detection" /><NeedImage /></>
  if (images.length < 2) return <><PageHeader icon={GitCompareArrows} title="Change Detection" subtitle="Compare two images of the same area captured on different dates." /><NeedImage /><p className="mt-4 text-center text-sm text-muted">You need two images. The sample set includes a 2024 and a 2026 scene.</p></>
  const d = r.data
  const run = () => r.run({ image_a_id: active.id, image_b_id: activeB, interpolation: interp, register, match_histograms: match, threshold_mode: mode, threshold: thr, morph, min_area: minArea })
  const bImg = images.find((i) => i.id === activeB)

  return (
    <>
      <PageHeader icon={GitCompareArrows} title="Change Detection" subtitle="Aligns image B to image A, matches lighting, measures the colour difference and highlights regions that changed.">
        <Button icon={Play} onClick={run} loading={r.loading} disabled={!activeB}>Detect changes</Button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <div className="space-y-5">
          <Card title="Images">
            <div className="space-y-4">
              <div><span className="label">Image A (earlier, the active image)</span><div className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white">{active.name}</div></div>
              <ImageSelect label="Image B (later)" value={activeB} onChange={setActiveB} exclude={active.id} />
            </div>
          </Card>
          <Card title="Pipeline">
            <div className="space-y-5">
              <Toggle checked={register} onChange={setRegister} label="Register image B" hint="ECC alignment fixes small shifts and rotation." />
              <Toggle checked={match} onChange={setMatch} label="Match histograms" hint="Reduces false changes from lighting and season." />
              <Select label="Resampling" value={interp} onChange={setInterp} options={[{ value: 'nearest', label: 'Nearest neighbour' }, { value: 'bilinear', label: 'Bilinear' }, { value: 'bicubic', label: 'Bicubic' }]} hint="Used when sizes differ and when warping." />
              <div><span className="label">Threshold</span><Segmented value={mode} onChange={setMode} options={[{ value: 'otsu', label: 'Otsu (automatic)' }, { value: 'manual', label: 'Manual' }]} /></div>
              {mode === 'manual' && <Slider label="Difference threshold" min={5} max={100} value={thr} onChange={setThr} hint="Colour distance in Lab units." />}
              <Slider label="Morphology kernel" min={1} max={15} step={2} value={morph} onChange={setMorph} format={(v) => `${v} px`} />
              <Slider label="Minimum change size" min={0} max={500} step={10} value={minArea} onChange={setMinArea} format={(v) => `${v} px`} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <ErrorNote error={r.error} />
          {!d && !r.loading && (
            <div className="grid gap-4 lg:grid-cols-2"><ImagePanel title="Image A" src={imgUrl(active.id)} /><ImagePanel title="Image B" src={bImg && imgUrl(bImg.id)} /></div>
          )}
          {r.loading && !d && <Card><p className="py-10 text-center text-scope">Registering, differencing and classifying...</p></Card>}
          {d && (
            <>
              {d.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Changed pixels" value={pct(d.changed_pct, 2)} color="#ff3b5c" sub={`${num(d.changed_pixels)} px`} />
                <Stat label="Changed area" value={`${num(d.area_ha, 1)} ha`} sub={`threshold ${d.threshold.toFixed(1)}`} />
                <Stat label="Changed regions" value={num(d.regions.count)} />
                <Stat label="Registration" value={d.registration.applied ? `${d.registration.dx.toFixed(1)}, ${d.registration.dy.toFixed(1)}` : 'off'} sub={d.registration.applied ? `shift px, rot ${d.registration.rotation_deg.toFixed(2)} deg, cc ${d.registration.correlation?.toFixed(2)}` : 'images compared as given'} />
              </div>
              <Segmented value={view} onChange={setView} options={[{ value: 'swipe', label: 'Swipe A / B' }, { value: 'overlay', label: 'Changes on B' }, { value: 'diff', label: 'Difference heatmap' }, { value: 'mask', label: 'Change mask' }, { value: 'boxes', label: 'Regions' }]} />
              {view === 'swipe' ? <CompareSlider a={d.images.a} b={d.images.b} labelA="Image A" labelB="Image B (aligned)" />
                : <div className="grid gap-4 lg:grid-cols-2"><ImagePanel title="Image A" src={d.images.a} /><ImagePanel title={{ overlay: 'Changed regions in red', diff: 'Colour difference', mask: 'Change mask', boxes: 'Largest changed regions' }[view]} src={d.images[view]} filename={`change_${view}.png`} /></div>}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Land-cover comparison" subtitle="Both dates are clustered together so classes match.">
                  <Bars data={d.classes.map((c) => ({ name: c.name, a: +c.a.toFixed(2), b: +c.b.toFixed(2) }))} keys={[{ key: 'a', name: 'Image A', color: '#22d3ee' }, { key: 'b', name: 'Image B', color: '#3ddc97' }]} />
                </Card>
                <Card title="Coverage shift">
                  <table className="tbl"><thead><tr><th>Class</th><th>A</th><th>B</th><th>Change</th></tr></thead>
                    <tbody>{d.classes.map((c) => <tr key={c.name}><td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLORS[c.name] }} />{c.name}</td><td>{pct(c.a)}</td><td>{pct(c.b)}</td>
                      <td className="font-semibold" style={{ color: c.delta >= 0 ? '#3ddc97' : '#f97316' }}>{c.delta >= 0 ? '+' : ''}{c.delta.toFixed(2)}</td></tr>)}</tbody></table>
                  {d.transitions.top.length > 0 && <>
                    <div className="mb-2 mt-5 text-sm font-semibold text-white">Biggest transitions (share of image)</div>
                    <ul className="space-y-1.5 text-sm">{d.transitions.top.slice(0, 5).map((t, i) => <li key={i} className="flex justify-between text-slate-300"><span>{t.from} to {t.to}</span><b className="text-white">{t.pct.toFixed(2)}%</b></li>)}</ul></>}
                </Card>
              </div>
              <Card title="Changed regions" subtitle="Largest first."><ComponentsTable rows={d.regions.rows} /></Card>
              <Notice tone="info" title="A changed pixel is not always a real change">Seasons, sun angle, clouds and sensor differences all alter pixel values. Use the registration and histogram options, then check the highlighted regions by eye.</Notice>
            </>
          )}
        </div>
      </div>
    </>
  )
}
