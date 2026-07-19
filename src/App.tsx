import './index.css'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LoginScreen } from '@/components/auth/loginScreen'
import { HomeScreen } from './components/home/homeScreen'
import { DashboardLayout } from './components/layout/layout'
import { useServerStatusStore } from '@/store/serverStatusStore'

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
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  return (
    <DashboardLayout>
      <HomeScreen />
    </DashboardLayout>
  )
}

export default App