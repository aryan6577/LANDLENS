import { num } from '../fmt'

export default function ComponentsTable({ rows, className = '' }) {
  if (!rows?.length) return <p className="text-sm text-dim">No regions found with the current settings.</p>
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="tbl">
        <thead><tr><th>#</th><th>Area (px)</th><th>Area (ha)</th><th>Perimeter</th><th>Circularity</th><th>Compactness</th><th>Eccentricity</th><th>Aspect</th><th>Bounding box</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank}>
              <td>{r.rank}</td><td>{num(r.area_px)}</td><td>{num(r.area_ha, 1)}</td><td>{r.perimeter_px.toFixed(0)}</td>
              <td>{r.circularity.toFixed(2)}</td><td>{r.compactness.toFixed(1)}</td><td>{r.eccentricity.toFixed(2)}</td><td>{r.aspect_ratio.toFixed(2)}</td>
              <td className="text-muted">{r.bbox.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
