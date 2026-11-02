import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useCollectionDetail } from '@/hooks/useCollectionDetail'
import type { CategoryWithDocuments, GroupWithSubgroups, SubgroupWithCategories } from '@/hooks/useCollectionDetail'
import { collectionRepository } from '@/repository/collectionRepository'
import { groupRepository } from '@/repository/groupRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import { templateRepository } from '@/repository/templateRepository'
import { syncRepository } from '@/repository/syncRepository'
import { useSyncStore } from '@/store/syncStore'
import { useAuthStore } from '@/store/authStore'
import { formatPoints } from '@/lib/formatPoints'
import { ruleSummary } from '@/lib/ruleSummary'
import type { Category, Collection } from '@/types/entities'
import { EditGroupDialog } from './editGroupDialog'
import { EditSubgroupDialog } from './editSubgroupDialog'
import { BulkLinkDialog } from './bulkLinkDialog'
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
import { Plus, Trash2, Pencil, Check, X, Printer, FileOutput, Link2, Cloud, CloudOff } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CategoryFormDialog } from './categoryFormDialog'
import { DeleteCollectionDialog } from './deleteCollectionDialog'

const COMPLETION_STYLES: Record<string, string> = {
    incomplete: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    complete: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    exceeded: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
}

export function CollectionDetailScreen() {
    const { t } = useTranslation(['collections', 'categories', 'common'])
    const { collectionId } = useParams<{ collectionId: string }>()
    const { groups, score, loading, refresh } = useCollectionDetail(collectionId!)

    const [collection, setCollection] = useState<Collection | null>(null)
    const [openGroups, setOpenGroups] = useState<string[]>([])
    const [openSubgroups, setOpenSubgroups] = useState<string[]>([])

    const [editingName, setEditingName] = useState(false)
    const [nameInput, setNameInput] = useState('')

    const [newGroupName, setNewGroupName] = useState('')
    const [groupDialogOpen, setGroupDialogOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<GroupWithSubgroups | null>(null)
    const [bulkLinkCategory, setBulkLinkCategory] = useState<CategoryWithDocuments | null>(null)

    const [newSubgroupName, setNewSubgroupName] = useState('')
    const [subgroupDialogGroupId, setSubgroupDialogGroupId] = useState<string | null>(null)
    const [creatingSubgroup, setCreatingSubgroup] = useState(false)
    const [subgroupError, setSubgroupError] = useState<string | null>(null)

    const [categoryDialog, setCategoryDialog] = useState<
        | { mode: 'create'; subgroupId: string }
        | { mode: 'edit'; category: Category }
        | null
    >(null)

    const [editingSubgroup, setEditingSubgroup] = useState<SubgroupWithCategories | null>(null)

    const [exportingTemplate, setExportingTemplate] = useState(false)
    const [templateExportError, setTemplateExportError] = useState<string | null>(null)

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [stopSyncOpen, setStopSyncOpen] = useState(false)

    const navigate = useNavigate()
    const isGuest = useAuthStore((s) => s.session?.isGuest === true)
    const dataVersion = useSyncStore((s) => s.dataVersion)

    const loadCollection = async () => {
        const c = await collectionRepository.get(collectionId!)
        // Deleted on another device while open here.
        if (!c) return navigate('/')
        setCollection(c)
        setNameInput(c.name)
    }

    useEffect(() => {
        loadCollection()
    }, [collectionId, dataVersion])

    if (loading || !collection) {
        return <div className="p-6 text-sm text-muted-foreground">{t('common:states.loading')}</div>
    }

    const groupScoreFor = (groupId: string) => score?.groups.find((g) => g.groupId === groupId)
    const subgroupScoreFor = (subgroupId: string) =>
        score?.groups.flatMap((g) => g.subgroups).find((s) => s.subgroupId === subgroupId)
    const categoryScoreFor = (categoryId: string) =>
        score?.groups
            .flatMap((g) => g.subgroups)
            .flatMap((s) => s.categories)
            .find((c) => c.categoryId === categoryId)

    const handleSaveName = async () => {
        if (!nameInput.trim()) return
        await collectionRepository.rename(collectionId!, nameInput.trim())
        setEditingName(false)
        loadCollection()
    }

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return
        await groupRepository.create(collectionId!, newGroupName.trim())
        setNewGroupName('')
        setGroupDialogOpen(false)
        refresh()
    }

    const handleDeleteGroup = async (id: string) => {
        await groupRepository.delete(id)
        refresh()
    }

    const handleCreateSubgroup = async () => {
        if (!newSubgroupName.trim() || !subgroupDialogGroupId) return
        setSubgroupError(null)
        setCreatingSubgroup(true)
        try {
            await subgroupRepository.create(collectionId!, subgroupDialogGroupId, newSubgroupName.trim())
            setNewSubgroupName('')
            setSubgroupDialogGroupId(null)
            refresh()
        } catch (err) {
            console.error('Failed to create subgroup:', err)
            setSubgroupError(
                err instanceof Error ? err.message : 'Não foi possível criar o subgrupo. Tente novamente.'
            )
        } finally {
            setCreatingSubgroup(false)
        }
    }

    const handleDeleteSubgroup = async (id: string) => {
        await subgroupRepository.delete(id)
        refresh()
    }

    const handleDeleteCategory = async (id: string) => {
        await categoryRepository.delete(id)
        refresh()
    }

    const handleSetSync = async (enabled: boolean) => {
        await syncRepository.setCollectionEnabled(collectionId!, enabled)
        setStopSyncOpen(false)
        loadCollection()
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
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                                onClick={() => setDeleteDialogOpen(true)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                        <Trans
                            i18nKey="header.grandTotal"
                            ns="collections"
                            values={{ total: formatPoints(score?.total ?? 0) }}
                            components={{ strong: <span className="font-medium text-foreground" /> }}
                        />
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {!isGuest && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        collection.sync_enabled === 0 ? handleSetSync(true) : setStopSyncOpen(true)
                                    }
                                >
                                    {collection.sync_enabled === 0 ? (
                                        <CloudOff className="h-4 w-4 mr-1.5" />
                                    ) : (
                                        <Cloud className="h-4 w-4 mr-1.5" />
                                    )}
                                    {collection.sync_enabled === 0
                                        ? t('collections:sync.disabled')
                                        : t('collections:sync.enabled')}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64">
                                {collection.sync_enabled === 0
                                    ? t('collections:sync.disabledTooltip')
                                    : t('collections:sync.enabledTooltip')}
                            </TooltipContent>
                        </Tooltip>
                    )}

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
                        {exportingTemplate
                            ? t('collections:header.exportingTemplate')
                            : t('collections:header.exportTemplateButton')}
                    </Button>

                    <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                {t('collections:groupCreateDialog.title')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>
                                    {t('collections:groupCreateDialog.title')}
                                </DialogTitle>
                            </DialogHeader>
                            <Input
                                placeholder={t('collections:groupCreateDialog.namePlaceholder')}
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                            />
                            <DialogFooter>
                                <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
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
            <Dialog
                open={subgroupDialogGroupId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSubgroupDialogGroupId(null)
                        setSubgroupError(null)
                    }
                }}
            >
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
                    {subgroupError && (
                        <p role="alert" className="text-sm text-destructive">
                            {subgroupError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            onClick={handleCreateSubgroup}
                            disabled={!newSubgroupName.trim() || creatingSubgroup}
                        >
                            {creatingSubgroup ? t('common:states.loading') : t('common:actions.create')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('collections:emptyStates.noSubgroups')}
                </p>
            ) : (
                <Accordion
                    type="multiple"
                    className="space-y-2"
                    value={openGroups}
                    onValueChange={setOpenGroups}
                >
                    {groups.map((g) => {
                        const gScore = groupScoreFor(g.id)
                        return (
                            <AccordionItem key={g.id} value={g.id} className="rounded-md border px-4">
                                <AccordionTrigger className="hover:no-underline">
                                    <div className="flex flex-1 items-center justify-between pr-4">
                                        <span className="font-semibold">{g.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">
                                                {g.min_points != null
                                                    ? t('collections:subgroupCard.scoreWithMin', {
                                                        total: formatPoints(gScore?.total ?? 0),
                                                        min: formatPoints(g.min_points),
                                                    })
                                                    : t('collections:subgroupCard.scoreNoMin', {
                                                        total: formatPoints(gScore?.total ?? 0),
                                                    })}
                                            </span>
                                            {gScore?.bonus != null && gScore.bonus > 0 && (
                                                <Badge variant="secondary" className="text-xs">
                                                    +{formatPoints(gScore.bonus)} bonus
                                                </Badge>
                                            )}
                                            {gScore?.completion && (
                                                <Badge className={COMPLETION_STYLES[gScore.completion]} variant="secondary">
                                                    {t(`collections:completion.${gScore.completion}`)}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent
                                    key={g.subgroups.map((sg) => openSubgroups.includes(sg.id)).join(',')}
                                    className="space-y-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSubgroupDialogGroupId(g.id)}
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                {t('collections:subgroupCreateDialog.title')}
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setEditingGroup(g)}>
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
                                                        {t('collections:subgroupCard.deleteConfirm.title', { name: g.name })}
                                                    </AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {t('collections:subgroupCard.deleteConfirm.description')}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteGroup(g.id)}>
                                                        {t('common:actions.delete')}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>

                                    {g.subgroups.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            {t('collections:emptyStates.noSubgroups')}
                                        </p>
                                    ) : (
                                        <Accordion
                                            type="multiple"
                                            className="space-y-2"
                                            value={openSubgroups}
                                            onValueChange={setOpenSubgroups}
                                        >
                                            {g.subgroups.map((sg) => {
                                                const sgScore = subgroupScoreFor(sg.id)
                                                return (
                                                    <AccordionItem key={sg.id} value={sg.id} className="rounded-md border px-4">
                                                        <AccordionTrigger className="hover:no-underline">
                                                            <div className="flex flex-1 items-center justify-between pr-4">
                                                                <span className="font-medium">{sg.name}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm text-muted-foreground">
                                                                        {sg.min_points != null
                                                                            ? t('collections:subgroupCard.scoreWithMin', {
                                                                                total: formatPoints(sgScore?.total ?? 0),
                                                                                min: formatPoints(sg.min_points),
                                                                            })
                                                                            : t('collections:subgroupCard.scoreNoMin', {
                                                                                total: formatPoints(sgScore?.total ?? 0),
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
                                                                                                total: formatPoints(catScore?.total ?? 0),
                                                                                            })}
                                                                                            {catScore?.capped && (
                                                                                                <span className="ml-1 text-xs text-muted-foreground">
                                                                                                    {t('collections:categoryCard.rawSuffix', {
                                                                                                        raw: formatPoints(catScore.rawTotal),
                                                                                                    })}
                                                                                                </span>
                                                                                            )}
                                                                                        </span>
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="icon"
                                                                                            className="h-6 w-6"
                                                                                            onClick={() => setBulkLinkCategory(cat)}
                                                                                            title={t('collections:bulkLinkDialog.title')}
                                                                                        >
                                                                                            <Link2 className="h-3 w-3" />
                                                                                        </Button>
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
                                                                                                            points: formatPoints(contribution?.points ?? 0),
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
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}

            <BulkLinkDialog
                open={bulkLinkCategory !== null}
                onOpenChange={(open) => !open && setBulkLinkCategory(null)}
                sourceCategoryId={bulkLinkCategory?.id ?? ''}
                sourceCategoryName={bulkLinkCategory?.name ?? ''}
                documents={bulkLinkCategory?.documents ?? []}
                onLinked={refresh}
            />
            <CategoryFormDialog
                open={categoryDialog !== null}
                onOpenChange={(open) => !open && setCategoryDialog(null)}
                onSaved={refresh}
                subgroupId={categoryDialog?.mode === 'create' ? categoryDialog.subgroupId : undefined}
                category={categoryDialog?.mode === 'edit' ? categoryDialog.category : undefined}
            />
            <AlertDialog open={stopSyncOpen} onOpenChange={setStopSyncOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('collections:sync.disableTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('collections:sync.disableDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleSetSync(false)}>
                            {t('collections:sync.disableConfirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <DeleteCollectionDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                collectionId={collectionId!}
                collectionName={collection?.name ?? ''}
                onDeleted={() => navigate('/')}
            />
            <EditGroupDialog
                group={editingGroup}
                onOpenChange={(open) => !open && setEditingGroup(null)}
                onSaved={refresh}
            />
            <EditSubgroupDialog
                subgroup={editingSubgroup}
                onOpenChange={(open) => !open && setEditingSubgroup(null)}
                onSaved={refresh}
            />
        </div>
    )
}