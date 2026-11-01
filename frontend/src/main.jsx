import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import './index.css'
import App from './App'
import { AppProvider } from './store'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </HashRouter>
  </React.StrictMode>,
)
