import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCollectionDetail } from '@/hooks/useCollectionDetail'
import { collectionRepository } from '@/repository/collectionRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
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
import { Plus, Trash2, Pencil, Check, X, Printer } from 'lucide-react'
import { CategoryFormDialog } from './categoryFormDialog'

const COMPLETION_STYLES: Record<string, string> = {
    incomplete: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    complete: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    exceeded: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
}

function ruleSummary(rule: Rule): string {
    if (rule.type === 'flat') return `${rule.pointsPerUnit} pt(s) per document`
    if (rule.type === 'hours') return `${rule.pointsPerUnit} pt(s) per ${rule.unitSize}h`
    return `${ruleSummary(rule.inner)}, capped at ${rule.cap}`
}

export function CollectionDetailScreen() {
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
        return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
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
                        Grand total: <span className="font-medium text-foreground">{score?.total ?? 0}</span> points
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/collections/${collectionId}/report`)}
                    >
                        <Printer className="h-4 w-4 mr-1.5" />
                        Exportar Dossiê
                    </Button>

                    <Dialog open={subgroupDialogOpen} onOpenChange={setSubgroupDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                New sub-group
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>New sub-group</DialogTitle>
                            </DialogHeader>
                            <Input
                                placeholder="e.g. Ensino"
                                value={newSubgroupName}
                                onChange={(e) => setNewSubgroupName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateSubgroup()}
                            />
                            <DialogFooter>
                                <Button onClick={handleCreateSubgroup} disabled={!newSubgroupName.trim()}>
                                    Create
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {subgroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No sub-groups yet — create one to start adding categories.
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
                                                {sgScore?.total ?? 0}
                                                {sg.min_points != null && ` / ${sg.min_points}`} pts
                                            </span>
                                            {sgScore?.completion && (
                                                <Badge className={COMPLETION_STYLES[sgScore.completion]} variant="secondary">
                                                    {sgScore.completion}
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
                                                New category
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setEditingSubgroup(sg)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                                Edit
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
                                                    <AlertDialogTitle>Delete "{sg.name}"?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This deletes all its categories and unlinks their documents. Documents
                                                        themselves are not deleted.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteSubgroup(sg.id)}>
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>

                                    {sg.categories.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No categories yet.</p>
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
                                                                    {ruleSummary(cat.rule)}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-sm">
                                                                    {catScore?.total ?? 0}
                                                                    {catScore?.capped && (
                                                                        <span className="ml-1 text-xs text-muted-foreground">
                                                                            (raw {catScore.rawTotal})
                                                                        </span>
                                                                    )}{' '}
                                                                    pts
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
                                                                            <AlertDialogTitle>Delete "{cat.name}"?</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                This unlinks {cat.documents.length} document(s). They stay
                                                                                in your document library.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                            <AlertDialogAction
                                                                                onClick={() => handleDeleteCategory(cat.id)}
                                                                            >
                                                                                Delete
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
                                                                            <span>{contribution?.points.toFixed(2) ?? 0} pts</span>
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