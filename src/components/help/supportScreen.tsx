import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Bug, Check, Copy, ExternalLink, Mail, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { appRepository } from '@/repository/appRepository'
import { useAuthStore } from '@/store/authStore'
import { useServerConfigStore } from '@/store/serverConfigStore'
import { useServerInfo, useServerStatusStore, type ServerStatus } from '@/store/serverStatusStore'
import { cn } from '@/lib/utils'

const ISSUES_URL = 'https://github.com/BrunoGuerreiro08/electron-app-tcc/issues'

const STATUS_STYLES: Record<ServerStatus, string> = {
    online: 'text-emerald-700 dark:text-emerald-400',
    offline: 'text-amber-700 dark:text-amber-400',
    mismatch: 'text-destructive',
    unconfigured: 'text-muted-foreground',
    checking: 'text-muted-foreground',
}

function hostOf(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return url
    }
}

function BulletList({ items }: { items: string[] }) {
    return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {items.map((item, i) => (
                <li key={i}>{item}</li>
            ))}
        </ul>
    )
}

export function SupportScreen() {
    const { t } = useTranslation('help')
    const list = (key: string) => t(key, { returnObjects: true }) as string[]

    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-2xl font-semibold">{t('support.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('support.description')}</p>
            </div>

            <ServerCard />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('support.checks.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <BulletList items={list('support.checks.items')} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('support.whoToContact.title')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            <Building2 className="h-4 w-4" />
                            {t('support.whoToContact.institution.title')}
                        </p>
                        <BulletList items={list('support.whoToContact.institution.items')} />
                    </div>
                    <div className="space-y-2">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            <Bug className="h-4 w-4" />
                            {t('support.whoToContact.app.title')}
                        </p>
                        <BulletList items={list('support.whoToContact.app.items')} />
                    </div>
                </CardContent>
            </Card>

            <ReportCard />
        </div>
    )
}

function ServerCard() {
    const { t } = useTranslation('help')
    const navigate = useNavigate()
    const isGuest = useAuthStore((s) => s.session?.isGuest === true)
    const config = useServerConfigStore((s) => s.config)
    const status = useServerStatusStore((s) => s.status)
    const { institutionName, supportEmail, supportUrl } = useServerInfo()

    const openSettings = (
        <Button variant="outline" size="sm" onClick={() => navigate('/settings/preferences')}>
            <Settings className="h-4 w-4" />
            {t('support.server.openSettings')}
        </Button>
    )

    if (isGuest || !config) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('support.server.title')}</CardTitle>
                    <CardDescription>{isGuest ? t('support.server.guest') : t('support.server.noServer')}</CardDescription>
                </CardHeader>
                {!isGuest && <CardContent>{openSettings}</CardContent>}
            </Card>
        )
    }

    const institution = institutionName ?? hostOf(config.url)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{t('support.server.title')}</CardTitle>
                <CardDescription>{t('support.server.runBy', { institution })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t('support.server.address')}</dt>
                    <dd className="break-all">{config.url}</dd>
                    <dt className="text-muted-foreground">{t('support.server.status')}</dt>
                    <dd className={cn('font-medium', STATUS_STYLES[status])}>{t(`support.server.statuses.${status}`)}</dd>
                </dl>

                <p className="text-sm text-muted-foreground">{t('support.server.dependsOn')}</p>

                {supportEmail || supportUrl ? (
                    <div className="flex flex-wrap gap-2">
                        {supportEmail && (
                            <Button size="sm" onClick={() => void appRepository.openExternal(`mailto:${supportEmail}`)}>
                                <Mail className="h-4 w-4" />
                                {t('support.server.contactEmail')}
                            </Button>
                        )}
                        {supportUrl && (
                            <Button size="sm" variant="outline" onClick={() => void appRepository.openExternal(supportUrl)}>
                                <ExternalLink className="h-4 w-4" />
                                {t('support.server.contactPage')}
                            </Button>
                        )}
                    </div>
                ) : (
                    <p className="text-sm font-medium">{t('support.server.noContact', { institution })}</p>
                )}
            </CardContent>
        </Card>
    )
}

function ReportCard() {
    const { t, i18n } = useTranslation('help')
    const config = useServerConfigStore((s) => s.config)
    const status = useServerStatusStore((s) => s.status)
    const isGuest = useAuthStore((s) => s.session?.isGuest === true)
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

    const copyDiagnostics = async () => {
        try {
            const info = await appRepository.info()
            // English on purpose: read by the developers, not by the user. Never includes email or token.
            const text = [
                `Docenti ${info.version}`,
                `OS: ${info.platform} ${info.osRelease} (${info.arch})`,
                `Electron: ${info.electron}`,
                `Language: ${i18n.language}`,
                `Mode: ${isGuest ? 'guest' : 'account'}`,
                `Server: ${config ? `${config.url} (${status})` : 'not configured'}`,
            ].join('\n')
            await navigator.clipboard.writeText(text)
            setCopyState('copied')
        } catch {
            setCopyState('failed')
        }
        setTimeout(() => setCopyState('idle'), 2500)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{t('support.report.title')}</CardTitle>
                <CardDescription>{t('support.report.intro')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <BulletList items={t('support.report.include', { returnObjects: true }) as string[]} />
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void appRepository.openExternal(ISSUES_URL)}>
                        <ExternalLink className="h-4 w-4" />
                        {t('support.report.openIssues')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void copyDiagnostics()}>
                        {copyState === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copyState === 'copied'
                            ? t('support.report.copied')
                            : copyState === 'failed'
                              ? t('support.report.copyFailed')
                              : t('support.report.copyDiagnostics')}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('support.report.privacy')}</p>
            </CardContent>
        </Card>
    )
}
