import { useEffect, useState } from 'react'
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
import type { TemplateSummary } from '@/types/entities'
import { Upload, FileWarning } from 'lucide-react'

// NOTE: strings here are hardcoded rather than run through t() — I don't
// have visibility into the locale JSON files (en / pt-BR) this project
// uses elsewhere (see the home:collections.* keys in the screen this
// plugs into), so these need moving into that structure before ship.
// Left as plain strings rather than guessing at key names that might
// collide with or duplicate existing ones.

type Tab = 'official' | 'imported'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (collectionId: string) => void
}

export function UseTemplateDialog({ open, onOpenChange, onCreated }: Props) {
    const [tab, setTab] = useState<Tab>('official')
    const [official, setOfficial] = useState<TemplateSummary[]>([])
    const [imported, setImported] = useState<TemplateSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState<TemplateSummary | null>(null)
    const [collectionName, setCollectionName] = useState('')
    const [importErrors, setImportErrors] = useState<string[] | null>(null)
    const [creating, setCreating] = useState(false)

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

    useEffect(() => {
        if (open) {
            refreshLists()
            setSelected(null)
            setCollectionName('')
            setImportErrors(null)
            // Bundled templates take priority as the default tab if any
            // exist; otherwise land on Imported so a first-time user
            // isn't staring at an empty Official list.
            setTab('official')
        }
    }, [open])

    const list = tab === 'official' ? official : imported

    const handleSelect = (t: TemplateSummary) => {
        setSelected(t)
        setCollectionName(t.template.name)
        setImportErrors(null)
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
            const collectionId = await templateRepository.apply(
                { kind: selected.source, fileName: selected.fileName },
                collectionName.trim(),
                null
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
                    <DialogTitle>New collection from template</DialogTitle>
                    <DialogDescription>
                        Start from a pre-built structure of subgroups, categories, and scoring
                        rules — fully editable once created.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex h-[420px] flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                            <TabsList>
                                <TabsTrigger value="official">Official ({official.length})</TabsTrigger>
                                <TabsTrigger value="imported">Imported ({imported.length})</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <Button variant="outline" size="sm" onClick={handleImport}>
                            <Upload className="h-3.5 w-3.5" />
                            Import template
                        </Button>
                    </div>

                    {importErrors && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                            <FileWarning className="h-3.5 w-3.5 shrink-0" />
                            <ul className="list-disc pl-4">
                                {importErrors.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-1 gap-3 overflow-hidden">
                        {/* Template list */}
                        <div className="w-1/2 overflow-y-auto rounded-md border">
                            {loading ? (
                                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
                            ) : list.length === 0 ? (
                                <p className="p-4 text-sm text-muted-foreground">
                                    {tab === 'official'
                                        ? 'No official templates yet.'
                                        : 'No imported templates yet — use "Import template" above.'}
                                </p>
                            ) : (
                                list.map((t) => (
                                    <button
                                        key={t.fileName}
                                        onClick={() => handleSelect(t)}
                                        className={`block w-full border-b p-2 text-left text-sm last:border-b-0 hover:bg-muted/60 ${selected?.fileName === t.fileName && selected.source === t.source
                                            ? 'bg-muted'
                                            : ''
                                            }`}
                                    >
                                        <p className="font-medium">{t.template.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {t.template.subgroups.length} subgroup
                                            {t.template.subgroups.length === 1 ? '' : 's'} ·{' '}
                                            {t.template.subgroups.reduce((n, sg) => n + sg.categories.length, 0)}{' '}
                                            categories
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Preview + name (NFR-11-04: preview structure before applying) */}
                        <div className="flex w-1/2 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                            {!selected ? (
                                <p className="text-sm text-muted-foreground">
                                    Select a template to preview its structure.
                                </p>
                            ) : (
                                <>
                                    {selected.template.subgroups.map((sg, i) => (
                                        <div key={i} className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium">{sg.name}</p>
                                                {(sg.min_points != null || sg.max_points != null) && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {sg.min_points ?? '–'}–{sg.max_points ?? '–'} pts
                                                    </Badge>
                                                )}
                                            </div>
                                            <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
                                                {sg.categories.map((cat, j) => (
                                                    <li key={j}>
                                                        {cat.name} · {cat.rule.type}
                                                    </li>
                                                ))}
                                            </ul>
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
                            placeholder="Collection name"
                        />
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleCreate}
                        disabled={!selected || !collectionName.trim() || creating}
                    >
                        {creating ? 'Creating…' : 'Create collection'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}