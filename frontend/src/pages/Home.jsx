import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, AudioWaveform, Building2, FileArchive, FileText, FlaskConical, GitCompareArrows, Layers, Leaf, Droplets,
  ScanSearch, SlidersHorizontal, UploadCloud } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { Button, Notice } from '../components/ui'
import { Logo } from '../components/Layout'

function HeroScene() {
  // Same shapes drawn twice: muted "photo" colours underneath, vivid class colours revealed by the sweep.
  const shapes = (c) => (
    <>
      <rect width="400" height="300" fill={c.bare} />
      <path d="M0 0H150C170 40 140 90 110 120C80 150 40 140 0 170Z" fill={c.veg} />
      <path d="M240 300C250 250 300 230 340 250C380 270 400 250 400 300Z" fill={c.veg} />
      <path d="M300 0H400V90C370 110 330 90 310 60C300 40 295 20 300 0Z" fill={c.veg} />
      <path d="M130 300C120 250 160 215 215 205C265 195 285 235 255 275C240 295 230 300 130 300Z" fill={c.water} />
      <path d="M0 220C60 205 100 235 150 225" stroke={c.water} strokeWidth="9" fill="none" strokeLinecap="round" />
      <rect x="190" y="70" width="110" height="82" rx="10" fill={c.urban} />
      <g stroke={c.road} strokeWidth="2" opacity=".75">
        {[205, 222, 239, 256, 273, 290].map((x) => <line key={x} x1={x} y1="70" x2={x} y2="152" />)}
        {[86, 102, 118, 134].map((y) => <line key={y} x1="190" y1={y} x2="300" y2={y} />)}
      </g>
    </>
  )
  return (
    <svg viewBox="0 0 400 300" className="w-full rounded-2xl" role="img" aria-label="A satellite scene being classified into vegetation, water and built-up areas">
      <defs>
        <clipPath id="sweepclip"><rect className="hero-scan" x="0" y="0" width="400" height="300" /></clipPath>
        <filter id="soft"><feGaussianBlur stdDeviation=".6" /></filter>
      </defs>
      <g filter="url(#soft)">{shapes({ bare: '#a98d66', veg: '#3c6b44', water: '#27587f', urban: '#8d8d94', road: '#5d5d66' })}</g>
      <g clipPath="url(#sweepclip)">{shapes({ bare: '#c9a86a', veg: '#34d399', water: '#38a0fd', urban: '#f97316', road: '#7c2d12' })}</g>
      <g className="hero-line"><line x1="0" y1="0" x2="0" y2="300" stroke="#e6fffa" strokeWidth="2" /><line x1="0" y1="0" x2="0" y2="300" stroke="#22d3ee" strokeWidth="8" opacity=".25" /></g>
    </svg>
  )
}

const MODULES = [
  { to: '/upload', icon: UploadCloud, t: 'Upload Center', d: 'JPG, PNG and GeoTIFF with metadata, validation and built-in samples.' },
  { to: '/enhance', icon: SlidersHorizontal, t: 'Enhancement Lab', d: '12 algorithms with live sliders: gamma, CLAHE, Sobel, Laplacian and more.' },
  { to: '/landcover', icon: Layers, t: 'Land Cover Lab', d: 'K-means colour clustering into vegetation, water, built-up and bare land.' },
  { to: '/vegetation', icon: Leaf, t: 'Vegetation Lab', d: 'Excess-Green mask and heatmap, plus real NDVI for multispectral files.' },
  { to: '/water', icon: Droplets, t: 'Water Lab', d: 'Blue-dominance index, Otsu thresholding and morphology.' },
  { to: '/urban', icon: Building2, t: 'Urban Lab', d: 'Texture, edge density and saturation to find built-up regions.' },
  { to: '/change', icon: GitCompareArrows, t: 'Change Detection', d: 'Registers two dates, finds what changed and tracks class transitions.' },
  { to: '/frequency', icon: AudioWaveform, t: 'Frequency Lab', d: 'DFT/FFT spectrum with ideal, Butterworth and Gaussian filters.' },
  { to: '/compression', icon: FileArchive, t: 'Compression Lab', d: 'JPEG, PNG, run-length and Huffman with PSNR and MSE.' },
  { to: '/features', icon: ScanSearch, t: 'Feature Lab', d: 'Statistics, shape descriptors, Hu moments, GLCM and LBP texture.' },
  { to: '/reports', icon: FileText, t: 'Reports', d: 'Download a PDF report or CSV of every number.' },
]

export default function Home() {
  const nav = useNavigate()
  const { refreshImages, setActiveId, setActiveB, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    try {
      const a = await api.loadSample('delta_2024')
      const b = await api.loadSample('delta_2026')
      await refreshImages()
      setActiveId(a.id)
      setActiveB(b.id)
      nav('/landcover')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="rise">
          <div className="mb-5 flex items-center gap-3"><Logo size={40} /><span className="chip">Classical digital image processing, no paid AI needed</span></div>
          <h1 className="text-4xl font-extrabold leading-[1.05] text-white sm:text-6xl">Turn a satellite photo into measured land cover.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Upload an image and LandLens enhances it, separates vegetation, water and built-up areas, compares two dates,
            and writes the numbers into a report you can hand in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button icon={FlaskConical} onClick={start} loading={busy}>Try it with sample imagery</Button>
            <Link to="/upload" className="btn-ghost">Upload your own <ArrowRight size={16} /></Link>
          </div>
        </div>
        <div className="rise [animation-delay:120ms]">
          <div className="card reticle p-3 shadow-glow"><HeroScene /></div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted">
            {[['#34d399', 'Vegetation'], ['#38a0fd', 'Water'], ['#f97316', 'Built-up'], ['#c9a86a', 'Bare land']].map(([c, n]) => (
              <span key={n} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{n}</span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-2xl font-bold text-white">Everything in one workspace</h2>
        <p className="mb-6 text-muted">Pick an image once. Every lab uses it.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((m) => (
            <Link key={m.to} to={m.to} className="card group p-5 transition hover:border-scope/40 hover:bg-raised/60">
              <m.icon className="mb-3 text-scope" size={22} />
              <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{m.t}</h3><ArrowRight size={15} className="text-dim transition group-hover:translate-x-1 group-hover:text-scope" /></div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{m.d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="mb-4 text-2xl font-bold text-white">How a run goes</h2>
          <ol className="space-y-3">
            {['Upload an image or load a sample', 'Enhance it so features stand out', 'Classify land cover and inspect each mask', 'Measure areas, shapes and texture', 'Export the PDF report or CSV'].map((t, i) => (
              <li key={t} className="flex items-center gap-3.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-scope/40 bg-scope/10 font-display text-sm font-bold text-scope">{i + 1}</span>
                <span className="text-slate-200">{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <Notice tone="info" title="Honest by design">
          Every classification here is an estimate built from colour, intensity and texture. LandLens does not claim a detected region is a verified
          geographic feature, and an RGB image never gets labelled NDVI. Real NDVI is available only when you upload a file with red and near-infrared bands.
        </Notice>
      </section>
    </div>
  )
}
