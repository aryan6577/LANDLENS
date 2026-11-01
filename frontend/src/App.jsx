import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Enhancement from './pages/Enhancement'
import LandCover from './pages/LandCover'
import { Vegetation, Water, Urban } from './pages/MaskLabs'
import Change from './pages/Change'
import Frequency from './pages/Frequency'
import Compression from './pages/Compression'
import Features from './pages/Features'
import Reports from './pages/Reports'
import About from './pages/About'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="upload" element={<Upload />} />
        <Route path="enhance" element={<Enhancement />} />
        <Route path="landcover" element={<LandCover />} />
        <Route path="vegetation" element={<Vegetation />} />
        <Route path="water" element={<Water />} />
        <Route path="urban" element={<Urban />} />
        <Route path="change" element={<Change />} />
        <Route path="frequency" element={<Frequency />} />
        <Route path="compression" element={<Compression />} />
        <Route path="features" element={<Features />} />
        <Route path="reports" element={<Reports />} />
        <Route path="about" element={<About />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}
