import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { templateRepository } from '@/repository/templateRepository'
import type { TemplateSummary, DocumentMatchSummary, TemplateError } from '@/types/entities'
import { translateTemplateErrors } from '@/lib/translateTemplateErrors'
import { useAuthStore } from '@/store/authStore'
import { Upload, FileWarning, FileArchive, RefreshCw, CloudOff } from 'lucide-react'

type Tab = 'official' | 'imported'
type SyncState = 'syncing' | 'synced' | 'failed'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (collectionId: string) => void
}

export function UseTemplateDialog({ open, onOpenChange, onCreated }: Props) {
    const { t, i18n } = useTranslation('collections')
    // Guest mode is outside the institution: no official templates (not
    // even cached ones) and no requests to the server for them.
    const isGuest = useAuthStore((s) => s.session?.isGuest === true)
    const [tab, setTab] = useState<Tab>('official')
    const [official, setOfficial] = useState<TemplateSummary[]>([])
    const [imported, setImported] = useState<TemplateSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<TemplateSummary | null>(null)
    const [collectionName, setCollectionName] = useState('')
    const [importErrors, setImportErrors] = useState<TemplateError[] | null>(null)
    const [creating, setCreating] = useState(false)
    const [zipPath, setZipPath] = useState<string | null>(null)
    const [matchSummary, setMatchSummary] = useState<DocumentMatchSummary | null>(null)
    const [matchErrors, setMatchErrors] = useState<TemplateError[] | null>(null)
    const [matching, setMatching] = useState(false)
    const [syncState, setSyncState] = useState<SyncState>('syncing')
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)

    const refreshLists = async () => {
        setLoading(true)
        const [off, imp] = await Promise.all([
            templateRepository.listOfficial(),
            templateRepository.listImported(),
        ])
        setOfficial(off)
        setImported(imp)
        setLoading(false)
    }

    // Lists from the local cache first (instant, works offline), then asks
    // the server for updates and refreshes the official list when it answers.
    const syncOfficial = async () => {
        setSyncState('syncing')
        const result = await templateRepository.syncOfficial()
        setLastSyncedAt(result.lastSyncedAt)
        setSyncState(result.ok ? 'synced' : 'failed')
        if (!result.ok) return

        const off = await templateRepository.listOfficial()
        setOfficial(off)
        // Keep the preview in step with the refreshed list: show the new
        // version if it changed, drop it if the server removed it.
        setSelected((prev) =>
            prev?.source === 'official' ? off.find((tpl) => tpl.fileName === prev.fileName) ?? null : prev
        )
    }

    useEffect(() => {
        if (open) {
            refreshLists()
            if (!isGuest) syncOfficial()
            setSelected(null)
            setCollectionName('')
            setImportErrors(null)
            setZipPath(null)
            setMatchSummary(null)
            setMatchErrors(null)
            // Official first for institutional users; guests only have
            // their own imported templates.
            setTab(isGuest ? 'imported' : 'official')
        }
    }, [open, isGuest])

    const list = tab === 'official' ? official : imported

    // Only a collection_export reused as a template carries a documents[]
    // list per category — plain structure-only templates never do.
    const hasDocumentRefs = (tpl: TemplateSummary): boolean =>
        tpl.template.groups.some((g) =>
            g.subgroups.some((sg) => sg.categories.some((cat) => (cat.documents?.length ?? 0) > 0))
        )

    const handleSelect = (tpl: TemplateSummary) => {
        setSelected(tpl)
        setCollectionName(tpl.template.name)
        setImportErrors(null)
        setZipPath(null)
        setMatchSummary(null)
        setMatchErrors(null)
    }

    const handlePickZip = async () => {
        if (!selected) return
        const path = await templateRepository.pickDocumentsZip()
        if (!path) return

        setZipPath(path)
        setMatchSummary(null)
        setMatchErrors(null)
        setMatching(true)
        try {
            const result = await templateRepository.previewDocumentMatch(
                { kind: selected.source, fileName: selected.fileName },
                path
            )
            if (result.ok) {
                setMatchSummary(result.summary)
            } else {
                setMatchErrors(result.errors)
            }
        } finally {
            setMatching(false)
        }
    }

    const handleImport = async () => {
        setImportErrors(null)
        const result = await templateRepository.pickAndImport()
        if (!result) return // cancelled
        if (!result.ok) {
            setImportErrors(result.errors)
            return
        }
        await refreshLists()
        setTab('imported')
        handleSelect({ fileName: result.fileName, source: 'imported', template: result.template })
    }

    const handleCreate = async () => {
        if (!selected || !collectionName.trim()) return
        setCreating(true)
        try {
            const { collectionId } = await templateRepository.apply(
                { kind: selected.source, fileName: selected.fileName },
                collectionName.trim(),
                null,
                zipPath
            )
            onCreated(collectionId)
            onOpenChange(false)
        } finally {
            setCreating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('useTemplateDialog.title')}</DialogTitle>
                    <DialogDescription>
                        {t('useTemplateDialog.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex h-[420px] flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                            <TabsList>
                                {!isGuest && (
                                    <TabsTrigger value="official">
                                        {t('useTemplateDialog.tabs.official', { count: official.length })}
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="imported">
                                    {t('useTemplateDialog.tabs.imported', { count: imported.length })}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <Button variant="outline" size="sm" onClick={handleImport}>
                            <Upload className="h-3.5 w-3.5" />
                            {t('useTemplateDialog.importButton')}
                        </Button>
                    </div>

                    {tab === 'official' && !isGuest && (
                        <OfficialSyncStatus
                            state={syncState}
                            lastSyncedAt={lastSyncedAt}
                            locale={i18n.language}
                            onRefresh={syncOfficial}
                        />
                    )}

                    {importErrors && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                            <FileWarning className="h-3.5 w-3.5 shrink-0" />
                            <ul className="list-disc pl-4">
                                {translateTemplateErrors(importErrors, t).map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-1 gap-3 overflow-hidden">
                        {/* Template list */}
                        <div className="w-1/2 overflow-y-auto rounded-md border">
                            {loading ? (
                                <p className="p-4 text-sm text-muted-foreground">{t('useTemplateDialog.loading')}</p>
                            ) : list.length === 0 ? (
                                <p className="p-4 text-sm text-muted-foreground">
                                    {tab === 'official'
                                        ? t('useTemplateDialog.emptyOfficial')
                                        : t('useTemplateDialog.emptyImported')}
                                </p>
                            ) : (
                                list.map((tpl) => {
                                    const subgroupCount = tpl.template.groups.reduce(
                                        (n, g) => n + g.subgroups.length,
                                        0
                                    )
                                    const categoryCount = tpl.template.groups.reduce(
                                        (n, g) => n + g.subgroups.reduce((m, sg) => m + sg.categories.length, 0),
                                        0
                                    )
                                    return (
                                        <button
                                            key={tpl.fileName}
                                            onClick={() => handleSelect(tpl)}
                                            className={`block w-full border-b p-2 text-left text-sm last:border-b-0 hover:bg-muted/60 ${selected?.fileName === tpl.fileName && selected.source === tpl.source
                                                    ? 'bg-muted'
                                                    : ''
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium">{tpl.template.name}</p>
                                                {tpl.change && (
                                                    <Badge variant="secondary" className="shrink-0 text-xs">
                                                        {t(`useTemplateDialog.badges.${tpl.change}`)}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {t('useTemplateDialog.summary.groups', { count: tpl.template.groups.length })} ·{' '}
                                                {t('useTemplateDialog.summary.subgroups', { count: subgroupCount })} ·{' '}
                                                {t('useTemplateDialog.summary.categories', { count: categoryCount })}
                                            </p>
                                        </button>
                                    )
                                })
                            )}
                        </div>

                        {/* Preview + name (NFR-11-04: preview structure before applying) */}
                        <div className="flex w-1/2 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                            {!selected ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('useTemplateDialog.selectPrompt')}
                                </p>
                            ) : (
                                <>
                                    {selected.template.groups.map((grp, gi) => (
                                        <div key={gi} className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold">{grp.name}</p>
                                                {(grp.min_points != null || grp.max_points != null) && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {t('useTemplateDialog.pointsRange', {
                                                            min: grp.min_points ?? '–',
                                                            max: grp.max_points ?? '–',
                                                        })}
                                                    </Badge>
                                                )}
                                                {grp.bonus_rate != null && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        {t('useTemplateDialog.surplusBonus', {
                                                            percent: Math.round(grp.bonus_rate * 100),
                                                        })}
                                                    </Badge>
                                                )}
                                            </div>
                                            {grp.subgroups.map((sg, si) => (
                                                <div key={si} className="space-y-1 pl-3">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium">{sg.name}</p>
                                                        {(sg.min_points != null || sg.max_points != null) && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {t('useTemplateDialog.pointsRange', {
                                                                    min: sg.min_points ?? '–',
                                                                    max: sg.max_points ?? '–',
                                                                })}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
                                                        {sg.categories.map((cat, ci) => (
                                                            <li key={ci}>
                                                                {cat.name} · {cat.rule.type}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    {selected && (
                        <Input
                            value={collectionName}
                            onChange={(e) => setCollectionName(e.target.value)}
                            placeholder={t('useTemplateDialog.collectionNamePlaceholder')}
                        />
                    )}

                    {selected && hasDocumentRefs(selected) && (
                        <div className="space-y-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePickZip}
                                disabled={matching}
                                className="w-full"
                            >
                                <FileArchive className="h-3.5 w-3.5" />
                                {matching
                                    ? t('useTemplateDialog.matching')
                                    : zipPath
                                        ? t('useTemplateDialog.changeZip')
                                        : t('useTemplateDialog.addZip')}
                            </Button>

                            {matchErrors && (
                                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                                    <FileWarning className="h-3.5 w-3.5 shrink-0" />
                                    <ul className="list-disc pl-4">
                                        {translateTemplateErrors(matchErrors, t).map((e, i) => (
                                            <li key={i}>{e}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {matchSummary && (
                                <p className="text-xs text-muted-foreground">
                                    {t('useTemplateDialog.matchSummary', {
                                        added: matchSummary.added,
                                        existing: matchSummary.existing,
                                        missing: matchSummary.missing,
                                    })}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleCreate}
                        disabled={!selected || !collectionName.trim() || creating}
                    >
                        {creating ? t('useTemplateDialog.creating') : t('useTemplateDialog.createButton')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function OfficialSyncStatus({
    state,
    lastSyncedAt,
    locale,
    onRefresh,
}: {
    state: SyncState
    lastSyncedAt: number | null
    locale: string
    onRefresh: () => void
}) {
    const { t } = useTranslation('collections')

    let message: string
    if (state === 'syncing') {
        message = t('useTemplateDialog.officialStatus.syncing')
    } else if (state === 'synced' && lastSyncedAt) {
        message = t('useTemplateDialog.officialStatus.synced', {
            time: new Date(lastSyncedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        })
    } else if (lastSyncedAt) {
        message = t('useTemplateDialog.officialStatus.offlineCached', {
            date: new Date(lastSyncedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }),
        })
    } else {
        message = t('useTemplateDialog.officialStatus.neverSynced')
    }

    return (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
                {state === 'failed' && <CloudOff className="h-3.5 w-3.5 shrink-0" />}
                {message}
            </span>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={state === 'syncing'}>
                <RefreshCw className={`h-3.5 w-3.5 ${state === 'syncing' ? 'animate-spin' : ''}`} />
                {t('useTemplateDialog.officialStatus.refresh')}
            </Button>
        </div>
    )
}
