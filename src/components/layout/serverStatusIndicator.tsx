import { useEffect } from 'react'
import { useServerStatusStore } from '@/store/serverStatusStore'
import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ServerStatusIndicator() {
  const { status, check, startPolling } = useServerStatusStore()

  useEffect(() => {
    const stop = startPolling()
    return stop
  }, [startPolling])

  if (status !== 'offline') return null

  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      <WifiOff className="h-3.5 w-3.5" />
      Server unreachable — working offline
      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={check}>
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  )
}