import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    type DragEvent,
    type ReactNode,
} from 'react'
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
import {
    ChevronRight,
    ChevronDown,
    CheckCircle2,
    GripVertical,
    Undo2,
    Redo2,
    X,
    Plus,
    ArrowRight,
} from 'lucide-react'
import { collectionRepository } from '@/repository/collectionRepository'
import { groupRepository } from '@/repository/groupRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import type { Collection, Group, Subgroup, Category } from '@/types/entities'
import type { LinkedDocument } from '@/hooks/useCollectionDetail'
import { historyReducer, initialHistory, pairKey, type PendingLink } from './bulkLinkHistory'

type Step = 'browse' | 'saving' | 'done'

/** How long a dragged item must hover a folder before it opens. */
const SPRING_OPEN_MS = 450
/** How long after the pointer leaves an auto-opened folder before it closes. */
const SPRING_CLOSE_MS = 700

const MOD_KEY =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    sourceCategoryId: string
    sourceCategoryName: string
    documents: LinkedDocument[]
    onLinked: () => void
}

interface DropTarget {
    collection: Collection
    group: Group
    subgroup: Subgroup
    category: Category
}

interface Spring {
    subtreeEnter: () => void
    subtreeLeave: () => void
    headerEnter: () => void
    headerLeave: () => void
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function tally<T>(items: T[], key: (item: T) => string) {
    const map = new Map<string, number>()
    for (const item of items) {
        const k = key(item)
        map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
}

/**
 * True when the pointer really left `currentTarget`, as opposed to moving
 * between two of its children (dragleave fires for both).
 */
const leftElement = (e: DragEvent<HTMLElement>) =>
    !e.currentTarget.contains(e.relatedTarget as Node | null)

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function PendingBadge({ count }: { count: number }) {
    if (count === 0) return null
    return (
        <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
            {count}
        </span>
    )
}

interface TreeNodeProps {
    /** Full name, shown as a tooltip since the label is ellipsised. */
    title: string
    open: boolean
    pending: number
    onToggle: () => void
    spring: Spring
    label: ReactNode
    className?: string
    headerClassName?: string
    children: ReactNode
}

/** A collapsible folder row. Children render only while open. */
function TreeNode({
    title,
    open,
    pending,
    onToggle,
    spring,
    label,
    className = '',
    headerClassName = '',
    children,
}: TreeNodeProps) {
    return (
        <div
            className={className}
            onDragEnter={spring.subtreeEnter}
            onDragLeave={(e) => {
                if (leftElement(e)) spring.subtreeLeave()
            }}
        >
            <button
                type="button"
                title={title}
                onClick={onToggle}
                onDragEnter={spring.headerEnter}
                onDragLeave={(e) => {
                    if (leftElement(e)) spring.headerLeave()
                }}
                className={`flex w-full items-center gap-1 rounded p-1.5 text-left text-sm hover:bg-muted/60 ${headerClassName}`}
            >
                {open ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                {label}
                <PendingBadge count={pending} />
            </button>
            {open && children}
        </div>
    )
}

interface CategoryRowProps {
    name: string
    isSource: boolean
    isOver: boolean
    pending: number
    selectedCount: number
    onDragOver: (e: DragEvent<HTMLDivElement>) => void
    onDragLeave: (e: DragEvent<HTMLDivElement>) => void
    onDrop: (e: DragEvent<HTMLDivElement>) => void
    onAddSelected: () => void
}

/** A leaf row — the only element in the tree that accepts drops. */
function CategoryRow({
    name,
    isSource,
    isOver,
    pending,
    selectedCount,
    onDragOver,
    onDragLeave,
    onDrop,
    onAddSelected,
}: CategoryRowProps) {
    return (
        <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            title={isSource ? `${name} (current category)` : name}
            className={`group ml-4 flex items-center gap-2 rounded p-1.5 text-sm transition-colors ${isSource
                    ? 'text-muted-foreground/50'
                    : isOver
                        ? 'bg-primary/10 ring-1 ring-primary'
                        : 'hover:bg-muted/60'
                }`}
        >
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <PendingBadge count={pending} />
            {!isSource && selectedCount > 0 && (
                <button
                    type="button"
                    onClick={onAddSelected}
                    title={`Link ${selectedCount} selected ${plural(selectedCount, 'document', 'documents')} here`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

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

    // Staged changes + undo/redo. Nothing is written to the database until
    // the user presses Apply.
    const [history, dispatch] = useReducer(historyReducer, initialHistory)
    const { changes } = history
    const historyRef = useRef(history)
    useEffect(() => {
        historyRef.current = history
    })

    // Tree data, loaded lazily per level as nodes expand rather than all
    // at once — a workspace with several collections each with their own
    // groups/subgroups/categories could mean dozens of unnecessary
    // fetches if loaded eagerly on open.
    const [collections, setCollections] = useState<Collection[]>([])
    // Node ids are UUIDs, so one set covers collections, groups and subgroups.
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [groupsByCollection, setGroupsByCollection] = useState<Record<string, Group[]>>({})
    const [subgroupsByCollection, setSubgroupsByCollection] = useState<Record<string, Subgroup[]>>({})
    const [categoriesBySubgroup, setCategoriesBySubgroup] = useState<Record<string, Category[]>>({})

    const [hoverCatId, setHoverCatId] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [result, setResult] = useState<{ linked: number; skipped: number } | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Refs: values the drag handlers and timers need synchronously, without
    // waiting for a re-render.
    const dragIdsRef = useRef<string[] | null>(null)
    const loadedRef = useRef<Set<string>>(new Set())
    const linkedCacheRef = useRef<Map<string, Set<string>>>(new Map())
    const openTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
    const closeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
    // Folders opened by hovering (as opposed to clicking). Only these are
    // closed automatically when the pointer leaves.
    const autoOpened = useRef<Set<string>>(new Set())
    const changesListRef = useRef<HTMLDivElement>(null)

    const docsById = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents])

    // Counts used for the little badges on tree rows and document rows, so a
    // collapsed branch still shows that something is staged inside it.
    const pendingByCollection = useMemo(() => tally(changes, (c) => c.collectionId), [changes])
    const pendingByGroup = useMemo(() => tally(changes, (c) => c.groupId), [changes])
    const pendingBySubgroup = useMemo(() => tally(changes, (c) => c.subgroupId), [changes])
    const pendingByCategory = useMemo(() => tally(changes, (c) => c.categoryId), [changes])
    const pendingByDoc = useMemo(() => tally(changes, (c) => c.docId), [changes])

    const clearAllTimers = useCallback(() => {
        openTimers.current.forEach(clearTimeout)
        closeTimers.current.forEach(clearTimeout)
        openTimers.current.clear()
        closeTimers.current.clear()
        autoOpened.current.clear()
    }, [])

    useEffect(() => {
        if (!open) return
        setStep('browse')
        setSelectedDocIds(new Set())
        setExpanded(new Set())
        setGroupsByCollection({})
        setSubgroupsByCollection({})
        setCategoriesBySubgroup({})
        setHoverCatId(null)
        setNotice(null)
        setConfirmDiscard(false)
        setResult(null)
        setError(null)
        dispatch({ type: 'reset' })
        clearAllTimers()
        loadedRef.current.clear()
        linkedCacheRef.current.clear()
        dragIdsRef.current = null
        collectionRepository.list().then(setCollections)
        return clearAllTimers
    }, [open, clearAllTimers])

    // Keep the newest staged change in view.
    useEffect(() => {
        const el = changesListRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [changes.length])

    useEffect(() => {
        if (!notice) return
        const t = setTimeout(() => setNotice(null), 4000)
        return () => clearTimeout(t)
    }, [notice])

    // ---- undo / redo ------------------------------------------------------

    const undo = useCallback(() => {
        setNotice(null)
        dispatch({ type: 'undo' })
    }, [])
    const redo = useCallback(() => {
        setNotice(null)
        dispatch({ type: 'redo' })
    }, [])

    // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo.
    useEffect(() => {
        if (!open || step !== 'browse') return
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return
            const key = e.key.toLowerCase()
            if (key !== 'z' && key !== 'y') return
            // Leave native text undo alone if a text field ever lands in here.
            const target = e.target as HTMLElement | null
            if (target?.closest('textarea, [contenteditable="true"], input:not([type="checkbox"])')) return
            e.preventDefault()
            if (key === 'y' || e.shiftKey) redo()
            else undo()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [open, step, undo, redo])

    // ---- lazy tree loading -----------------------------------------------

    const loadCollection = async (collectionId: string) => {
        if (loadedRef.current.has(collectionId)) return
        loadedRef.current.add(collectionId)
        try {
            const [groups, subgroups] = await Promise.all([
                groupRepository.listByCollection(collectionId),
                subgroupRepository.listByCollection(collectionId),
            ])
            setGroupsByCollection((prev) => ({ ...prev, [collectionId]: groups }))
            setSubgroupsByCollection((prev) => ({ ...prev, [collectionId]: subgroups }))
        } catch (err) {
            loadedRef.current.delete(collectionId) // allow a retry
            setError((err as Error).message)
        }
    }

    const loadSubgroup = async (subgroupId: string) => {
        if (loadedRef.current.has(subgroupId)) return
        loadedRef.current.add(subgroupId)
        try {
            const categories = await categoryRepository.listBySubgroup(subgroupId)
            setCategoriesBySubgroup((prev) => ({ ...prev, [subgroupId]: categories }))
        } catch (err) {
            loadedRef.current.delete(subgroupId)
            setError((err as Error).message)
        }
    }

    // ---- expand / collapse -----------------------------------------------

    const cancelTimer = (timers: typeof openTimers, id: string) => {
        const t = timers.current.get(id)
        if (t !== undefined) {
            clearTimeout(t)
            timers.current.delete(id)
        }
    }

    // Click: an explicit toggle. Clicked folders are never auto-closed.
    const toggleNode = (id: string, load?: () => Promise<void>) => {
        cancelTimer(openTimers, id)
        cancelTimer(closeTimers, id)
        autoOpened.current.delete(id)
        const isOpen = expanded.has(id)
        setExpanded((prev) => {
            const next = new Set(prev)
            isOpen ? next.delete(id) : next.add(id)
            return next
        })
        if (!isOpen) void load?.()
    }

    // Hover while dragging: open after a short dwell ("spring-loaded" folders).
    const scheduleOpen = (id: string, load?: () => Promise<void>) => {
        if (!dragIdsRef.current || expanded.has(id) || openTimers.current.has(id)) return
        openTimers.current.set(
            id,
            setTimeout(() => {
                openTimers.current.delete(id)
                autoOpened.current.add(id)
                setExpanded((prev) => new Set(prev).add(id))
                void load?.()
            }, SPRING_OPEN_MS)
        )
    }

    // Pointer left an auto-opened folder: close it after a short grace period.
    const scheduleClose = (id: string) => {
        if (!autoOpened.current.has(id) || closeTimers.current.has(id)) return
        closeTimers.current.set(
            id,
            setTimeout(() => {
                closeTimers.current.delete(id)
                autoOpened.current.delete(id)
                setExpanded((prev) => {
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
            }, SPRING_CLOSE_MS)
        )
    }

    const springFor = (id: string, load?: () => Promise<void>): Spring => ({
        subtreeEnter: () => cancelTimer(closeTimers, id),
        subtreeLeave: () => scheduleClose(id),
        headerEnter: () => scheduleOpen(id, load),
        headerLeave: () => cancelTimer(openTimers, id),
    })

    // ---- documents: selection + drag source -------------------------------

    const toggleDoc = (id: string) => {
        setSelectedDocIds((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const handleDocDragStart = (e: DragEvent<HTMLElement>, doc: LinkedDocument) => {
        // Dragging a selected row carries the whole selection (in list
        // order); dragging an unselected row carries just that row.
        const ids = selectedDocIds.has(doc.id)
            ? documents.filter((d) => selectedDocIds.has(d.id)).map((d) => d.id)
            : [doc.id]
        dragIdsRef.current = ids

        e.dataTransfer.effectAllowed = 'copy' // linking never removes anything
        e.dataTransfer.setData('text/plain', ids.join(','))

        const ghost = document.createElement('div')
        ghost.textContent = ids.length === 1 ? doc.title : `${ids.length} documents`
        ghost.className =
            'max-w-[240px] truncate rounded-md bg-primary px-2.5 py-1.5 text-sm text-primary-foreground shadow-lg'
        ghost.style.cssText = 'position:fixed;left:-9999px;top:0'
        document.body.appendChild(ghost)
        e.dataTransfer.setDragImage(ghost, 12, 12)
        setTimeout(() => ghost.remove(), 0)
    }

    const handleDragEnd = () => {
        dragIdsRef.current = null
        setHoverCatId(null)
        openTimers.current.forEach(clearTimeout)
        openTimers.current.clear()
        // Folders that were only opened to reach the drop target spring shut.
        autoOpened.current.forEach(scheduleClose)
    }

    // ---- staging ----------------------------------------------------------

    const getLinkedIds = async (categoryId: string) => {
        const cached = linkedCacheRef.current.get(categoryId)
        if (cached) return cached
        const docs = await documentCategoryLinkRepository.listByCategory(categoryId)
        const ids = new Set(docs.map((d) => d.id))
        linkedCacheRef.current.set(categoryId, ids)
        return ids
    }

    const stageLinks = async (docIds: string[], target: DropTarget) => {
        if (docIds.length === 0) return
        setError(null)
        try {
            const alreadyLinked = await getLinkedIds(target.category.id)
            const pendingIds = new Set(historyRef.current.changes.map((c) => c.id))

            const fresh: PendingLink[] = []
            let skipped = 0
            for (const docId of docIds) {
                const doc = docsById.get(docId)
                if (!doc) continue
                const id = pairKey(docId, target.category.id)
                if (alreadyLinked.has(docId) || pendingIds.has(id)) {
                    skipped++
                    continue
                }
                fresh.push({
                    id,
                    docId,
                    docTitle: doc.title,
                    collectionId: target.collection.id,
                    collectionName: target.collection.name,
                    collectionColor: target.collection.color,
                    groupId: target.group.id,
                    groupName: target.group.name,
                    subgroupId: target.subgroup.id,
                    subgroupName: target.subgroup.name,
                    categoryId: target.category.id,
                    categoryName: target.category.name,
                })
            }

            dispatch({ type: 'add', changes: fresh })
            setNotice(
                skipped > 0
                    ? `${skipped} ${plural(skipped, 'document is', 'documents are')} already linked to "${target.category.name}" — skipped.`
                    : null
            )
        } catch (err) {
            setError((err as Error).message)
        }
    }

    const selectedInListOrder = () =>
        documents.filter((d) => selectedDocIds.has(d.id)).map((d) => d.id)

    // ---- apply ------------------------------------------------------------

    const handleApply = async () => {
        setStep('saving')
        setError(null)
        try {
            // Re-check existing links right before writing: the cache used
            // while staging can be stale, and the UNIQUE(document_id,
            // category_id) constraint in db.ts would reject a duplicate.
            const categoryIds = Array.from(new Set(changes.map((c) => c.categoryId)))
            const existingByCategory = await Promise.all(
                categoryIds.map((catId) => documentCategoryLinkRepository.listByCategory(catId))
            )
            const existing = new Set(
                categoryIds.flatMap((catId, i) => existingByCategory[i].map((d) => pairKey(d.id, catId)))
            )

            const toLink = changes.filter((c) => !existing.has(c.id))
            const skipped = changes.length - toLink.length

            await Promise.all(toLink.map((c) => documentCategoryLinkRepository.link(c.docId, c.categoryId)))

            setResult({ linked: toLink.length, skipped })
            setStep('done')
            onLinked()
        } catch (err) {
            setError((err as Error).message)
            setStep('browse') // staged changes are still intact
        }
    }

    // Closing with staged changes would silently lose them — ask first.
    const handleOpenChange = (next: boolean) => {
        if (!next && step === 'browse' && changes.length > 0) {
            setConfirmDiscard(true)
            return
        }
        onOpenChange(next)
    }

    const canApply = changes.length > 0
    const canUndo = history.past.length > 0
    const canRedo = history.future.length > 0

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {/*
              DialogContent is a CSS grid, and grid items default to
              `min-width: auto` — they refuse to shrink below their content,
              so one long name widens the whole dialog and every `truncate`
              below is bypassed. `[&>*]:min-w-0` lets each direct child
              shrink, which is what makes the ellipsis work at all.
            */}
            <DialogContent className="sm:max-w-4xl [&>*]:min-w-0">
                <DialogHeader>
                    <DialogTitle>Link documents to other categories</DialogTitle>
                    <DialogDescription>
                        Drag documents from{' '}
                        <span
                            className="inline-block max-w-[28ch] truncate align-bottom font-medium"
                            title={sourceCategoryName}
                        >
                            {sourceCategoryName}
                        </span>{' '}
                        onto the categories you want them linked to. Nothing is removed from this category, and
                        nothing is saved until you press Apply.
                    </DialogDescription>
                </DialogHeader>

                {step === 'browse' && (
                    <>
                        {error && <p className="break-words text-sm text-destructive">{error}</p>}

                        <div className="flex h-[300px] gap-3">
                            {/* Left: source documents (drag sources) */}
                            <div className="flex w-1/2 min-w-0 flex-col gap-2">
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
                                                draggable
                                                onDragStart={(e) => handleDocDragStart(e, doc)}
                                                onDragEnd={handleDragEnd}
                                                className="flex cursor-grab items-start gap-2 border-b p-2 text-sm last:border-b-0 hover:bg-muted/60 active:cursor-grabbing"
                                            >
                                                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                                                <Checkbox
                                                    checked={selectedDocIds.has(doc.id)}
                                                    onCheckedChange={() => toggleDoc(doc.id)}
                                                    className="mt-0.5"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-medium" title={doc.title}>
                                                        {doc.title}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {[doc.issuer, doc.issued_at].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                                <PendingBadge count={pendingByDoc.get(doc.id) ?? 0} />
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Right: destination tree (drop targets) */}
                            <div className="flex w-1/2 min-w-0 flex-col gap-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                    Drop on a category — folders open as you hover
                                </div>
                                <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-md border p-1">
                                    {collections.map((col) => {
                                        const loadCol = () => loadCollection(col.id)
                                        return (
                                            <TreeNode
                                                key={col.id}
                                                title={col.name}
                                                open={expanded.has(col.id)}
                                                pending={pendingByCollection.get(col.id) ?? 0}
                                                onToggle={() => toggleNode(col.id, loadCol)}
                                                spring={springFor(col.id, loadCol)}
                                                headerClassName="font-medium"
                                                label={
                                                    <>
                                                        <span
                                                            className="h-2 w-2 shrink-0 rounded-full"
                                                            style={{ backgroundColor: col.color ?? '#a3a3a3' }}
                                                        />
                                                        <span className="min-w-0 truncate">{col.name}</span>
                                                    </>
                                                }
                                            >
                                                {(groupsByCollection[col.id] ?? []).map((g) => (
                                                    <TreeNode
                                                        key={g.id}
                                                        title={g.name}
                                                        className="ml-4"
                                                        open={expanded.has(g.id)}
                                                        pending={pendingByGroup.get(g.id) ?? 0}
                                                        onToggle={() => toggleNode(g.id)}
                                                        spring={springFor(g.id)}
                                                        label={<span className="min-w-0 truncate">{g.name}</span>}
                                                    >
                                                        {(subgroupsByCollection[col.id] ?? [])
                                                            .filter((sg) => sg.group_id === g.id)
                                                            .map((sg) => {
                                                                const loadSg = () => loadSubgroup(sg.id)
                                                                return (
                                                                    <TreeNode
                                                                        key={sg.id}
                                                                        title={sg.name}
                                                                        className="ml-4"
                                                                        open={expanded.has(sg.id)}
                                                                        pending={pendingBySubgroup.get(sg.id) ?? 0}
                                                                        onToggle={() => toggleNode(sg.id, loadSg)}
                                                                        spring={springFor(sg.id, loadSg)}
                                                                        label={
                                                                            <span className="min-w-0 truncate">
                                                                                {sg.name}
                                                                            </span>
                                                                        }
                                                                    >
                                                                        {(categoriesBySubgroup[sg.id] ?? []).map(
                                                                            (cat) => {
                                                                                const isSource =
                                                                                    cat.id === sourceCategoryId
                                                                                const target: DropTarget = {
                                                                                    collection: col,
                                                                                    group: g,
                                                                                    subgroup: sg,
                                                                                    category: cat,
                                                                                }
                                                                                return (
                                                                                    <CategoryRow
                                                                                        key={cat.id}
                                                                                        name={cat.name}
                                                                                        isSource={isSource}
                                                                                        isOver={hoverCatId === cat.id}
                                                                                        pending={
                                                                                            pendingByCategory.get(cat.id) ?? 0
                                                                                        }
                                                                                        selectedCount={selectedDocIds.size}
                                                                                        onDragOver={(e) => {
                                                                                            if (!dragIdsRef.current || isSource) return
                                                                                            e.preventDefault() // marks this row as a valid drop target
                                                                                            e.dataTransfer.dropEffect = 'copy'
                                                                                            if (hoverCatId !== cat.id)
                                                                                                setHoverCatId(cat.id)
                                                                                        }}
                                                                                        onDragLeave={(e) => {
                                                                                            if (leftElement(e))
                                                                                                setHoverCatId((h) =>
                                                                                                    h === cat.id ? null : h
                                                                                                )
                                                                                        }}
                                                                                        onDrop={(e) => {
                                                                                            e.preventDefault()
                                                                                            setHoverCatId(null)
                                                                                            const ids = dragIdsRef.current
                                                                                            if (ids && !isSource)
                                                                                                void stageLinks(ids, target)
                                                                                        }}
                                                                                        onAddSelected={() =>
                                                                                            void stageLinks(
                                                                                                selectedInListOrder(),
                                                                                                target
                                                                                            )
                                                                                        }
                                                                                    />
                                                                                )
                                                                            }
                                                                        )}
                                                                    </TreeNode>
                                                                )
                                                            })}
                                                    </TreeNode>
                                                ))}
                                            </TreeNode>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Pending changes */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Pending changes ({changes.length})
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={undo}
                                        disabled={!canUndo}
                                        title={`Undo (${MOD_KEY}+Z)`}
                                    >
                                        <Undo2 className="mr-1 h-3.5 w-3.5" />
                                        Undo
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={redo}
                                        disabled={!canRedo}
                                        title={`Redo (${MOD_KEY}+Shift+Z)`}
                                    >
                                        <Redo2 className="mr-1 h-3.5 w-3.5" />
                                        Redo
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => dispatch({ type: 'clear' })}
                                        disabled={changes.length === 0}
                                    >
                                        Clear all
                                    </Button>
                                </div>
                            </div>

                            <div ref={changesListRef} className="h-[120px] overflow-y-auto rounded-md border">
                                {changes.length === 0 ? (
                                    <p className="p-4 text-sm text-muted-foreground">
                                        Nothing staged yet. Drag a document onto a category to add it here.
                                    </p>
                                ) : (
                                    changes.map((c) => (
                                        <div
                                            key={c.id}
                                            className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0"
                                        >
                                            <span className="max-w-[40%] shrink-0 truncate font-medium" title={c.docTitle}>
                                                {c.docTitle}
                                            </span>
                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <span
                                                className="h-2 w-2 shrink-0 rounded-full"
                                                style={{ backgroundColor: c.collectionColor ?? '#a3a3a3' }}
                                            />
                                            <span
                                                className="min-w-0 flex-1 truncate text-muted-foreground"
                                                title={[c.collectionName, c.groupName, c.subgroupName, c.categoryName].join(' › ')}
                                            >
                                                {c.collectionName} › {c.categoryName}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => dispatch({ type: 'remove', id: c.id })}
                                                title="Remove this change"
                                                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            {notice && (
                                <p className="truncate text-xs text-muted-foreground" title={notice}>
                                    {notice}
                                </p>
                            )}
                        </div>
                    </>
                )}

                {step === 'saving' && (
                    <p className="flex h-[460px] items-center justify-center text-sm text-muted-foreground">
                        Linking documents…
                    </p>
                )}

                {step === 'done' && result && (
                    <div className="flex h-[460px] flex-col items-center justify-center gap-2 text-center">
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
                    {step === 'browse' && confirmDiscard && (
                        <>
                            <span className="mr-auto self-center text-sm text-muted-foreground">
                                Discard {changes.length} pending {plural(changes.length, 'change', 'changes')}?
                            </span>
                            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
                                Keep editing
                            </Button>
                            <Button variant="destructive" onClick={() => onOpenChange(false)}>
                                Discard
                            </Button>
                        </>
                    )}
                    {step === 'browse' && !confirmDiscard && (
                        <Button onClick={handleApply} disabled={!canApply}>
                            Apply {changes.length || ''} link{changes.length === 1 ? '' : 's'}
                        </Button>
                    )}
                    {step === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}