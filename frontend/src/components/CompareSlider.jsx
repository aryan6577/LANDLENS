import { useRef, useState } from 'react'
import { ChevronsLeftRight } from 'lucide-react'

// Drag the handle to wipe between two images of the same size.
export default function CompareSlider({ a, b, labelA = 'Before', labelB = 'After' }) {
  const [pos, setPos] = useState(50)
  const box = useRef(null)
  const drag = useRef(false)
  const move = (clientX) => {
    const r = box.current.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div ref={box} className="reticle relative cursor-ew-resize select-none overflow-hidden rounded-xl bg-black/40 touch-none"
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX) }}
      onPointerMove={(e) => drag.current && move(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 3)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 3)) }}
      tabIndex={0} role="slider" aria-label="Image comparison" aria-valuenow={Math.round(pos)} aria-valuemin={0} aria-valuemax={100}>
      <img src={b} alt={labelB} className="block w-full" draggable={false} />
      <img src={a} alt={labelA} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
      <div className="absolute inset-y-0 z-10 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(34,211,238,.8)]" style={{ left: `${pos}%` }}>
        <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-scope bg-ink text-scope">
          <ChevronsLeftRight size={16} />
        </div>
      </div>
      <span className="absolute left-3 top-3 z-10 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{labelA}</span>
      <span className="absolute right-3 top-3 z-10 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{labelB}</span>
    </div>
  )
}
