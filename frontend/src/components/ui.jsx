import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Download, Info, Loader2, Maximize2, X, CheckCircle2 } from 'lucide-react'
import { downloadDataUrl } from '../api'

export function Card({ title, subtitle, actions, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function PageHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-scope/30 bg-gradient-to-br from-terra/20 to-scope/10 text-scope">
            <Icon size={22} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Button({ variant = 'primary', icon: Icon, loading, children, small, className = '', ...p }) {
  const cls = { primary: 'btn-primary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant]
  return (
    <button className={`${cls} ${small ? 'btn-sm' : ''} ${className}`} disabled={loading || p.disabled} {...p}>
      {loading ? <Loader2 size={small ? 14 : 16} className="animate-spin" /> : Icon && <Icon size={small ? 14 : 16} />}
      {children}
    </button>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, format, hint }) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="font-display text-sm font-semibold text-white">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--p': `${p}%` }}
        onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
    </div>
  )
}

export function Select({ label, value, onChange, options, hint }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="mt-1.5 text-xs text-dim">{hint}</p>}
    </label>
  )
}

export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl border border-white/10 bg-black/25 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === o.value ? 'bg-gradient-to-r from-terra to-scope text-ink' : 'text-muted hover:text-white'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition ${checked ? 'bg-terra' : 'bg-white/15'}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span>
        <span className="text-sm text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
    </label>
  )
}

export function Stat({ label, value, sub, color }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
        {label}
      </div>
      <div className="mt-1.5 font-display text-3xl font-bold leading-none text-white">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-dim">{sub}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', title, children }) {
  const t = {
    info: ['border-scope/25 bg-scope/[0.06] text-scope-soft', Info],
    warn: ['border-amber-400/25 bg-amber-400/[0.07] text-amber-200', AlertTriangle],
    error: ['border-red-400/30 bg-red-500/[0.08] text-red-200', AlertTriangle],
    ok: ['border-terra/30 bg-terra/[0.07] text-terra-soft', CheckCircle2],
  }[tone]
  const Icon = t[1]
  return (
    <div className={`flex gap-3 rounded-xl border p-3.5 text-sm ${t[0]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="leading-relaxed">
        {title && <div className="font-semibold">{title}</div>}
        <div className="text-slate-300">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="card grid place-items-center px-6 py-14 text-center">
      {Icon && <Icon size={34} className="mb-3 text-scope" />}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-2 max-w-md text-sm text-muted">{children}</div>
    </div>
  )
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-white/10" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition ${value === t.value ? 'border-scope text-white' : 'border-transparent text-muted hover:text-slate-200'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ label }) {
  return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="animate-spin" size={16} />{label}</div>
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5 text-xs text-slate-300">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.name}
        </span>
      ))}
    </div>
  )
}

export function Lightbox({ src, title, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink/95 p-4 backdrop-blur" onClick={onClose}>
      <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
        <span>{title}</span>
        <button className="btn-ghost btn-sm" onClick={onClose}><X size={14} /> Close</button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center">
        <img src={src} alt={title} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>, document.body)
}

// Image with title, scan animation while loading, zoom and download.
export function ImagePanel({ src, title, caption, filename, loading, pixelated, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <figure className={`card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5">
        <figcaption className="text-sm font-medium text-slate-200">{title}</figcaption>
        {src && (
          <div className="flex gap-1">
            <button className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white" title="Enlarge" onClick={() => setOpen(true)}><Maximize2 size={15} /></button>
            <button className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white" title="Download"
              onClick={() => downloadDataUrl(src, filename || `${title.toLowerCase().replace(/\W+/g, '_')}.png`)}><Download size={15} /></button>
          </div>
        )}
      </div>
      <div className={`reticle relative bg-black/40 ${loading ? 'scanning' : ''}`}>
        {src ? (
          <img src={src} alt={title} onClick={() => setOpen(true)} className="block w-full cursor-zoom-in"
            style={pixelated ? { imageRendering: 'pixelated' } : undefined} />
        ) : (
          <div className="skeleton aspect-square w-full" />
        )}
      </div>
      {caption && <div className="px-4 py-2.5 text-xs text-muted">{caption}</div>}
      {open && <Lightbox src={src} title={title} onClose={() => setOpen(false)} />}
    </figure>
  )
}

export function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`rise pointer-events-auto rounded-xl border p-3.5 text-sm shadow-2xl backdrop-blur ${t.tone === 'error' ? 'border-red-400/40 bg-red-950/80 text-red-100' : t.tone === 'ok' ? 'border-terra/40 bg-emerald-950/80 text-emerald-100' : 'border-white/15 bg-panel/90 text-slate-100'}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

export function Th({ children }) { return <th>{children}</th> }

export function Badge({ ok, children }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ok ? 'border-terra/40 bg-terra/10 text-terra-soft' : 'border-amber-400/40 bg-amber-400/10 text-amber-200'}`}>{children}</span>
}
