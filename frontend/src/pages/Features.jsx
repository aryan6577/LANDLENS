import { useState } from 'react'
import { Play, ScanSearch } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { useRunner } from '../hooks'
import { num } from '../fmt'
import { Button, Card, ImagePanel, PageHeader, Stat, Tabs } from '../components/ui'
import { ErrorNote, NeedImage } from '../components/Shared'
import { Bars, Histogram } from '../components/charts'
import { CLASS_COLORS } from '../fmt'

export default function Features() {
  const { active } = useApp()
  const [tab, setTab] = useState('stats')
  const r = useRunner((b, s) => api.features(b, s))
  if (!active) return <><PageHeader icon={ScanSearch} title="Feature Lab" /><NeedImage /></>
  const d = r.data
  return (
    <>
      <PageHeader icon={ScanSearch} title="Feature Lab" subtitle="Describe the image with numbers: intensity statistics, region shape, Hu moments, and texture from GLCM and Local Binary Patterns.">
        <Button icon={Play} onClick={() => r.run({ image_id: active.id })} loading={r.loading}>Extract features</Button>
      </PageHeader>
      <ErrorNote error={r.error} />
      {!d && !r.loading && <Card><p className="py-10 text-center text-muted">Press <b className="text-white">Extract features</b> to analyse {active.name}.</p></Card>}
      {d && (
        <div className="space-y-6">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stats', label: 'Statistics' }, { value: 'shape', label: 'Shape and moments' }, { value: 'texture', label: 'Texture' }]} />
          {tab === 'stats' && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Total pixels" value={num(d.statistics.pixel_count)} />
                <Stat label="Mean intensity" value={d.statistics.rows[3].mean.toFixed(1)} />
                <Stat label="Std deviation" value={d.statistics.rows[3].std.toFixed(1)} />
                <Stat label="Variance" value={num(d.statistics.rows[3].variance, 0)} />
              </div>
              <Card title="Channel statistics"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Channel</th><th>Mean</th><th>Std dev</th><th>Variance</th><th>Min</th><th>Max</th><th>Median</th><th>Skewness</th><th>Entropy</th></tr></thead>
                <tbody>{d.statistics.rows.map((x) => <tr key={x.channel}><td className="font-medium text-white">{x.channel}</td><td>{x.mean.toFixed(1)}</td><td>{x.std.toFixed(1)}</td><td>{num(x.variance)}</td><td>{x.min}</td><td>{x.max}</td><td>{x.median}</td><td>{x.skewness.toFixed(2)}</td><td>{x.entropy.toFixed(2)}</td></tr>)}</tbody></table></div></Card>
              <Card title="Histograms"><Histogram data={d.statistics.histogram} xKey="bin" height={260} series={[{ key: 'r', name: 'Red', color: '#ef4444' }, { key: 'g', name: 'Green', color: '#22c55e' }, { key: 'b', name: 'Blue', color: '#3b82f6' }, { key: 'gray', name: 'Gray', color: '#cbd5e1' }]} /></Card>
            </>
          )}
          {tab === 'shape' && (
            <>
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                <ImagePanel title="Bounding boxes of the largest regions" src={d.shapes.image} caption="V = vegetation, W = water, B = built-up. Numbers are the rank by area." />
                <Card title="Hu moments" subtitle="Seven shape signatures, shown as -sign x log10|value|. Invariant to position, scale and rotation.">
                  <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th>{[1, 2, 3, 4, 5, 6, 7].map((i) => <th key={i}>h{i}</th>)}</tr></thead>
                    <tbody>{d.shapes.hu.map((h) => <tr key={h.class}><td className="whitespace-nowrap"><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLORS[h.class] }} />{h.class}</td>{h.hu.map((v, i) => <td key={i}>{v.toFixed(2)}</td>)}</tr>)}</tbody></table></div>
                </Card>
              </div>
              <Card title="Region descriptors" subtitle="Area, perimeter, circularity (1 = circle), compactness (perimeter² / area), eccentricity, aspect ratio and bounding box.">
                <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th><th>#</th><th>Area (ha)</th><th>Perimeter</th><th>Circularity</th><th>Compactness</th><th>Eccentricity</th><th>Aspect</th><th>Bounding box</th></tr></thead>
                  <tbody>{d.shapes.rows.map((x, i) => <tr key={i}><td><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLORS[x.class] }} />{x.class}</td><td>{x.rank}</td><td>{num(x.area_ha, 1)}</td><td>{x.perimeter_px.toFixed(0)}</td><td>{x.circularity.toFixed(2)}</td><td>{x.compactness.toFixed(1)}</td><td>{x.eccentricity.toFixed(2)}</td><td>{x.aspect_ratio.toFixed(2)}</td><td className="text-muted">{x.bbox.join(', ')}</td></tr>)}</tbody></table></div>
              </Card>
            </>
          )}
          {tab === 'texture' && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {['contrast', 'homogeneity', 'energy', 'correlation', 'dissimilarity'].map((k) => <Stat key={k} label={`GLCM ${k}`} value={d.texture.overall[k].toFixed(3)} />)}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="GLCM texture by class" subtitle="Grey-level co-occurrence matrix on 32 levels, 2 distances, 4 angles, averaged over small patches.">
                  <table className="tbl"><thead><tr><th>Class</th><th>Contrast</th><th>Homogeneity</th><th>Energy</th><th>Correlation</th></tr></thead>
                    <tbody>{d.texture.per_class.map((c) => <tr key={c.class}><td><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: CLASS_COLORS[c.class] }} />{c.class}</td><td>{c.contrast.toFixed(3)}</td><td>{c.homogeneity.toFixed(3)}</td><td>{c.energy.toFixed(3)}</td><td>{c.correlation.toFixed(3)}</td></tr>)}</tbody></table>
                </Card>
                <Card title="Local Binary Pattern histogram" subtitle="Uniform LBP, 8 neighbours, radius 1.">
                  <Bars unit="" xKey="pattern" data={d.texture.lbp.hist.map((h) => ({ pattern: h.pattern, value: +h.value.toFixed(4) }))} keys={[{ key: 'value', name: 'Fraction', color: '#22d3ee' }]} />
                </Card>
              </div>
              <ImagePanel title="LBP texture image" src={d.texture.lbp.image} caption="Each pixel is replaced by the code of its local binary pattern." className="max-w-xl" />
            </>
          )}
        </div>
      )}
    </>
  )
}
