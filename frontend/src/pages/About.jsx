import { Info } from 'lucide-react'
import { Card, Notice, PageHeader } from '../components/ui'

const ALGOS = [
  ['Enhancement Lab', 'Grayscale, negative, log, gamma, contrast stretching, histogram equalization, CLAHE, Gaussian / median / mean filters, Sobel and Laplacian sharpening.', 'Spatial domain and histogram processing'],
  ['Land Cover Lab', 'Lab colour + texture features, K-means clustering, rule-based cluster naming, morphological opening and closing, connected components.', 'Segmentation, colour models, morphology'],
  ['Vegetation Lab', 'Excess-Green index 2g - r - b on chromatic coordinates, thresholding and Otsu. NDVI = (NIR - Red) / (NIR + Red) for multispectral input only.', 'Colour spaces, thresholding'],
  ['Water Lab', 'Blue-dominance index b - r, smoothness (local standard deviation) filter, Otsu, morphology.', 'Thresholding, texture'],
  ['Urban Lab', 'Local texture, Canny edge density and low HSV saturation combined into a built-up score.', 'Edge detection, texture'],
  ['Change Detection', 'ECC registration, nearest / bilinear / bicubic interpolation, histogram matching, Lab colour difference, Otsu threshold, morphology, class transition matrix.', 'Geometric transforms, interpolation, segmentation'],
  ['Frequency Lab', '2-D DFT by matrix multiplication versus FFT, magnitude spectrum, ideal / Butterworth / Gaussian low-pass and high-pass filters, inverse transform.', 'Frequency-domain filtering (Unit III)'],
  ['Compression Lab', 'JPEG, PNG, run-length encoding and Huffman coding from scratch, compression ratio, MSE and PSNR.', 'Image compression'],
  ['Feature Lab', 'Mean, variance, entropy, area, perimeter, circularity, compactness, eccentricity, aspect ratio, Hu moments, GLCM and Local Binary Patterns.', 'Representation and description (Unit VII)'],
]

export default function About() {
  return (
    <>
      <PageHeader icon={Info} title="About LandLens" subtitle="A web-based satellite image analysis platform built for a Digital Image Processing project. Every result comes from classical algorithms you can explain line by line." />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Methods by module" pad={false}>
          <div className="divide-y divide-white/[0.06]">
            {ALGOS.map(([n, a, t]) => (
              <div key={n} className="px-5 py-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold text-white">{n}</h3><span className="text-xs text-scope">{t}</span></div><p className="mt-1 text-sm leading-relaxed text-muted">{a}</p></div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Notice tone="warn" title="Limitations">
            <ul className="mt-1 list-disc space-y-1.5 pl-4">
              <li>Classes are estimated from colour, intensity and texture. There is no trained model and no ground truth.</li>
              <li>Shadows, dark forest, wet soil and rooftops can be mistaken for other classes.</li>
              <li>An RGB greenness index is not NDVI. Real NDVI needs red and near-infrared bands.</li>
              <li>A changed pixel is not necessarily a real land-use change: season, sun angle and sensor differences all matter.</li>
              <li>Large images are analysed on a copy of at most 1100 px on the longest side for speed.</li>
            </ul>
          </Notice>
          <Card title="Technology">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted">Backend</dt><dd className="text-slate-200">Python, FastAPI, NumPy, OpenCV, scikit-image, scikit-learn, Pillow, tifffile, ReportLab, Matplotlib</dd></div>
              <div><dt className="text-muted">Frontend</dt><dd className="text-slate-200">React, Vite, Tailwind CSS, Recharts, React Router</dd></div>
              <div><dt className="text-muted">Storage</dt><dd className="text-slate-200">Local files in backend/data. No database or account needed.</dd></div>
              <div><dt className="text-muted">Optional services</dt><dd className="text-slate-200">Anthropic API for written interpretation, Mapbox for satellite tiles. Both are off until you add keys.</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
