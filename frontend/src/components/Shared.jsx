import { useNavigate } from 'react-router-dom'
import { FlaskConical, ImageUp } from 'lucide-react'
import { imgUrl } from '../api'
import { useApp } from '../store'
import { api } from '../api'
import { Button, Empty } from './ui'

export function ImageSelect({ label, value, onChange, allowNone, exclude }) {
  const { images } = useApp()
  const list = images.filter((i) => i.id !== exclude)
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <div className="flex items-center gap-3">
        {value && <img src={imgUrl(value, { thumb: true })} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {allowNone && <option value="">None</option>}
          {list.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.width}x{i.height})</option>)}
        </select>
      </div>
    </label>
  )
}

// Shown on every lab until at least one image exists.
export function NeedImage() {
  const { refreshImages, setActiveId, toast } = useApp()
  const nav = useNavigate()
  const sample = async () => {
    try {
      const m = await api.loadSample('delta_2024')
      await refreshImages()
      setActiveId(m.id)
    } catch (e) { toast(e.message, 'error') }
  }
  return (
    <Empty icon={ImageUp} title="Pick an image to start">
      Upload a satellite or aerial image, or load the built-in sample scene to try every lab right away.
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button icon={FlaskConical} onClick={sample}>Load sample image</Button>
        <Button variant="ghost" onClick={() => nav('/upload')}>Go to Upload Center</Button>
      </div>
    </Empty>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <div className="rounded-xl border border-red-400/30 bg-red-500/[0.08] p-3.5 text-sm text-red-200">{error}</div>
}
