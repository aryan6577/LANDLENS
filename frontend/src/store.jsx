import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [images, setImages] = useState([])
  const [activeId, setActiveIdState] = useState(() => localStorage.getItem('ts.active') || '')
  const [activeB, setActiveBState] = useState(() => localStorage.getItem('ts.activeB') || '')
  const [online, setOnline] = useState(null)
  const [settings, setSettings] = useState(null)
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500)
  }, [])

  const refreshImages = useCallback(async () => {
    try {
      const list = await api.images()
      setImages(list)
      setOnline(true)
      return list
    } catch {
      setOnline(false)
      return []
    }
  }, [])
  const refreshSettings = useCallback(() => api.settings().then(setSettings).catch(() => {}), [])

  useEffect(() => {
    refreshImages()
    refreshSettings()
    const t = setInterval(() => api.health().then(() => setOnline(true)).catch(() => setOnline(false)), 15000)
    return () => clearInterval(t)
  }, [refreshImages, refreshSettings])

  // keep the selection valid
  useEffect(() => {
    if (!images.length) return
    if (!images.find((i) => i.id === activeId)) setActiveIdState(images[0].id)
    if (activeB && !images.find((i) => i.id === activeB)) setActiveBState('')
  }, [images, activeId, activeB])

  const setActiveId = (id) => { setActiveIdState(id); localStorage.setItem('ts.active', id) }
  const setActiveB = (id) => { setActiveBState(id); localStorage.setItem('ts.activeB', id) }
  const active = useMemo(() => images.find((i) => i.id === activeId) || null, [images, activeId])
  const imageB = useMemo(() => images.find((i) => i.id === activeB) || null, [images, activeB])

  const value = { images, refreshImages, active, activeId: active?.id || '', setActiveId, imageB, activeB, setActiveB,
    online, settings, refreshSettings, toast, toasts }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
