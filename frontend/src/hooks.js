import { useCallback, useEffect, useRef, useState } from 'react'

// Runs an async function, keeps loading/error/data, and cancels outdated requests.
export function useRunner(fn) {
  const [state, set] = useState({ data: null, loading: false, error: null })
  const ctl = useRef(null)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const run = useCallback(async (...args) => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    const id = ++seq.current
    set((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fnRef.current(...args, c.signal)
      if (id === seq.current) set({ data, loading: false, error: null })
      return data
    } catch (e) {
      if (e.name === 'AbortError') return undefined
      if (id === seq.current) set((s) => ({ ...s, loading: false, error: e.message }))
      return undefined
    }
  }, [])
  useEffect(() => () => ctl.current?.abort(), [])
  const reset = useCallback(() => set({ data: null, loading: false, error: null }), [])
  return { ...state, run, reset }
}

export function useDebouncedEffect(effect, deps, delay = 350) {
  useEffect(() => {
    const t = setTimeout(effect, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
