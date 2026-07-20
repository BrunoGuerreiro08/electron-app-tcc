import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCollectionDetail } from '@/hooks/useCollectionDetail'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import type { Rule } from '@/services/scoringEngine/types'
import { RuleEditor } from './ruleEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, Trash2 } from 'lucide-react'

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

    const [newSubgroupName, setNewSubgroupName] = useState('')
    const [subgroupDialogOpen, setSubgroupDialogOpen] = useState(false)
    const [openSubgroups, setOpenSubgroups] = useState<string[]>([])

    const [categoryDialogSubgroup, setCategoryDialogSubgroup] = useState<string | null>(null)
    const [newCategoryName, setNewCategoryName] = useState('')
    const [newCategoryRule, setNewCategoryRule] = useState<Rule>({
        type: 'flat',
        pointsPerUnit: 1,
    })

    if (loading) {
        return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    }

    const scoreFor = (subgroupId: string) => score?.subgroups.find((s) => s.subgroupId === subgroupId)
    const categoryScoreFor = (categoryId: string) =>
        score?.subgroups.flatMap((s) => s.categories).find((c) => c.categoryId === categoryId)

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

    const handleCreateCategory = async () => {
        if (!categoryDialogSubgroup || !newCategoryName.trim()) return
        await categoryRepository.create(categoryDialogSubgroup, newCategoryName.trim(), newCategoryRule)
        setNewCategoryName('')
        setNewCategoryRule({ type: 'flat', pointsPerUnit: 1 })
        setCategoryDialogSubgroup(null)
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
                    <h1 className="text-2xl font-semibold">Collection</h1>
                    <p className="text-sm text-muted-foreground">
                        Grand total: <span className="font-medium text-foreground">{score?.total ?? 0}</span> points
                    </p>
                </div>

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

            {subgroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No sub-groups yet — create one to start adding categories.
                </p>
            ) : (
                < Accordion
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
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCategoryDialogSubgroup(sg.id)}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            New category
                                        </Button>
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
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm">
                                                                    {catScore?.total ?? 0}
                                                                    {catScore?.capped && (
                                                                        <span className="ml-1 text-xs text-muted-foreground">
                                                                            (raw {catScore.rawTotal})
                                                                        </span>
                                                                    )}{' '}
                                                                    pts
                                                                </span>
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
            )
            }

            <Dialog
                open={categoryDialogSubgroup !== null}
                onOpenChange={(open) => !open && setCategoryDialogSubgroup(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New category</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                placeholder="e.g. Publications"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <RuleEditor value={newCategoryRule} onChange={setNewCategoryRule} />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    )
}