import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useCollectionDetail } from '@/hooks/useCollectionDetail'
import { collectionRepository } from '@/repository/collectionRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import { templateRepository } from '@/repository/templateRepository'
import type { Rule } from '@/services/scoringEngine/types'
import type { Category, Collection, Subgroup } from '@/types/entities'
import { EditSubgroupDialog } from './editSubgroupDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, Trash2, Pencil, Check, X, Printer, FileOutput } from 'lucide-react'
import { CategoryFormDialog } from './categoryFormDialog'

const COMPLETION_STYLES: Record<string, string> = {
    incomplete: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    complete: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    exceeded: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
}

// NOTE: takes `t` explicitly rather than calling useTranslation() itself — this is a
// plain helper, not a component/hook, so it can't use hooks. Same shape as the
// validateRule() caveat flagged earlier: logic that produces user-facing text but
// lives outside the component tree needs the translator passed in.
function ruleSummary(rule: Rule, t: (key: string, opts?: Record<string, unknown>) => string): string {
    if (rule.type === 'flat') {
        return t('categories:summary.flatPoints', { count: rule.pointsPerUnit })
    }
    if (rule.type === 'hours') {
        return t('categories:summary.hoursPoints', { count: rule.pointsPerUnit, unitSize: rule.unitSize })
    }
    return t('categories:summary.cappedAt', { inner: ruleSummary(rule.inner, t), cap: rule.cap })
}

