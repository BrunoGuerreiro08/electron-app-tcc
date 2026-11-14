import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useServerConfigStore } from '@/store/serverConfigStore'
import { useServerInfo, useServerStatusStore } from '@/store/serverStatusStore'
import { useAuthStore } from '@/store/authStore'
import { isInsecureRemoteUrl, normalizeServerUrl, type ServerConfig } from '../../../shared/serverUrl'
import { formatDomains } from '../../../shared/emailPolicy'

type Feedback = 'saved-unverified' | 'invalid-url' | 'unreachable' | 'not-docenti' | null

/**
 * Enter/verify/save the server base URL. A save that would cross to another
 * server while signed in is handed to `onRequiresLogout` instead.
 */
export function ServerUrlField({
    onRequiresLogout,
    onSaved,
}: {
    onRequiresLogout?: (url: string) => void
    onSaved?: (config: ServerConfig) => void
}) {
    const { t } = useTranslation()
    const config = useServerConfigStore((s) => s.config)
    const save = useServerConfigStore((s) => s.save)
    const status = useServerStatusStore((s) => s.status)
    const { institutionName, allowedEmailDomains } = useServerInfo()
    const hasSession = useAuthStore((s) => s.session !== null)
    const reloadSession = useAuthStore((s) => s.reloadSession)

    const [input, setInput] = useState(config?.url ?? '')
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState<Feedback>(null)

    const normalized = normalizeServerUrl(input)
    const unchanged = normalized !== null && normalized === config?.url && !!config?.serverId && status !== 'mismatch'
    const verified = unchanged && status === 'online'

    const submit = async () => {
        setSaving(true)
        setFeedback(null)
        try {
            const result = await save(input)
            if (result.ok) {
                setInput(result.config.url)
                if (!result.config.serverId) setFeedback('saved-unverified')
                // The main process may have bound a pre-existing session to this server.
                if (hasSession) await reloadSession()
                onSaved?.(result.config)
            } else if (result.reason === 'requires-logout') {
                onRequiresLogout?.(normalized ?? input)
            } else {
                setFeedback(result.reason)
            }
        } finally {
            setSaving(false)
        }
    }

    return (
        <form
            className="space-y-2"
            onSubmit={(e) => {
                e.preventDefault()
                void submit()
            }}
        >
            <Label htmlFor="server-url">{t('serverConfig.label')}</Label>
            <div className="flex gap-2">
                <Input
                    id="server-url"
                    placeholder={t('serverConfig.placeholder')}
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value)
                        setFeedback(null)
                    }}
                    spellCheck={false}
                    autoComplete="url"
                />
                <Button type="submit" variant="outline" disabled={saving || !input.trim() || unchanged}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('serverConfig.save')}
                </Button>
            </div>

            {verified && (
                <div className="space-y-1 text-xs">
                    <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t('serverConfig.verified')}
                    </p>
                    {institutionName && (
                        <p className="text-muted-foreground">{t('serverConfig.institution', { name: institutionName })}</p>
                    )}
                    <p className="text-muted-foreground">
                        {allowedEmailDomains.length > 0
                            ? t('serverConfig.allowedDomains', { domains: formatDomains(allowedEmailDomains) })
                            : t('serverConfig.anyEmail')}
                    </p>
                </div>
            )}
            {unchanged && status === 'offline' && (
                <p className="text-xs text-muted-foreground">{t('serverConfig.currentlyOffline')}</p>
            )}
            {normalized === config?.url && status === 'mismatch' && (
                <p className="text-xs text-destructive">{t('serverConfig.identityChanged')}</p>
            )}
            {feedback && (
                <p className={feedback === 'saved-unverified' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
                    {t(`serverConfig.feedback.${feedback}`)}
                </p>
            )}
            {normalized && isInsecureRemoteUrl(normalized) && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t('serverConfig.insecure')}
                </p>
            )}
            {!config && !input && <p className="text-xs text-muted-foreground">{t('serverConfig.hint')}</p>}
        </form>
    )
}
