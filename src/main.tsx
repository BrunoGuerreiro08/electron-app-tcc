import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider, useTheme } from 'next-themes'
import './i18n/index.ts'
import { usePreferencesStore } from './store/preferenceStore'

// The electron-store preference is the source of truth; next-themes only
// applies the class (its localStorage copy is just a cache against flashes).
function ThemeSync() {
  const theme = usePreferencesStore((s) => s.theme)
  const { setTheme } = useTheme()

  useEffect(() => {
    setTheme(theme)
  }, [theme, setTheme])

  return null
}

usePreferencesStore.getState().load().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ThemeSync />
        <App />
      </ThemeProvider>
    </StrictMode>
  )
})
