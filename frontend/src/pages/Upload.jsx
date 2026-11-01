import { useEffect, useRef, useState } from 'react'
import { Download, FlaskConical, MapPin, Trash2, UploadCloud, KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, imgUrl, uploadFile } from '../api'
import { useApp } from '../store'
import { bytes, num } from '../fmt'
import { Button, Card, Notice, PageHeader, Slider } from '../components/ui'

const PRESETS = [
  { n: 'Palm Jumeirah, Dubai', lat: 25.1124, lon: 55.139, z: 14 },
  { n: 'Aral Sea shoreline', lat: 45.0, lon: 59.5, z: 8 },
  { n: 'Rondonia, Brazil', lat: -10.83, lon: -62.9, z: 11 },
  { n: 'Las Vegas', lat: 36.17, lon: -115.14, z: 11 },
  { n: 'Nile Delta', lat: 31.0, lon: 31.0, z: 9 },
]

function Meta({ m }) {
  const rows = [
    ['File name', m.name], ['Format', m.format], ['File size', bytes(m.size_bytes)], ['Dimensions', `${m.width} x ${m.height} px`],
    ['Pixel count', num(m.pixel_count)], ['Channels / bands', m.has_bands ? `${m.channels} (multispectral)` : 'RGB (3)'], ['Source', m.source],
    ...Object.entries(m.metadata || {}).map(([k, v]) => [k.replace(/_/g, ' '), Array.isArray(v) ? v.map((x) => +Number(x).toFixed(4)).join(', ') : String(v)]),
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="overflow-hidden rounded-xl border border-white/10"><table className="tbl"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="w-40 text-muted">{k}</td><td className="break-all">{v}</td></tr>)}</tbody></table></div>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="tbl"><thead><tr><th>Channel</th><th>Mean</th><th>Std dev</th><th>Min</th><th>Max</th></tr></thead>
          <tbody>{m.channel_stats.map((c) => <tr key={c.name}><td><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: { Red: '#ef4444', Green: '#22c55e', Blue: '#3b82f6' }[c.name] }} />{c.name}</td><td>{c.mean.toFixed(1)}</td><td>{c.std.toFixed(1)}</td><td>{c.min}</td><td>{c.max}</td></tr>)}</tbody></table>
      </div>
    </div>
  )
}

