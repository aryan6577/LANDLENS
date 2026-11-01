import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AudioWaveform, Building2, FileArchive, FileText, GitCompareArrows, Home, Info, KeyRound, Layers, LayoutDashboard,
  Leaf, Menu, Droplets, ScanSearch, SlidersHorizontal, UploadCloud, X } from 'lucide-react'
import { imgUrl } from '../api'
import { useApp } from '../store'
import { Toasts } from './ui'

export const NAV = [
  { group: 'Overview', items: [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ] },
  { group: 'Data', items: [{ to: '/upload', label: 'Upload Center', icon: UploadCloud }] },
  { group: 'Analysis labs', items: [
    { to: '/enhance', label: 'Enhancement Lab', icon: SlidersHorizontal },
    { to: '/landcover', label: 'Land Cover Lab', icon: Layers },
    { to: '/vegetation', label: 'Vegetation Lab', icon: Leaf },
    { to: '/water', label: 'Water Lab', icon: Droplets },
    { to: '/urban', label: 'Urban Lab', icon: Building2 },
    { to: '/change', label: 'Change Detection', icon: GitCompareArrows },
    { to: '/frequency', label: 'Frequency Lab', icon: AudioWaveform },
    { to: '/compression', label: 'Compression Lab', icon: FileArchive },
    { to: '/features', label: 'Feature Lab', icon: ScanSearch },
  ] },
  { group: 'Output', items: [{ to: '/reports', label: 'Reports', icon: FileText }] },
  { group: 'Project', items: [
    { to: '/about', label: 'About', icon: Info },
    { to: '/settings', label: 'Settings and API keys', icon: KeyRound },
  ] },
]

export function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0c1629" stroke="rgba(34,211,238,.35)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#3ddc97" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.8" fill="#22d3ee" />
      <path d="M16 3.5v5M16 23.5v5M3.5 16h5M23.5 16h5" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Sidebar({ onNavigate }) {
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo />
        <div>
          <div className="font-display text-lg font-bold leading-none text-white">LandLens</div>
          <div className="mt-1 text-xs text-muted">Satellite image analysis</div>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1.5 px-3 text-xs font-semibold text-dim">{g.group}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate}
                className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${isActive ? 'bg-gradient-to-r from-terra/15 to-scope/10 text-white ring-1 ring-scope/25' : 'text-muted hover:bg-white/[0.04] hover:text-slate-100'}`}>
                {({ isActive }) => (<><it.icon size={17} className={isActive ? 'text-scope' : 'text-dim group-hover:text-muted'} />{it.label}</>)}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}

function Topbar({ onMenu }) {
  const { images, active, setActiveId, online } = useApp()
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.07] bg-ink/75 px-4 py-3 backdrop-blur-xl sm:px-6">
      <button className="btn-ghost btn-sm lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={16} /></button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden text-xs text-muted sm:block">Active image</span>
        {images.length ? (
          <div className="flex min-w-0 max-w-md flex-1 items-center gap-2.5">
            {active && <img src={imgUrl(active.id, { thumb: true })} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-white/15" />}
            <select className="input !py-1.5" value={active?.id || ''} onChange={(e) => setActiveId(e.target.value)} aria-label="Active image">
              {images.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        ) : (
          <button className="btn-ghost btn-sm" onClick={() => nav('/upload')}><UploadCloud size={14} /> Add an image</button>
        )}
      </div>
      <div className={`chip ${online === false ? '!border-red-400/40 !text-red-300' : ''}`} title="Backend connection">
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-terra' : online === false ? 'bg-red-400' : 'bg-amber-300'}`} />
        {online ? 'Backend online' : online === false ? 'Backend offline' : 'Connecting'}
      </div>
    </header>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { toasts, online } = useApp()
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.07] bg-deep/80 backdrop-blur-xl lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/10 bg-deep"><button className="btn-ghost btn-sm absolute right-3 top-4" onClick={() => setOpen(false)} aria-label="Close menu"><X size={14} /></button><Sidebar onNavigate={() => setOpen(false)} /></aside>
        </div>
      )}
      <div className="lg:pl-64">
        <Topbar onMenu={() => setOpen(true)} />
        {online === false && (
          <div className="border-b border-red-400/20 bg-red-500/10 px-6 py-2.5 text-sm text-red-200">
            The backend is not reachable. In the backend folder run <code className="rounded bg-black/30 px-1.5 py-0.5">uvicorn app.main:app --port 8000</code>, then refresh.
          </div>
        )}
        <main key={pathname} className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
      <Toasts toasts={toasts} />
    </div>
  )
}
