import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from 'next-themes'
import { initI18n } from './i18n/index.ts'

initI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <App />
      </ThemeProvider>
    </StrictMode>
  )
})
