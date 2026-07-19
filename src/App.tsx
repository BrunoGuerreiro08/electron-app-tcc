import './index.css'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LoginScreen } from '@/components/auth/loginScreen'
import { DashboardLayout } from './components/layout/layout'
import { useServerStatusStore } from '@/store/serverStatusStore'
import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'

function App() {
  const { session, initializing, init } = useAuthStore()
  const startPolling = useServerStatusStore((s) => s.startPolling)

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const stop = startPolling()
    return stop
  }, [startPolling])

  if (initializing) {
    /* text-muted-foreground */
    return <div className="flex min-h-screen items-center justify-center text-sm ">Loading…</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  return (
    <HashRouter>
      <DashboardLayout>
        <AppRoutes />
      </DashboardLayout>
    </HashRouter>
  )
}

export default App