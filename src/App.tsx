import './index.css'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LoginScreen } from '@/components/auth/loginScreen'
import { HomeScreen } from './components/home/homeScreen'
import { DashboardLayout } from './components/layout/layout'


function App() {
  const { session, initializing, init } = useAuthStore()

  useEffect(() => {
    init()
  }, [init])

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