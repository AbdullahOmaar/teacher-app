import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// خط IBM Plex Sans Arabic مضمّن محلياً (woff2 عبر @fontsource) —
// بلا أي اعتماد على Google Fonts، فيعمل أوفلاين ومع PWA (بحث UIUX §4/§5)
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
