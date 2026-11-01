import { useState } from 'react'
import { AudioWaveform } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { useDebouncedEffect, useRunner } from '../hooks'
import { Card, ImagePanel, PageHeader, Segmented, Select, Slider, Stat } from '../components/ui'
import { ErrorNote, NeedImage } from '../components/Shared'
import { Lines } from '../components/charts'

export default function Frequency() {
  const { active } = useApp()
  const [ftype, setFtype] = useState('lowpass')
  const [shape, setShape] = useState('gaussian')
  const [d0, setD0] = useState(30)
  const [order, setOrder] = useState(2)
  const [size, setSize] = useState(256)
  const r = useRunner((b, s) => api.frequency(b, s))
  useDebouncedEffect(() => { if (active) r.run({ image_id: active.id, ftype, shape, d0, order, size }) }, [active?.id, ftype, shape, d0, order, size], 250)
  if (!active) return <><PageHeader icon={AudioWaveform} title="Frequency Lab" /><NeedImage /></>
  const d = r.data
  const im = d?.images || {}
  return (
    <>
      <PageHeader icon={AudioWaveform} title="Frequency Lab" subtitle="Transform the image with the 2-D FFT, multiply the spectrum by a filter mask, then invert it. Low-pass blurs; high-pass keeps edges and fine detail." />
      <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
        <Card title="Filter">
          <div className="space-y-5">
            <Segmented value={ftype} onChange={setFtype} options={[{ value: 'lowpass', label: 'Low-pass' }, { value: 'highpass', label: 'High-pass' }]} />
            <Select label="Filter shape" value={shape} onChange={setShape} options={[{ value: 'ideal', label: 'Ideal' }, { value: 'butterworth', label: 'Butterworth' }, { value: 'gaussian', label: 'Gaussian' }]} />
            <Slider label="Cutoff frequency D0" min={1} max={size / 2} step={1} value={Math.min(d0, size / 2)} onChange={setD0} format={(v) => `${v} px`} hint="Distance from the spectrum centre." />
            {shape === 'butterworth' && <Slider label="Order n" min={1} max={10} value={order} onChange={setOrder} />}
            <Select label="Working size" value={size} onChange={(v) => setSize(Number(v))} options={[128, 256, 384, 512].map((v) => ({ value: v, label: `${v} x ${v}` }))} hint="The image is centre-cropped to a square." />
            {d && <div className="rounded-xl bg-black/25 p-3.5 font-mono text-sm text-scope-soft">{d.formula}</div>}
            {shape === 'ideal' && <p className="text-xs text-dim">The ideal filter's sharp edge causes ringing (ripples) around edges in the result.</p>}
          </div>
        </Card>
        <div className="space-y-6">
          <ErrorNote error={r.error} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ImagePanel title="1. Original (grayscale)" src={im.original} loading={r.loading} />
            <ImagePanel title="2. Fourier magnitude spectrum" src={im.spectrum} loading={r.loading} caption="log(1 + |F|), DC term in the centre." />
            <ImagePanel title="3. Filter mask H(u,v)" src={im.mask} loading={r.loading} caption="White passes, black blocks." />
            <ImagePanel title="4. Filtered spectrum" src={im.filtered_spectrum} loading={r.loading} caption="F(u,v) x H(u,v)" />
            <ImagePanel title="5. Reconstructed image" src={im.reconstructed} loading={r.loading} caption="Inverse FFT of the filtered spectrum." className="sm:col-span-2 lg:col-span-2" />
          </div>
          {d && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Energy kept" value={`${d.energy_retained_pct.toFixed(1)}%`} sub="of spectrum power" />
                <Stat label="DFT time" value={`${d.dft_vs_fft.dft_ms.toFixed(2)} ms`} sub={`${d.dft_vs_fft.size}x${d.dft_vs_fft.size}, direct matrix`} />
                <Stat label="FFT time" value={`${d.dft_vs_fft.fft_ms.toFixed(2)} ms`} sub={`${d.dft_vs_fft.speedup.toFixed(1)}x faster`} />
                <Stat label="DFT vs FFT error" value={d.dft_vs_fft.max_error.toExponential(1)} sub="same result" />
              </div>
              <Card title="Radial spectrum profile" subtitle="Average log-magnitude at each distance from the centre, before and after filtering, with the filter response.">
                <Lines data={d.profile} xKey="r" xLabel="Distance from centre (px)" series={[
                  { key: 'original', name: 'Original spectrum', color: '#8da0bd' }, { key: 'filtered', name: 'Filtered spectrum', color: '#3ddc97' }, { key: 'filter', name: 'Filter response H', color: '#f97316', axis: 'r' }]} />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
