import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, Save, ShieldCheck, Sparkles, MapPin } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { Button, Card, Notice, PageHeader } from '../components/ui'

function KeyCard({ icon: Icon, title, desc, state, which, field, placeholder, link, linkLabel, children, extra }) {
  const { refreshSettings, toast } = useApp()
  const [val, setVal] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState(null)
  const save = async () => {
    if (!val.trim()) return toast('Paste a key first.', 'error')
    setBusy(true)
    try { await api.saveSettings({ [field]: val.trim(), ...(extra ? extra() : {}) }); setVal(''); await refreshSettings(); toast(`${title} saved`, 'ok') }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const remove = async () => { await api.saveSettings({ [field]: '' }); await refreshSettings(); setTest(null); toast(`${title} removed`) }
  const runTest = async () => {
    setBusy(true); setTest(null)
    try { setTest(await api.testKey(which)) } catch (e) { setTest({ ok: false, message: e.message }) } finally { setBusy(false) }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-scope/30 bg-scope/10 text-scope"><Icon size={20} /></div>
          <div><h3 className="text-lg font-semibold text-white">{title}</h3><p className="max-w-xl text-sm text-muted">{desc}</p></div>
        </div>
        {state?.configured
          ? <span className="chip !border-terra/40 !text-terra-soft"><CheckCircle2 size={14} /> Saved {state.masked}</span>
          : <span className="chip">Not set</span>}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <span className="label">{state?.configured ? 'Replace key' : 'Paste key'}</span>
          <div className="relative">
            <input className="input pr-11 font-mono" type={show ? 'text' : 'password'} value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} autoComplete="off" spellCheck="false" />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-white" onClick={() => setShow(!show)} aria-label={show ? 'Hide key' : 'Show key'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </label>
        <div className="flex gap-2">
          <Button icon={Save} onClick={save} loading={busy}>Save</Button>
          <Button variant="ghost" onClick={runTest} disabled={!state?.configured || busy}>Test key</Button>
          {state?.configured && <Button variant="danger" onClick={remove}>Remove</Button>}
        </div>
      </div>
      {children}
      {test && <div className="mt-4"><Notice tone={test.ok ? 'ok' : 'error'}>{test.message}</Notice></div>}
      <a href={link} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-scope hover:underline">{linkLabel}</a>
    </Card>
  )
}

export default function Settings() {
  const { settings, refreshSettings, toast } = useApp()
  const [model, setModel] = useState('')
  const [gsd, setGsd] = useState('')
  useEffect(() => { if (settings) { setModel(settings.anthropic.model); setGsd(String(settings.gsd_m)) } }, [settings])
  const saveGsd = async () => { try { await api.saveSettings({ gsd_m: Number(gsd) }); await refreshSettings(); toast('Default resolution saved', 'ok') } catch (e) { toast(e.message, 'error') } }
  const saveModel = async () => { try { await api.saveSettings({ anthropic_model: model.trim() }); await refreshSettings(); toast('Model saved', 'ok') } catch (e) { toast(e.message, 'error') } }

  return (
    <>
      <PageHeader icon={KeyRound} title="Settings and API keys" subtitle="Paste your keys here after setup. Both are optional: every algorithm in LandLens runs without them." />
      <div className="space-y-6">
        <Notice tone="info" title="Where the keys go">
          Keys are sent once to your own backend and stored in <code className="rounded bg-black/30 px-1">backend/data/settings.json</code>. The browser only ever sees a masked
          version. You can also set <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> and <code className="rounded bg-black/30 px-1">MAPBOX_TOKEN</code> in <code className="rounded bg-black/30 px-1">backend/.env</code> instead.
        </Notice>

        <KeyCard icon={Sparkles} title="Anthropic API key" which="anthropic" field="anthropic_api_key" state={settings?.anthropic} placeholder="sk-ant-..."
          desc="Turns your numbers into a short written interpretation in the Reports page and inside the PDF. The image analysis itself never uses AI."
          link="https://console.anthropic.com/settings/keys" linkLabel="Get a key from the Anthropic Console">
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label><span className="label">Model name</span><input className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)} /></label>
            <Button variant="ghost" onClick={saveModel}>Save model</Button>
          </div>
        </KeyCard>

        <KeyCard icon={MapPin} title="Mapbox access token" which="mapbox" field="mapbox_token" state={settings?.mapbox} placeholder="pk.eyJ1..."
          desc="Lets the Upload Center fetch real satellite imagery for any latitude and longitude. A free Mapbox account is enough."
          link="https://account.mapbox.com/access-tokens/" linkLabel="Create a public token on Mapbox" />

        <Card title="Analysis defaults" subtitle="Used to convert pixels to hectares and square kilometres.">
          <div className="grid max-w-xl gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label><span className="label">Ground resolution (metres per pixel)</span><input className="input" type="number" min="0.01" step="any" value={gsd} onChange={(e) => setGsd(e.target.value)} /></label>
            <Button icon={Save} onClick={saveGsd}>Save</Button>
          </div>
          <p className="mt-3 text-sm text-dim">Sentinel-2 is 10 m, Landsat 30 m, aerial photos are often 0.3 to 1 m. Pixel percentages do not change with this value, only the area units do.</p>
        </Card>

        <div className="flex items-start gap-3 text-sm text-muted"><ShieldCheck className="mt-0.5 shrink-0 text-terra" size={18} />
          <span>Never commit <code className="rounded bg-black/30 px-1">backend/data/</code> or <code className="rounded bg-black/30 px-1">.env</code> to GitHub. Both are already in .gitignore.</span></div>
      </div>
    </>
  )
}
