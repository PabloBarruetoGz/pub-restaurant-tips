import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './sentry'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div>No se pudo cargar la aplicacion.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