export function CollectionDetailScreen() {
    const { t } = useTranslation(['collections', 'categories', 'common'])
    const { collectionId } = useParams<{ collectionId: string }>()
    const { subgroups, score, loading, refresh } = useCollectionDetail(collectionId!)

    const [collection, setCollection] = useState<Collection | null>(null)
    const [openSubgroups, setOpenSubgroups] = useState<string[]>([])

    const [editingName, setEditingName] = useState(false)
    const [nameInput, setNameInput] = useState('')

    const [newSubgroupName, setNewSubgroupName] = useState('')
    const [subgroupDialogOpen, setSubgroupDialogOpen] = useState(false)

    const [categoryDialog, setCategoryDialog] = useState<
        | { mode: 'create'; subgroupId: string }
        | { mode: 'edit'; category: Category }
        | null
    >(null)

    const [editingSubgroup, setEditingSubgroup] = useState<Subgroup | null>(null)

    const [exportingTemplate, setExportingTemplate] = useState(false)
    const [templateExportError, setTemplateExportError] = useState<string | null>(null)

    const navigate = useNavigate()

    const loadCollection = async () => {
        const c = await collectionRepository.get(collectionId!)
        setCollection(c)
        if (c) setNameInput(c.name)
    }

    useEffect(() => {
        loadCollection()
    }, [collectionId])

    if (loading || !collection) {
        return <div className="p-6 text-sm text-muted-foreground">{t('common:states.loading')}</div>
    }

    const scoreFor = (subgroupId: string) => score?.subgroups.find((s) => s.subgroupId === subgroupId)
    const categoryScoreFor = (categoryId: string) =>
        score?.subgroups.flatMap((s) => s.categories).find((c) => c.categoryId === categoryId)

    const handleSaveName = async () => {
        if (!nameInput.trim()) return
        await collectionRepository.rename(collectionId!, nameInput.trim())
        setEditingName(false)
        loadCollection()
    }

    const handleCreateSubgroup = async () => {
        if (!newSubgroupName.trim()) return
        await subgroupRepository.create(collectionId!, newSubgroupName.trim())
        setNewSubgroupName('')
        setSubgroupDialogOpen(false)
        refresh()
    }

    const handleDeleteSubgroup = async (id: string) => {
        await subgroupRepository.delete(id)
        refresh()
    }

    const handleDeleteCategory = async (id: string) => {
        await categoryRepository.delete(id)
        refresh()
    }

    // exportCollectionAsTemplate opens its own native save dialog and
    // returns null if the user cancels it — that's not an error, just
    // nothing to report. Only an explicit { ok: false } is shown.
    const handleExportTemplate = async () => {
        setTemplateExportError(null)
        setExportingTemplate(true)
        try {
            const result = await templateRepository.exportCollection(collectionId!)
            if (result && !result.ok) {
                setTemplateExportError(result.error)
            }
        } finally {
            setExportingTemplate(false)
        }
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    {editingName ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                className="h-9 text-2xl font-semibold"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName()
                                    if (e.key === 'Escape') {
                                        setNameInput(collection.name)
                                        setEditingName(false)
                                    }
                                }}
                            />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName}>
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                    setNameInput(collection.name)
                                    setEditingName(false)
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="group flex items-center gap-2">
                            <h1 className="text-2xl font-semibold">{collection.name}</h1>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                onClick={() => setEditingName(true)}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                        <Trans
                            i18nKey="header.grandTotal"
                            ns="collections"
                            values={{ total: score?.total ?? 0 }}
                            components={{ strong: <span className="font-medium text-foreground" /> }}
                        />
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/collections/${collectionId}/report`)}
                    >
                        <Printer className="h-4 w-4 mr-1.5" />
                        {t('collections:header.exportButton')}
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportTemplate}
                        disabled={exportingTemplate}
                    >
                        <FileOutput className="h-4 w-4 mr-1.5" />
                        {/* NOTE: hardcoded — no visibility into the locale JSON files
                            (see file-reading caveat flagged earlier). Suggest adding
                            collections:header.exportTemplateButton / .exporting to
                            match the naming pattern exportButton already uses. */}
                        {exportingTemplate ? 'Exporting…' : 'Export as template'}
                    </Button>

                    <Dialog open={subgroupDialogOpen} onOpenChange={setSubgroupDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                {t('collections:subgroupCreateDialog.title')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('collections:subgroupCreateDialog.title')}</DialogTitle>
                            </DialogHeader>
                            <Input
                                placeholder={t('collections:subgroupCreateDialog.namePlaceholder')}
                                value={newSubgroupName}
                                onChange={(e) => setNewSubgroupName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateSubgroup()}
                            />
                            <DialogFooter>
                                <Button onClick={handleCreateSubgroup} disabled={!newSubgroupName.trim()}>
                                    {t('common:actions.create')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {templateExportError && (
                <p className="text-sm text-destructive">{templateExportError}</p>
            )}

            {subgroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('collections:emptyStates.noSubgroups')}
                </p>
            ) : (
                <Accordion
                    type="multiple"
                    className="space-y-2"
                    value={openSubgroups}
                    onValueChange={setOpenSubgroups}
                >
                    {subgroups.map((sg) => {
                        const sgScore = scoreFor(sg.id)
                        return (
                            <AccordionItem key={sg.id} value={sg.id} className="rounded-md border px-4">
                                <AccordionTrigger className="hover:no-underline">
                                    <div className="flex flex-1 items-center justify-between pr-4">
                                        <span className="font-medium">{sg.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">
                                                {sg.min_points != null
                                                    ? t('collections:subgroupCard.scoreWithMin', {
                                                        total: sgScore?.total ?? 0,
                                                        min: sg.min_points,
                                                    })
                                                    : t('collections:subgroupCard.scoreNoMin', {
                                                        total: sgScore?.total ?? 0,
                                                    })}
                                            </span>
                                            {sgScore?.completion && (
                                                <Badge className={COMPLETION_STYLES[sgScore.completion]} variant="secondary">
                                                    {t(`collections:completion.${sgScore.completion}`)}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent key={sg.categories.length} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCategoryDialog({ mode: 'create', subgroupId: sg.id })}
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                {t('categories:dialog.createTitle')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setEditingSubgroup(sg)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                                {t('common:actions.edit')}
                                            </Button>
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>
                                                        {t('collections:subgroupCard.deleteConfirm.title', { name: sg.name })}
                                                    </AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {t('collections:subgroupCard.deleteConfirm.description')}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteSubgroup(sg.id)}>
                                                        {t('common:actions.delete')}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>

                                    {sg.categories.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            {t('collections:emptyStates.noCategories')}
                                        </p>
                                    ) : (
                                        <div className="space-y-3">
                                            {sg.categories.map((cat) => {
                                                const catScore = categoryScoreFor(cat.id)
                                                return (
                                                    <div key={cat.id} className="rounded-md border p-3">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-medium">{cat.name}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {ruleSummary(cat.rule, t)}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-sm">
                                                                    {t('collections:categoryCard.scoreSimple', {
                                                                        total: catScore?.total ?? 0,
                                                                    })}
                                                                    {catScore?.capped && (
                                                                        <span className="ml-1 text-xs text-muted-foreground">
                                                                            {t('collections:categoryCard.rawSuffix', {
                                                                                raw: catScore.rawTotal,
                                                                            })}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={() => setCategoryDialog({ mode: 'edit', category: cat })}
                                                                >
                                                                    <Pencil className="h-3 w-3" />
                                                                </Button>
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 text-destructive"
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>
                                                                                {t('collections:categoryCard.deleteConfirm.title', {
                                                                                    name: cat.name,
                                                                                })}
                                                                            </AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                {t('collections:categoryCard.deleteConfirm.description', {
                                                                                    count: cat.documents.length,
                                                                                })}
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>
                                                                                {t('common:actions.cancel')}
                                                                            </AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                onClick={() => handleDeleteCategory(cat.id)}
                                                                            >
                                                                                {t('common:actions.delete')}
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            </div>
                                                        </div>

                                                        {cat.documents.length > 0 && (
                                                            <ul className="mt-2 space-y-1 border-t pt-2">
                                                                {cat.documents.map((doc) => {
                                                                    const contribution = catScore?.breakdown.find(
                                                                        (b) => b.documentId === doc.id
                                                                    )
                                                                    return (
                                                                        <li
                                                                            key={doc.id}
                                                                            className="flex items-center justify-between text-xs text-muted-foreground"
                                                                        >
                                                                            <span>{doc.title}</span>
                                                                            <span>
                                                                                {t('collections:categoryCard.documentPoints', {
                                                                                    points: contribution?.points.toFixed(2) ?? 0,
                                                                                })}
                                                                            </span>
                                                                        </li>
                                                                    )
                                                                })}
                                                            </ul>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}

            <CategoryFormDialog
                open={categoryDialog !== null}
                onOpenChange={(open) => !open && setCategoryDialog(null)}
                onSaved={refresh}
                subgroupId={categoryDialog?.mode === 'create' ? categoryDialog.subgroupId : undefined}
                category={categoryDialog?.mode === 'edit' ? categoryDialog.category : undefined}
            />
            <EditSubgroupDialog
                subgroup={editingSubgroup}
                onOpenChange={(open) => !open && setEditingSubgroup(null)}
                onSaved={refresh}
            />
        </div>
    )
}