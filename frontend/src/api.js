// All calls to the FastAPI backend live here.
const ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const BASE = `${ROOT}/api`

export const imgUrl = (id, { thumb = false, download = false } = {}) =>
  `${BASE}/images/${id}/file${thumb ? '?thumb=1' : download ? '?download=1' : ''}`

function explain(detail) {
  if (!detail) return 'Something went wrong.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return 'Some input values are not valid: ' + detail.map((d) => (d.loc || []).slice(-1)[0]).join(', ')
  return JSON.stringify(detail)
}

async function req(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method, signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error('Cannot reach the LandLens backend. Start it with: uvicorn app.main:app --port 8000')
  }
  if (!res.ok) {
    let detail
    try { detail = (await res.json()).detail } catch { /* not json */ }
    throw new Error(explain(detail) || `Request failed (${res.status})`)
  }
  return res.json()
}

export const api = {
  health: (signal) => req('/health', { signal }),
  dashboard: () => req('/dashboard'),
  settings: () => req('/settings'),
  saveSettings: (b) => req('/settings', { method: 'POST', body: b }),
  testKey: (which) => req('/settings/test', { method: 'POST', body: { which } }),
  images: () => req('/images'),
  deleteImage: (id) => req(`/images/${id}`, { method: 'DELETE' }),
  samples: () => req('/samples'),
  loadSample: (key) => req(`/samples/${key}/load`, { method: 'POST' }),
  fetchSatellite: (b) => req('/fetch-satellite', { method: 'POST', body: b }),
  enhanceOps: () => req('/enhance/ops'),
  enhance: (b, signal) => req('/enhance', { method: 'POST', body: b, signal }),
  landcover: (b, signal) => req('/landcover', { method: 'POST', body: b, signal }),
  mask: (kind, b, signal) => req(`/mask/${kind}`, { method: 'POST', body: b, signal }),
  ndvi: (b, signal) => req('/ndvi', { method: 'POST', body: b, signal }),
  change: (b, signal) => req('/change', { method: 'POST', body: b, signal }),
  frequency: (b, signal) => req('/frequency', { method: 'POST', body: b, signal }),
  compression: (b, signal) => req('/compression', { method: 'POST', body: b, signal }),
  features: (b, signal) => req('/features', { method: 'POST', body: b, signal }),
  insights: (b) => req('/insights', { method: 'POST', body: b }),
  history: () => req('/history'),
  clearHistory: () => req('/history', { method: 'DELETE' }),
}

export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/images/upload`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* ignore */ }
      xhr.status >= 200 && xhr.status < 300 ? resolve(data) : reject(new Error(explain(data.detail) || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Cannot reach the LandLens backend. Is it running on port 8000?'))
    const fd = new FormData()
    fd.append('file', file)
    xhr.send(fd)
  })
}

export async function downloadFrom(path, fallbackName) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    let detail
    try { detail = (await res.json()).detail } catch { /* ignore */ }
    throw new Error(explain(detail) || `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const name = (cd.match(/filename="?([^"]+)"?/) || [])[1] || fallbackName
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function downloadDataUrl(dataUrl, name) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
}
