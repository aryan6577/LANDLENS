import { useState } from 'react'
import { Building2, Droplets, Leaf, Play } from 'lucide-react'
import { api, downloadDataUrl, imgUrl } from '../api'
import { useApp } from '../store'
import { useRunner } from '../hooks'
import { num, pct } from '../fmt'
import { Button, Card, ImagePanel, Notice, PageHeader, Segmented, Select, Slider, Stat, Toggle } from '../components/ui'
import { ErrorNote, ImageSelect, NeedImage } from '../components/Shared'
import { Histogram, Bars } from '../components/charts'
import CompareSlider from '../components/CompareSlider'
import ComponentsTable from '../components/ComponentsTable'

const CFG = {
  vegetation: { icon: Leaf, title: 'Vegetation Lab', color: '#34d399', sub: 'Finds green-dominant regions with the Excess-Green index (2g - r - b). RGB photos have no infrared band, so this is a greenness estimate, not NDVI.', range: [-0.1, 0.3, 0.01] },
  water: { icon: Droplets, title: 'Water Lab', color: '#38a0fd', sub: 'Water is smooth and blue-dominant. The blue index (b - r) plus a smoothness filter separates it from shadows and rooftops.', range: [-0.1, 0.3, 0.01] },
  urban: { icon: Building2, title: 'Urban Lab', color: '#f97316', sub: 'Built-up areas are textured, edge-rich and low in colour saturation. A combined score is thresholded and cleaned with morphology.', range: [0.05, 0.9, 0.01] },
}

function GridMap({ grid, color }) {
  return (
    <div className="grid aspect-square w-full max-w-[280px] grid-cols-6 gap-1">
      {grid.flat().map((v, i) => (
        <div key={i} className="grid aspect-square place-items-center rounded-md text-[10px] font-semibold text-white/90" title={`${v.toFixed(1)}%`}
          style={{ background: color, opacity: 0.12 + (v / 100) * 0.88 }}>{Math.round(v)}</div>
      ))}
    </div>
  )
}

function Ndvi() {
  const { active, toast, refreshImages, setActiveId, images } = useApp()
  const [red, setRed] = useState(1)
  const [nir, setNir] = useState(4)
  const r = useRunner((b, s) => api.ndvi(b, s))
  const ms = images.find((i) => i.has_bands)
  const loadMs = async () => { try { const m = await api.loadSample('delta_multispectral'); await refreshImages(); setActiveId(m.id) } catch (e) { toast(e.message, 'error') } }
  const bandsN = active?.has_bands ? active.channels : 4
  const opts = Array.from({ length: bandsN }, (_, i) => ({ value: i + 1, label: `Band ${i + 1}` }))
  const d = r.data
  return (
    <div className="space-y-6">
      <Notice tone="info" title="True NDVI needs a near-infrared band">NDVI = (NIR - Red) / (NIR + Red). Upload a multispectral TIFF (for example R, G, B, NIR). RGB images cannot give a genuine NDVI.</Notice>
      {!active?.has_bands ? (
        <Card><div className="py-6 text-center"><p className="text-muted">The active image has no extra bands.</p>
          <div className="mt-4 flex justify-center gap-2"><Button onClick={loadMs}>Load the multispectral sample</Button>{ms && <Button variant="ghost" onClick={() => setActiveId(ms.id)}>Use {ms.name}</Button>}</div></div></Card>
      ) : (
        <>
          <Card title="Band selection" actions={<Button icon={Play} onClick={() => r.run({ image_id: active.id, red_band: Number(red), nir_band: Number(nir) })} loading={r.loading}>Compute NDVI</Button>}>
            <div className="grid max-w-lg gap-4 sm:grid-cols-2">
              <Select label="Red band" value={red} onChange={setRed} options={opts} />
              <Select label="Near-infrared band" value={nir} onChange={setNir} options={opts} hint="For R, G, B, NIR files use band 1 and band 4." />
            </div>
          </Card>
          <ErrorNote error={r.error} />
          {d && (
            <>
              <div className="grid gap-4 lg:grid-cols-2"><ImagePanel title="True colour" src={d.images.rgb} /><ImagePanel title="NDVI (red = low, green = dense)" src={d.images.ndvi} /></div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Mean NDVI" value={d.stats.mean.toFixed(3)} /><Stat label="Median" value={d.stats.median.toFixed(3)} />
                <Stat label="Maximum" value={d.stats.max.toFixed(3)} /><Stat label="Dense vegetation" value={pct(d.classes[4].pct)} color="#0f7a3a" />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="NDVI classes"><Bars data={d.classes.map((c) => ({ name: c.name.split(' ')[0], pct: +c.pct.toFixed(2) }))} keys={[{ key: 'pct', name: 'Coverage', color: '#3ddc97' }]} /></Card>
                <Card title="NDVI distribution"><Histogram data={d.histogram} series={[{ key: 'y', name: 'Pixels', color: '#3ddc97' }]} height={260} /></Card>
              </div>
              <Card><table className="tbl"><thead><tr><th>Class</th><th>NDVI range</th><th>Coverage</th><th>Area (ha)</th></tr></thead>
                <tbody>{d.classes.map((c) => <tr key={c.name}><td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.name}</td><td>{c.range}</td><td>{pct(c.pct)}</td><td>{num(c.area_ha, 1)}</td></tr>)}</tbody></table></Card>
            </>
          )}
        </>
      )}
    </div>
  )
}

