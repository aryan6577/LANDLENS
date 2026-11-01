import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { useDebouncedEffect, useRunner } from '../hooks'
import { Button, Card, ImagePanel, PageHeader, Segmented, Slider, Stat } from '../components/ui'
import { ErrorNote, NeedImage } from '../components/Shared'
import { Histogram } from '../components/charts'
import CompareSlider from '../components/CompareSlider'

export default function Enhancement() {
  const { active } = useApp()
  const [ops, setOps] = useState([])
  const [op, setOp] = useState('clahe')
  const [params, setParams] = useState({})
  const [common, setCommon] = useState({ brightness: 0, contrast: 1 })
  const [view, setView] = useState('side')
  const r = useRunner((body, signal) => api.enhance(body, signal))

  useEffect(() => { api.enhanceOps().then(setOps).catch(() => {}) }, [])
  const def = useMemo(() => ops.find((o) => o.key === op), [ops, op])
  useEffect(() => { if (def) setParams(Object.fromEntries(def.params.map((p) => [p.key, p.default]))) }, [def])

  useDebouncedEffect(() => {
    if (active && def) r.run({ image_id: active.id, op, params: { ...params, ...common } })
  }, [active?.id, op, JSON.stringify(params), common.brightness, common.contrast, !!def], 300)

  if (!active) return <><PageHeader icon={SlidersHorizontal} title="Image Enhancement Lab" /><NeedImage /></>
  const groups = [...new Set(ops.map((o) => o.group))]
  const d = r.data
  const reset = () => { setCommon({ brightness: 0, contrast: 1 }); def && setParams(Object.fromEntries(def.params.map((p) => [p.key, p.default]))) }

  return (
    <>
      <PageHeader icon={SlidersHorizontal} title="Image Enhancement Lab" subtitle="Choose an algorithm, drag the sliders and watch the result update. Point operations, histogram methods, spatial filters and sharpening." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card title="Algorithm">
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g}>
                  <div className="mb-1.5 text-xs font-semibold text-dim">{g}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ops.filter((o) => o.group === g).map((o) => (
                      <button key={o.key} onClick={() => setOp(o.key)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${op === o.key ? 'border-scope bg-scope/15 text-white' : 'border-white/10 text-muted hover:border-white/25 hover:text-white'}`}>{o.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {def && <p className="mt-4 rounded-xl bg-black/25 p-3 text-sm leading-relaxed text-slate-300">{def.desc}</p>}
          </Card>
          <Card title="Controls" actions={<Button small variant="ghost" icon={RotateCcw} onClick={reset}>Reset</Button>}>
            <div className="space-y-5">
              {def?.params.map((p) => (
                <Slider key={p.key} label={p.label} min={p.min} max={p.max} step={p.step} value={params[p.key] ?? p.default} onChange={(v) => setParams({ ...params, [p.key]: v })} />
              ))}
              {def && !def.params.length && <p className="text-sm text-dim">This operation has no parameters.</p>}
              <div className="border-t border-white/10 pt-5 space-y-5">
                <Slider label="Brightness" min={-100} max={100} step={1} value={common.brightness} onChange={(v) => setCommon({ ...common, brightness: v })} />
                <Slider label="Contrast" min={0.5} max={2} step={0.05} value={common.contrast} onChange={(v) => setCommon({ ...common, contrast: v })} format={(v) => v.toFixed(2)} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <ErrorNote error={r.error} />
          <div className="flex items-center justify-between">
            <Segmented value={view} onChange={setView} options={[{ value: 'side', label: 'Side by side' }, { value: 'swipe', label: 'Swipe' }]} />
            {r.loading && <span className="text-xs text-scope">Processing...</span>}
          </div>
          {view === 'side' || !d ? (
            <div className={`grid gap-4 ${d?.images.aux ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
              <ImagePanel title="Original" src={d?.images.original} loading={r.loading} />
              <ImagePanel title={`Processed: ${def?.name || ''}`} src={d?.images.processed} loading={r.loading} />
              {d?.images.aux && <ImagePanel title="Edge response" src={d.images.aux} caption="Gradient (Sobel) or second derivative (Laplacian) that is added back to sharpen." />}
            </div>
          ) : <CompareSlider a={d.images.original} b={d.images.processed} labelA="Original" labelB="Processed" />}

          {d && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <Stat label="Mean intensity" value={d.stats.processed.mean.toFixed(1)} sub={`was ${d.stats.original.mean.toFixed(1)}`} />
                <Stat label="Contrast (std dev)" value={d.stats.processed.std.toFixed(1)} sub={`was ${d.stats.original.std.toFixed(1)}`} />
                <Stat label="Entropy (bits)" value={d.stats.processed.entropy.toFixed(2)} sub={`was ${d.stats.original.entropy.toFixed(2)}`} />
              </div>
              <Card title="Intensity histogram" subtitle="Equalization and stretching widen and flatten the processed curve.">
                <Histogram data={d.histogram} xKey="bin" height={220} series={[{ key: 'original', name: 'Original', color: '#8da0bd' }, { key: 'processed', name: 'Processed', color: '#3ddc97' }]} />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
