export const pct = (v, d = 1) => (v == null || Number.isNaN(v) ? '-' : `${Number(v).toFixed(d)}%`)
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '-' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }))
export const bytes = (b) => {
  if (b == null) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}
export const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
export const CLASS_COLORS = { 'Bare land': '#c9a86a', Vegetation: '#34d399', Water: '#38a0fd', 'Built-up': '#f97316' }
export const KIND_LABEL = {
  landcover: 'Land cover', vegetation: 'Vegetation', water: 'Water', urban: 'Built-up', change: 'Change detection',
  ndvi: 'NDVI', compression: 'Compression', features: 'Features', report: 'Report',
}
