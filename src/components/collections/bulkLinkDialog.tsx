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
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react'
import { collectionRepository } from '@/repository/collectionRepository'
import { groupRepository } from '@/repository/groupRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import type { Collection, Group, Subgroup, Category } from '@/types/entities'
import type { LinkedDocument } from '@/hooks/useCollectionDetail'

type Step = 'browse' | 'saving' | 'done'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    sourceCategoryId: string
    sourceCategoryName: string
    documents: LinkedDocument[]
    onLinked: () => void
}

export function BulkLinkDialog({
    open,
    onOpenChange,
    sourceCategoryId,
    sourceCategoryName,
    documents,
    onLinked,
}: Props) {
    const [step, setStep] = useState<Step>('browse')
    const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())

    // Tree data, loaded lazily per level as nodes expand rather than all
    // at once — a workspace with several collections each with their own
    // groups/subgroups/categories could mean dozens of unnecessary
    // fetches if loaded eagerly on open.
    const [collections, setCollections] = useState<Collection[]>([])
    const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set())
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set())
    const [groupsByCollection, setGroupsByCollection] = useState<Record<string, Group[]>>({})
    const [subgroupsByCollection, setSubgroupsByCollection] = useState<Record<string, Subgroup[]>>({})
    const [categoriesBySubgroup, setCategoriesBySubgroup] = useState<Record<string, Category[]>>({})

    const [result, setResult] = useState<{ linked: number; skipped: number } | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setStep('browse')
            setSelectedDocIds(new Set())
            setSelectedCategoryIds(new Set())
            setExpandedCollections(new Set())
            setExpandedGroups(new Set())
            setExpandedSubgroups(new Set())
            setGroupsByCollection({})
            setSubgroupsByCollection({})
            setCategoriesBySubgroup({})
            setResult(null)
            setError(null)
            collectionRepository.list().then(setCollections)
        }
    }, [open])

    const toggleDoc = (id: string) => {
        setSelectedDocIds((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const toggleCategory = (id: string) => {
        setSelectedCategoryIds((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const toggleCollection = async (collectionId: string) => {
        const isOpen = expandedCollections.has(collectionId)
        setExpandedCollections((prev) => {
            const next = new Set(prev)
            isOpen ? next.delete(collectionId) : next.add(collectionId)
            return next
        })
        if (!isOpen && !groupsByCollection[collectionId]) {
            const [groups, subgroups] = await Promise.all([
                groupRepository.listByCollection(collectionId),
                subgroupRepository.listByCollection(collectionId),
            ])
            setGroupsByCollection((prev) => ({ ...prev, [collectionId]: groups }))
            setSubgroupsByCollection((prev) => ({ ...prev, [collectionId]: subgroups }))
        }
    }

    const toggleGroup = (groupId: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev)
            next.has(groupId) ? next.delete(groupId) : next.add(groupId)
            return next
        })
    }

    const toggleSubgroup = async (subgroupId: string) => {
        const isOpen = expandedSubgroups.has(subgroupId)
        setExpandedSubgroups((prev) => {
            const next = new Set(prev)
            isOpen ? next.delete(subgroupId) : next.add(subgroupId)
            return next
        })
        if (!isOpen && !categoriesBySubgroup[subgroupId]) {
            const categories = await categoryRepository.listBySubgroup(subgroupId)
            setCategoriesBySubgroup((prev) => ({ ...prev, [subgroupId]: categories }))
        }
    }

    const handleSave = async () => {
        setStep('saving')
        setError(null)
        try {
            const docIds = Array.from(selectedDocIds)
            const categoryIds = Array.from(selectedCategoryIds)

            // "linked ... if they were not previously" — check each target
            // category's existing links first so an already-linked pair
            // is skipped rather than attempted (and possibly rejected by
            // the UNIQUE(document_id, category_id) constraint in db.ts).
            const existingByCategory = await Promise.all(
                categoryIds.map((catId) => documentCategoryLinkRepository.listByCategory(catId))
            )

            const pairsToLink: [string, string][] = []
            let skipped = 0

            categoryIds.forEach((catId, i) => {
                const alreadyLinkedIds = new Set(existingByCategory[i].map((d) => d.id))
                docIds.forEach((docId) => {
                    if (alreadyLinkedIds.has(docId)) {
                        skipped++
                    } else {
                        pairsToLink.push([docId, catId])
                    }
                })
            })

            await Promise.all(pairsToLink.map(([docId, catId]) => documentCategoryLinkRepository.link(docId, catId)))

            setResult({ linked: pairsToLink.length, skipped })
            setStep('done')
            onLinked()
        } catch (err) {
            setError((err as Error).message)
            setStep('browse')
        }
    }

    const canSave = selectedDocIds.size > 0 && selectedCategoryIds.size > 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Link documents to other categories</DialogTitle>
                    <DialogDescription>
                        Pick documents from "{sourceCategoryName}" and the categories elsewhere you want
                        them linked to as well — nothing is removed from this category.
                    </DialogDescription>
                </DialogHeader>

                {step === 'browse' && (
                    <>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <div className="flex h-[420px] gap-3">
                            {/* Left: source documents */}
                            <div className="flex w-1/2 flex-col gap-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                    {selectedDocIds.size} of {documents.length} documents selected
                                </div>
                                <div className="flex-1 overflow-y-auto rounded-md border">
                                    {documents.length === 0 ? (
                                        <p className="p-4 text-sm text-muted-foreground">
                                            No documents in this category yet.
                                        </p>
                                    ) : (
                                        documents.map((doc) => (
                                            <label
                                                key={doc.id}
                                                className="flex cursor-pointer items-start gap-2 border-b p-2 text-sm last:border-b-0 hover:bg-muted/60"
                                            >
                                                <Checkbox
                                                    checked={selectedDocIds.has(doc.id)}
                                                    onCheckedChange={() => toggleDoc(doc.id)}
                                                    className="mt-0.5"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{doc.title}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {[doc.issuer, doc.issued_at].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right: destination tree */}
                            <div className="flex w-1/2 flex-col gap-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                    {selectedCategoryIds.size} categor{selectedCategoryIds.size === 1 ? 'y' : 'ies'} selected
                                </div>
                                <div className="flex-1 overflow-y-auto rounded-md border p-1">
                                    {collections.map((col) => (
                                        <div key={col.id}>
                                            <button
                                                onClick={() => toggleCollection(col.id)}
                                                className="flex w-full items-center gap-1 rounded p-1.5 text-left text-sm font-medium hover:bg-muted/60"
                                            >
                                                {expandedCollections.has(col.id) ? (
                                                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                                ) : (
                                                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                                )}
                                                <span
                                                    className="h-2 w-2 shrink-0 rounded-full"
                                                    style={{ backgroundColor: col.color ?? '#a3a3a3' }}
                                                />
                                                {col.name}
                                            </button>

                                            {expandedCollections.has(col.id) &&
                                                (groupsByCollection[col.id] ?? []).map((g) => (
                                                    <div key={g.id} className="ml-4">
                                                        <button
                                                            onClick={() => toggleGroup(g.id)}
                                                            className="flex w-full items-center gap-1 rounded p-1.5 text-left text-sm hover:bg-muted/60"
                                                        >
                                                            {expandedGroups.has(g.id) ? (
                                                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                                            ) : (
                                                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                                            )}
                                                            {g.name}
                                                        </button>

                                                        {expandedGroups.has(g.id) &&
                                                            (subgroupsByCollection[col.id] ?? [])
                                                                .filter((sg) => sg.group_id === g.id)
                                                                .map((sg) => (
                                                                    <div key={sg.id} className="ml-4">
                                                                        <button
                                                                            onClick={() => toggleSubgroup(sg.id)}
                                                                            className="flex w-full items-center gap-1 rounded p-1.5 text-left text-sm hover:bg-muted/60"
                                                                        >
                                                                            {expandedSubgroups.has(sg.id) ? (
                                                                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                                                            ) : (
                                                                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                                                            )}
                                                                            {sg.name}
                                                                        </button>

                                                                        {expandedSubgroups.has(sg.id) &&
                                                                            (categoriesBySubgroup[sg.id] ?? []).map((cat) => {
                                                                                const isSource = cat.id === sourceCategoryId
                                                                                return (
                                                                                    <label
                                                                                        key={cat.id}
                                                                                        className={`ml-4 flex items-center gap-2 rounded p-1.5 text-sm ${isSource
                                                                                                ? 'text-muted-foreground/50'
                                                                                                : 'cursor-pointer hover:bg-muted/60'
                                                                                            }`}
                                                                                        title={isSource ? 'Current category' : undefined}
                                                                                    >
                                                                                        <Checkbox
                                                                                            checked={selectedCategoryIds.has(cat.id)}
                                                                                            disabled={isSource}
                                                                                            onCheckedChange={() => toggleCategory(cat.id)}
                                                                                        />
                                                                                        {cat.name}
                                                                                    </label>
                                                                                )
                                                                            })}
                                                                    </div>
                                                                ))}
                                                    </div>
                                                ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {step === 'saving' && (
                    <p className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                        Linking documents…
                    </p>
                )}

                {step === 'done' && result && (
                    <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center">
                        <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm">
                            Linked {result.linked} document{result.linked === 1 ? '' : 's'}
                            {result.skipped > 0 && (
                                <span className="text-muted-foreground">
                                    {' '}
                                    ({result.skipped} already linked, skipped)
                                </span>
                            )}
                            .
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {step === 'browse' && (
                        <Button onClick={handleSave} disabled={!canSave}>
                            Link {selectedDocIds.size || ''} document{selectedDocIds.size === 1 ? '' : 's'} to{' '}
                            {selectedCategoryIds.size || ''} categor{selectedCategoryIds.size === 1 ? 'y' : 'ies'}
                        </Button>
                    )}
                    {step === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}