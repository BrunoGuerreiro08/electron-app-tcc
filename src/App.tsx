import './index.css'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LoginScreen } from '@/components/auth/loginScreen'
import { DashboardLayout } from './components/layout/layout'
import { useServerStatusStore } from '@/store/serverStatusStore'
import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'

function App() {
  const { session, initializing, init, handleServerStatus } = useAuthStore()
  const startPolling = useServerStatusStore((s) => s.startPolling)
  const userId = session?.user.id

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const stop = startPolling()
    return stop
  }, [startPolling])

  // Every health poll feeds the auth state: offline → keep trusting the
  // local token, online → validate/renew it with the server (NFR-14-06).
  useEffect(() => {
    if (!userId) return
    const sync = () => handleServerStatus(useServerStatusStore.getState().status)
    sync()
    return useServerStatusStore.subscribe(sync)
  }, [userId, handleServerStatus])

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