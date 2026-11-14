import './index.css'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { LoginScreen } from '@/components/auth/loginScreen'
import { DashboardLayout } from './components/layout/layout'
import { useServerStatusStore } from '@/store/serverStatusStore'
import { useServerConfigStore } from '@/store/serverConfigStore'
import { useSyncStore } from '@/store/syncStore'
import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'

function App() {
  const { t } = useTranslation()
  const { session, initializing, init, handleServerStatus } = useAuthStore()
  const startPolling = useServerStatusStore((s) => s.startPolling)
  const initSync = useSyncStore((s) => s.init)
  const serverLoaded = useServerConfigStore((s) => s.loaded)
  const loadServer = useServerConfigStore((s) => s.load)
  const userId = session?.user.id
  const isGuest = session?.isGuest === true

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    void loadServer()
  }, [loadServer])

  // Sync runs in the main process; this only mirrors its status and hears
  // when another device's changes were applied.
  useEffect(() => initSync(), [initSync])

  // Guest mode has no relationship with the institution's server, so it
  // never contacts it — not even the periodic health check. Waits for init
  // so a restored guest session doesn't fire one check before it's known.
  useEffect(() => {
    if (initializing || isGuest) return
    const stop = startPolling()
    return stop
  }, [startPolling, initializing, isGuest])

  // Every health poll feeds the auth state: offline → keep trusting the
  // local token, online → validate/renew it with the server (NFR-14-06).
  useEffect(() => {
    if (!userId || isGuest) return
    const sync = () => handleServerStatus(useServerStatusStore.getState().status)
    sync()
    return useServerStatusStore.subscribe(sync)
  }, [userId, isGuest, handleServerStatus])

  if (initializing || !serverLoaded) {
    /* text-muted-foreground */
    return <div className="flex min-h-screen items-center justify-center text-sm ">{t('states.loading')}</div>
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