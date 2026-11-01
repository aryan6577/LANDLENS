import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: '#5d7090', fontSize: 11, tickLine: false, axisLine: { stroke: 'rgba(148,163,184,.2)' } }
const tip = { contentStyle: { background: '#0c1629', border: '1px solid rgba(148,163,184,.2)', borderRadius: 12, fontSize: 12, color: '#e6edf7' }, itemStyle: { color: '#e6edf7' }, labelStyle: { color: '#8da0bd' } }
const grid = <CartesianGrid stroke="rgba(148,163,184,.1)" vertical={false} />

export function Donut({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v) => `${Number(v).toFixed(2)}%`} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function Bars({ data, keys, height = 260, unit = '%', xKey = 'name' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        {grid}
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} unit={unit} />
        <Tooltip {...tip} cursor={{ fill: 'rgba(255,255,255,.04)' }} formatter={(v) => `${Number(v).toFixed(2)}${unit}`} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={[6, 6, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Histogram({ data, xKey = 'x', series, height = 200, threshold, xFormat }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        {grid}
        <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} {...axis} tickFormatter={xFormat || ((v) => (Number.isInteger(v) ? v : Number(v).toFixed(2)))} />
        <YAxis {...axis} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
        <Tooltip {...tip} formatter={(v) => `${(v * 100).toFixed(2)}%`} labelFormatter={(v) => `value ${Number(v).toFixed(2)}`} />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.18} strokeWidth={1.6} dot={false} />
        ))}
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {threshold != null && <ReferenceLine x={threshold} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'threshold', fill: '#f97316', fontSize: 11, position: 'top' }} />}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function Lines({ data, xKey, series, height = 240, xLabel }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -10, right: 12, top: 8, bottom: xLabel ? 14 : 0 }}>
        {grid}
        <XAxis dataKey={xKey} {...axis} label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -8, fill: '#5d7090', fontSize: 11 } : undefined} />
        {[...new Set(series.map((s) => s.axis || 'l'))].map((id) => <YAxis key={id} yAxisId={id} orientation={id === 'r' ? 'right' : 'left'} {...axis} domain={['auto', 'auto']} />)}
        <Tooltip {...tip} formatter={(v, n) => [typeof v === 'number' ? v.toFixed(2) : v, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => <Line key={s.key} yAxisId={s.axis || 'l'} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={s.dots ? { r: 3 } : false} />)}
      </LineChart>
    </ResponsiveContainer>
  )
}
