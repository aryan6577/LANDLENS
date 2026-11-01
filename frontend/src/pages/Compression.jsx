import { useState } from 'react'
import { FileArchive, Play } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { useRunner } from '../hooks'
import { bytes, num } from '../fmt'
import { Badge, Button, Card, ImagePanel, Notice, PageHeader, Segmented, Slider, Stat } from '../components/ui'
import { ErrorNote, NeedImage } from '../components/Shared'
import { Bars, Lines } from '../components/charts'

export default function Compression() {
  const { active } = useApp()
  const [mode, setMode] = useState('gray')
  const [quality, setQuality] = useState(60)
  const r = useRunner((b, s) => api.compression(b, s))
  if (!active) return <><PageHeader icon={FileArchive} title="Compression Lab" /><NeedImage /></>
  const d = r.data
  const run = () => r.run({ image_id: active.id, mode, quality })
  return (
    <>
      <PageHeader icon={FileArchive} title="Compression Lab" subtitle="Compare lossy JPEG with lossless PNG, and two coding methods written from scratch: run-length encoding and Huffman coding.">
        <Button icon={Play} onClick={run} loading={r.loading}>Compress</Button>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card title="Settings">
          <div className="space-y-5">
            <div><span className="label">Image data</span><Segmented value={mode} onChange={setMode} options={[{ value: 'gray', label: 'Grayscale (8-bit)' }, { value: 'rgb', label: 'Colour (24-bit)' }]} /></div>
            <Slider label="JPEG quality" min={5} max={100} value={quality} onChange={setQuality} hint="Lower quality = smaller file and more error." />
            <p className="text-sm text-dim">Sizes are compared with the raw uncompressed bitmap of the working copy ({d ? bytes(d.raw_bytes) : '...'}).</p>
          </div>
        </Card>
        <div className="space-y-6">
          <ErrorNote error={r.error} />
          {!d && !r.loading && <Card><p className="py-10 text-center text-muted">Press <b className="text-white">Compress</b> to run all four methods.</p></Card>}
          {d && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {d.rows.map((x) => <Stat key={x.method} label={x.method} value={`${x.ratio.toFixed(2)}x`} sub={`${bytes(x.bytes)} · ${x.saving_pct.toFixed(1)}% ${x.saving_pct >= 0 ? 'saved' : 'larger'}`} />)}
              </div>
              <Card title="Results"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Method</th><th>Size</th><th>Compression ratio</th><th>Size reduction</th><th>MSE</th><th>PSNR (dB)</th><th>Type</th></tr></thead>
                <tbody>{d.rows.map((x) => <tr key={x.method}><td className="font-medium text-white">{x.method}</td><td>{bytes(x.bytes)}</td><td>{x.ratio.toFixed(2)} : 1</td><td style={{ color: x.saving_pct < 0 ? '#f97316' : undefined }}>{x.saving_pct.toFixed(1)}%</td>
                  <td>{x.mse.toFixed(2)}</td><td>{x.psnr == null ? 'infinite' : x.psnr.toFixed(2)}</td><td><Badge ok={x.lossless}>{x.lossless ? 'Lossless' : 'Lossy'}</Badge></td></tr>)}</tbody></table></div></Card>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="File size by method"><Bars unit=" KB" data={d.rows.map((x) => ({ name: x.method.split(' ')[0], kb: +(x.bytes / 1024).toFixed(1) }))} keys={[{ key: 'kb', name: 'Size', color: '#22d3ee' }]} /></Card>
                <Card title="JPEG quality curve" subtitle="Size and PSNR at every quality level.">
                  <Lines data={d.curve} xKey="quality" xLabel="JPEG quality" series={[{ key: 'ratio', name: 'Compression ratio', color: '#3ddc97' }, { key: 'psnr', name: 'PSNR (dB)', color: '#f97316', axis: 'r' }]} />
                </Card>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ImagePanel title="Original" src={d.images.original} /><ImagePanel title={`JPEG decoded (q=${quality})`} src={d.images.jpeg} /><ImagePanel title="Error map" src={d.images.error} caption="Brighter = larger difference from the original." />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Huffman coding" subtitle="Frequent values get shorter codes.">
                  <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
                    <div><div className="text-xs text-muted">Entropy</div><b className="font-display text-xl text-white">{d.huffman.entropy.toFixed(3)}</b><span className="text-xs text-dim"> bits</span></div>
                    <div><div className="text-xs text-muted">Average code</div><b className="font-display text-xl text-white">{d.huffman.avg_length.toFixed(3)}</b><span className="text-xs text-dim"> bits</span></div>
                    <div><div className="text-xs text-muted">Efficiency</div><b className="font-display text-xl text-white">{d.huffman.efficiency.toFixed(1)}%</b></div>
                  </div>
                  <table className="tbl"><thead><tr><th>Value</th><th>Count</th><th>Share</th><th>Code</th></tr></thead>
                    <tbody>{d.huffman.table.map((t) => <tr key={t.symbol}><td>{t.symbol}</td><td>{num(t.freq)}</td><td>{t.pct.toFixed(2)}%</td><td className="font-mono text-scope-soft">{t.code}</td></tr>)}</tbody></table>
                  <p className="mt-3 text-xs text-dim">{d.huffman.roundtrip_ok ? 'Round trip verified: encoding then decoding reproduced the data exactly.' : 'Round trip failed.'} Size includes a 256-byte code-length header.</p>
                </Card>
                <Card title="Run-length encoding" subtitle="Stores (value, count) pairs.">
                  <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
                    <div><div className="text-xs text-muted">Runs</div><b className="font-display text-xl text-white">{num(d.rle.runs)}</b></div>
                    <div><div className="text-xs text-muted">Average run</div><b className="font-display text-xl text-white">{d.rle.avg_run.toFixed(2)}</b></div>
                    <div><div className="text-xs text-muted">Round trip</div><b className="font-display text-xl text-white">{d.rle.roundtrip_ok ? 'exact' : 'failed'}</b></div>
                  </div>
                  <Notice tone="info" title={d.rows[2].ratio < 1 ? 'RLE made this file bigger' : 'RLE helped here'}>
                    RLE only pays off when pixels repeat in long runs, like flat graphics. Natural photos and satellite scenes have noise, so most runs have length 1 and each pair costs 2 bytes.
                  </Notice>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
