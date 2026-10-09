import { useServerStatusStore } from '@/store/serverStatusStore'
import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

interface ServerStatusIndicatorProps {
  variant?: 'full' | 'icon'
  className?: string
}

export function ServerStatusIndicator({ variant = 'full', className }: ServerStatusIndicatorProps) {
  const { t } = useTranslation();
  // Polling is started once by App.tsx; this only reads the status.
  const { status, check } = useServerStatusStore()

  if (status !== 'offline') return null

  if (variant === 'icon') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20 transition-colors",
              className
            )}
            onClick={check}
          >
            <WifiOff className="h-4 w-4 animate-pulse" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          <span>{t('serverStatus.reconnectTooltip')}</span>
          <RefreshCw className="h-3 w-3 animate-spin-slow" />
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive",
        className
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t('serverStatus.unreachable')}</span>
      <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto shrink-0 text-destructive hover:bg-destructive/20 hover:text-destructive" onClick={check}>
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  )
}