export default function Upload() {
  const { images, active, activeId, setActiveId, refreshImages, toast, settings } = useApp()
  const [drag, setDrag] = useState(false)
  const [prog, setProg] = useState(null)
  const [samples, setSamples] = useState(null)
  const [sat, setSat] = useState({ lat: 25.1124, lon: 55.139, zoom: 14, size: 1024 })
  const [fetching, setFetching] = useState(false)
  const input = useRef()

  useEffect(() => { api.samples().then(setSamples).catch(() => {}) }, [])

  const send = async (files) => {
    for (const f of files) {
      setProg({ name: f.name, p: 0 })
      try {
        const m = await uploadFile(f, (p) => setProg({ name: f.name, p }))
        await refreshImages()
        setActiveId(m.id)
        toast(`${f.name} uploaded`, 'ok')
      } catch (e) { toast(e.message, 'error') }
    }
    setProg(null)
  }
  const loadSample = async (key) => {
    try { const m = await api.loadSample(key); await refreshImages(); setActiveId(m.id); setSamples(await api.samples()); toast('Sample loaded', 'ok') } catch (e) { toast(e.message, 'error') }
  }
  const remove = async (id) => { try { await api.deleteImage(id); await refreshImages(); toast('Image deleted') } catch (e) { toast(e.message, 'error') } }
  const fetchSat = async () => {
    setFetching(true)
    try { const m = await api.fetchSatellite({ lat: +sat.lat, lon: +sat.lon, zoom: sat.zoom, size: sat.size }); await refreshImages(); setActiveId(m.id); toast('Satellite image fetched', 'ok') }
    catch (e) { toast(e.message, 'error') } finally { setFetching(false) }
  }

  return (
    <>
      <PageHeader icon={UploadCloud} title="Upload Center" subtitle="Add your own satellite or aerial images, load the built-in samples, or fetch imagery by coordinates." />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); send([...e.dataTransfer.files]) }}
          onClick={() => input.current.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current.click()}
          className={`card reticle grid min-h-[260px] cursor-pointer place-items-center border-2 border-dashed p-8 text-center transition ${drag ? 'border-terra bg-terra/[0.06]' : 'border-white/15 hover:border-scope/50'}`}>
          <input ref={input} type="file" hidden multiple accept=".jpg,.jpeg,.png,.tif,.tiff" onChange={(e) => { send([...e.target.files]); e.target.value = '' }} />
          <div>
            <UploadCloud size={42} className="mx-auto mb-4 text-scope" />
            <h2 className="text-xl font-semibold text-white">{drag ? 'Drop to upload' : 'Drag images here, or click to browse'}</h2>
            <p className="mt-2 text-sm text-muted">JPG, JPEG, PNG and TIFF / GeoTIFF up to 60 MB. Files with 4 or more bands unlock real NDVI.</p>
            {prog && (
              <div className="mx-auto mt-5 max-w-sm" onClick={(e) => e.stopPropagation()}>
                <div className="mb-1 flex justify-between text-xs text-muted"><span className="truncate">{prog.name}</span><span>{Math.round(prog.p * 100)}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-terra to-scope transition-all" style={{ width: `${prog.p * 100}%` }} /></div>
              </div>
            )}
          </div>
        </div>

        <Card title="Sample imagery" subtitle="Ready for a presentation. No searching needed.">
          <div className="space-y-3">
            {(samples || []).map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3.5">
                <div><div className="text-sm font-semibold text-white">{s.title}</div><div className="text-xs text-muted">{s.desc}</div></div>
                <Button small variant={s.loaded_id ? 'ghost' : 'primary'} icon={FlaskConical} onClick={() => (s.loaded_id ? setActiveId(s.loaded_id) : loadSample(s.key))}>{s.loaded_id ? 'Use' : 'Load'}</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6" title="Fetch satellite imagery by coordinates" subtitle="Uses the Mapbox Satellite static API with your own free token.">
        {!settings?.mapbox?.configured && (
          <div className="mb-4"><Notice tone="warn" title="Mapbox token needed">This is optional. Paste a token in <Link to="/settings" className="text-scope underline">Settings and API keys</Link> to enable it. Uploads and samples work without it.</Notice></div>
        )}
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1.2fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">Latitude</span><input className="input" type="number" step="any" value={sat.lat} onChange={(e) => setSat({ ...sat, lat: e.target.value })} /></label>
              <label><span className="label">Longitude</span><input className="input" type="number" step="any" value={sat.lon} onChange={(e) => setSat({ ...sat, lon: e.target.value })} /></label>
            </div>
            <Slider label="Zoom level" min={1} max={19} step={1} value={sat.zoom} onChange={(v) => setSat({ ...sat, zoom: v })} hint="Higher zoom shows a smaller area in more detail." />
          </div>
          <div className="space-y-4">
            <Slider label="Image size" min={256} max={1280} step={64} value={sat.size} onChange={(v) => setSat({ ...sat, size: v })} format={(v) => `${v} px`} />
            <Button icon={MapPin} onClick={fetchSat} loading={fetching} disabled={!settings?.mapbox?.configured}>Fetch image</Button>
          </div>
          <div>
            <span className="label">Quick places</span>
            <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p.n} className="chip transition hover:border-scope/50" onClick={() => setSat({ ...sat, lat: p.lat, lon: p.lon, zoom: p.z })}>{p.n}</button>)}</div>
          </div>
        </div>
      </Card>

      {active && (
        <Card className="mt-6" title="Image inspector" subtitle={`Metadata for ${active.name}`}>
          <div className="mb-5 grid gap-5 lg:grid-cols-[320px_1fr]">
            <div className="reticle overflow-hidden rounded-xl bg-black/40"><img src={imgUrl(active.id)} alt={active.name} className="w-full" /></div>
            <Meta m={active} />
          </div>
        </Card>
      )}

      <Card className="mt-6" title={`Library (${images.length})`} subtitle="Select an image to make it active in every lab.">
        {images.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {images.map((i) => (
              <div key={i.id} className={`group overflow-hidden rounded-xl border transition ${i.id === activeId ? 'border-terra shadow-glow' : 'border-white/10 hover:border-white/25'}`}>
                <button className="block w-full" onClick={() => setActiveId(i.id)}><img src={imgUrl(i.id, { thumb: true })} alt={i.name} className="aspect-square w-full object-cover" /></button>
                <div className="space-y-1.5 p-2.5">
                  <div className="truncate text-xs font-medium text-white" title={i.name}>{i.name}</div>
                  <div className="text-[11px] text-dim">{i.width}x{i.height} · {bytes(i.size_bytes)}</div>
                  <div className="flex gap-1.5">
                    <a className="btn-ghost btn-sm flex-1" href={imgUrl(i.id, { download: true })} title="Download original"><Download size={13} /></a>
                    <button className="btn-danger btn-sm flex-1" onClick={() => remove(i.id)} title="Delete"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-dim">No images yet.</p>}
      </Card>
    </>
  )
}
