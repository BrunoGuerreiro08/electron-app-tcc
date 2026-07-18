import './index.css'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { LoginScreen } from '@/components/auth/loginScreen'

function App() {
  const { session, initializing, init, logout } = useAuthStore()

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
    <div className="p-4">
      <p className="text-sm text-muted-foreground">Signed in as {session.email}</p>
      <button onClick={logout} className="text-sm underline">
        Log out
      </button>
    </div>
  )
}

export default App