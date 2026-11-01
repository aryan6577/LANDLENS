/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050a16',
        deep: '#081020',
        panel: '#0c1629',
        raised: '#12203a',
        terra: { DEFAULT: '#3ddc97', soft: '#8af0c3', deep: '#1a8f62' },
        scope: { DEFAULT: '#22d3ee', soft: '#8be9f7', deep: '#0e7490' },
        veg: '#34d399',
        water: '#38a0fd',
        urban: '#f97316',
        bare: '#c9a86a',
        muted: '#8da0bd',
        dim: '#5d7090',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'Figtree Variable', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(61,220,151,.35), 0 8px 30px -8px rgba(34,211,238,.35)',
      },
    },
  },
  plugins: [],
}