function MaskLab({ kind }) {
  const cfg = CFG[kind]
  const { active, activeB, setActiveB } = useApp()
  const [method, setMethod] = useState('threshold')
  const [thr, setThr] = useState(null)
  const [morph, setMorph] = useState(5)
  const [minArea, setMinArea] = useState(40)
  const [tex, setTex] = useState(0.65)
  const [compare, setCompare] = useState(false)
  const [view, setView] = useState('overlay')
  const r = useRunner((b, s) => api.mask(kind, b, s))
  if (!active) return <><PageHeader icon={cfg.icon} title={cfg.title} /><NeedImage /></>
  const d = r.data
  const defT = d?.index?.default ?? (kind === 'urban' ? 0.45 : kind === 'water' ? 0.03 : 0.07)
  const t = thr ?? defT
  const run = () => r.run({ image_id: active.id, method, threshold: method === 'threshold' ? t : null, morph, min_area: minArea, tex_filter: tex,
    image_b_id: compare && activeB && activeB !== active.id ? activeB : null })
  const shown = d && { overlay: d.images.overlay, mask: d.images.mask, heatmap: d.images.heatmap, boxes: d.images.boxes }[view]

  return (
    <>
      <PageHeader icon={cfg.icon} title={cfg.title} subtitle={cfg.sub}>
        <Button icon={Play} onClick={run} loading={r.loading}>Run analysis</Button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
        <div className="space-y-5">
          <Card title="Method">
            <div className="space-y-5">
              <Segmented value={method} onChange={setMethod} options={[{ value: 'threshold', label: 'Threshold' }, { value: 'otsu', label: 'Otsu' }, { value: 'kmeans', label: 'K-means' }]} />
              {method === 'threshold' && <Slider label="Index threshold" min={cfg.range[0]} max={cfg.range[1]} step={cfg.range[2]} value={t} onChange={setThr} format={(v) => v.toFixed(2)} hint="Pixels above this index value are kept." />}
              {method === 'otsu' && <p className="text-sm text-muted">Otsu picks the threshold that best separates the index histogram into two groups.</p>}
              {method === 'kmeans' && <p className="text-sm text-muted">Uses the cluster-based land-cover classification and keeps this class.</p>}
              {kind === 'water' && <Slider label="Smoothness filter" min={0.1} max={1} step={0.05} value={tex} onChange={setTex} format={(v) => v.toFixed(2)} hint="Lower values reject rough texture such as rooftops." />}
              <Slider label="Morphology kernel" min={1} max={15} step={2} value={morph} onChange={setMorph} format={(v) => `${v} px`} />
              <Slider label="Minimum region size" min={0} max={400} step={10} value={minArea} onChange={setMinArea} format={(v) => `${v} px`} />
            </div>
          </Card>
          <Card title="Compare with another image">
            <div className="space-y-4">
              <Toggle checked={compare} onChange={setCompare} label="Compare coverage" hint="Runs the same settings on a second image." />
              {compare && <ImageSelect label="Second image" value={activeB} onChange={setActiveB} exclude={active.id} />}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <ErrorNote error={r.error} />
          {!d && !r.loading && <Card><p className="py-10 text-center text-muted">Press <b className="text-white">Run analysis</b> to process {active.name}.</p></Card>}
          {d && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Coverage" value={pct(d.coverage_pct, 2)} color={cfg.color} sub={d.method === 'kmeans' ? 'K-means class' : `threshold ${d.threshold?.toFixed(3)}`} />
                <Stat label="Pixels" value={num(d.pixels)} sub={`of ${num(d.total_pixels)}`} />
                <Stat label="Area" value={`${num(d.area_ha, 1)} ha`} sub={`${d.area_km2.toFixed(3)} km2`} />
                <Stat label="Regions" value={num(d.components.count)} sub="connected components" />
              </div>
              {d.compare && (
                <Card title={`Compared with ${d.compare.b_name}`}>
                  <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.4fr]">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted">This image</span><b className="text-white">{pct(d.coverage_pct, 2)}</b></div>
                      <div className="flex justify-between"><span className="text-muted">Second image</span><b className="text-white">{pct(d.compare.b_coverage_pct, 2)}</b></div>
                      <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-muted">Change</span>
                        <b style={{ color: d.compare.delta_pct_points >= 0 ? '#3ddc97' : '#f97316' }}>{d.compare.delta_pct_points >= 0 ? '+' : ''}{d.compare.delta_pct_points.toFixed(2)} points</b></div>
                    </div>
                    <ImagePanel title="Second image result" src={d.compare.b_overlay} />
                  </div>
                </Card>
              )}
              <Segmented value={view} onChange={setView} options={[{ value: 'overlay', label: 'Overlay' }, { value: 'mask', label: 'Mask' }, { value: 'heatmap', label: 'Heatmap' }, { value: 'boxes', label: 'Regions' }, { value: 'swipe', label: 'Swipe' }]} />
              {view === 'swipe'
                ? <CompareSlider a={imgUrl(active.id)} b={d.images.overlay} labelA="Original" labelB="Detected" />
                : <div className="grid gap-4 lg:grid-cols-2">
                    <ImagePanel title="Original" src={imgUrl(active.id)} />
                    <ImagePanel title={{ overlay: 'Detected overlay', mask: 'Binary mask', heatmap: d.index.label, boxes: 'Largest regions' }[view]} src={shown} loading={r.loading}
                      filename={`${kind}_${view}.png`} />
                  </div>}
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card title="Index distribution" subtitle={d.index.label}>
                  <Histogram data={d.histogram} series={[{ key: 'y', name: 'Pixels', color: cfg.color }]} height={220} threshold={d.threshold ?? undefined} />
                </Card>
                <Card title="Where it is" subtitle="Share of each image tile (6 x 6 grid)"><GridMap grid={d.grid} color={cfg.color} /></Card>
              </div>
              <Card title="Connected regions" subtitle="Largest regions with area, perimeter, circularity, eccentricity and bounding box.">
                <ComponentsTable rows={d.components.rows} />
              </Card>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" small onClick={() => downloadDataUrl(d.images.mask, `${kind}_mask.png`)}>Download mask</Button>
                <Button variant="ghost" small onClick={() => downloadDataUrl(d.images.overlay, `${kind}_overlay.jpg`)}>Download overlay</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function Vegetation() {
  const [tab, setTab] = useState('rgb')
  return (
    <>
      <div className="mb-5"><Segmented value={tab} onChange={setTab} options={[{ value: 'rgb', label: 'RGB greenness' }, { value: 'ndvi', label: 'NDVI mode (multispectral)' }]} /></div>
      {tab === 'rgb' ? <MaskLab kind="vegetation" /> : <><PageHeader icon={Leaf} title="Vegetation Lab: NDVI mode" subtitle="Real NDVI from red and near-infrared bands." /><Ndvi /></>}
    </>
  )
}
export const Water = () => <MaskLab kind="water" />
export const Urban = () => <MaskLab kind="urban" />
