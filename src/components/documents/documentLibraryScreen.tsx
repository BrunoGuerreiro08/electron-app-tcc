import { useEffect, useState, useRef } from 'react'
import { documentRepository } from '@/repository/documentRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import type { Document, Tag } from '@/types/entities'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Link2, Pencil, FolderInput, X, Search, Tag as TagSymbol, Folder, EyeOff, Settings, TagIcon } from 'lucide-react'
import { TagsEditor } from './tagsEditor'
import { LinkCategoriesDialog } from './linkCategoriesDialog'
import { BulkTagsDialog } from './bulkTagsDialog'
import { BulkLinkCategoriesDialog } from './bulkLinkCategoriesDialog'
import { fileRepository } from '@/repository/fileRepository'
import { Paperclip, ExternalLink, XCircle } from 'lucide-react'
import { DocumentFormDialog } from './documentFormDialog'
import { NewFilesDialog } from './newFilesDialog'
import { ManageTagsDialog } from './manageTagsDialog'
import type { ScannedFile } from '@/types/entities'
import { useTranslation } from 'react-i18next'
import { tagRepository } from '@/repository/tagRepository'
import { getContrastYIQ } from '@/lib/generateRandomColor'


export function DocumentLibraryScreen() {
    const { t } = useTranslation('documents')
    const [documents, setDocuments] = useState<Document[]>([])
    const [filter, setFilter] = useState<'all' | 'unfiled'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({})

    // Tag state
    const [documentTags, setDocumentTags] = useState<Record<string, Tag[]>>({})
    const [allAvailableTags, setAllAvailableTags] = useState<string[]>([])
    const [activeFilterTags, setActiveFilterTags] = useState<string[]>([])
    const [selectedIncludeTags, setSelectedIncludeTags] = useState<Set<string>>(new Set())
    const [selectedExcludeTags, setSelectedExcludeTags] = useState<Set<string>>(new Set())
    const [tagSearchQuery, setTagSearchQuery] = useState('')
    const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false)
    const tagDropdownRef = useRef<HTMLDivElement>(null)

    const [loading, setLoading] = useState(true)

    const [documentDialog, setDocumentDialog] = useState<
        { mode: 'create' } | { mode: 'edit'; document: Document } | null
    >(null)

    const [linkDialogDoc, setLinkDialogDoc] = useState<string | null>(null)
    const [bulkTagsOpen, setBulkTagsOpen] = useState(false)
    const [bulkCategoriesOpen, setBulkCategoriesOpen] = useState(false)
    const [manageTagsOpen, setManageTagsOpen] = useState(false)

    const [droppedFiles, setDroppedFiles] = useState<ScannedFile[]>([])
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
    const [bannerDismissed, setBannerDismissed] = useState(false)

    const refresh = async () => {
        setLoading(true)
        const [docs, allTags] = await Promise.all([
            filter === 'unfiled'
                ? documentRepository.listUnlinked()
                : documentRepository.list(),
            tagRepository.list(),
        ])

        setDocuments(docs)
        setSelectedIds(new Set())

        const counts: Record<string, number> = {}
        const tagsMap: Record<string, Tag[]> = {}

        await Promise.all(
            docs.map(async (d) => {
                const links = await documentCategoryLinkRepository.listByDocument(d.id)
                counts[d.id] = links.length

                tagsMap[d.id] = await tagRepository.listForDocument(d.id)
            })
        )

        setLinkedCounts(counts)
        setDocumentTags(tagsMap)
        setAllAvailableTags(allTags.map(tag => tag.name).sort((a, b) => a.localeCompare(b)))
        setLoading(false)
    }

    useEffect(() => {
        refresh()
    }, [filter])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
                setIsTagDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const checkForDroppedFiles = async () => {
        const files = await fileRepository.detectDroppedFiles()
        setDroppedFiles(files)
        if (files.length > 0) setBannerDismissed(false)
    }

    useEffect(() => {
        checkForDroppedFiles()
    }, [])

    const handleImported = () => {
        refresh()
        checkForDroppedFiles()
    }

    const [fileError, setFileError] = useState<string | null>(null)

    const handleAttach = async (documentId: string) => {
        setFileError(null)
        const picked = await fileRepository.pick()
        if (!picked) return
        if (!picked.ok) {
            setFileError(picked.error)
            return
        }

        const attached = await fileRepository.attach(documentId, picked.path)
        if (!attached.ok) {
            setFileError(attached.error)
            return
        }
        refresh()
    }

    const handleRemoveFile = async (documentId: string) => {
        await fileRepository.remove(documentId)
        refresh()
    }

    const handleOpenFile = async (documentId: string) => {
        try {
            await fileRepository.open(documentId)
        } catch (err) {
            setFileError((err as Error).message)
        }
    }

    const handleDelete = async (id: string) => {
        await documentRepository.delete(id)
        refresh()
    }

    const filteredDocuments = documents.filter((doc) => {
        const docTags = documentTags[doc.id] || []

        const hasExcludedTag = docTags.some((tag) => selectedExcludeTags.has(tag.name))
        if (hasExcludedTag) return false

        if (selectedIncludeTags.size > 0) {
            const matchesInclude = docTags.some((tag) => selectedIncludeTags.has(tag.name))
            if (!matchesInclude) return false
        }

        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
            doc.title.toLowerCase().includes(q) ||
            (doc.issuer && doc.issuer.toLowerCase().includes(q)) ||
            (doc.issued_at && doc.issued_at.toLowerCase().includes(q)) ||
            (doc.notes && doc.notes.toLowerCase().includes(q))
        )
    })

    const toggleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(filteredDocuments.map((d) => d.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

    const toggleSelectOne = (id: string, checked: boolean) => {
        const next = new Set(selectedIds)
        if (checked) next.add(id)
        else next.delete(id)
        setSelectedIds(next)
    }

    const handleAddFilterTag = (tag: string) => {
        setActiveFilterTags(prev => [...prev, tag])
        setSelectedIncludeTags(prev => new Set(prev).add(tag))
        setTagSearchQuery('')
        setIsTagDropdownOpen(false)
    }

    const handleRemoveFilterTag = (tag: string) => {
        setActiveFilterTags(prev => prev.filter(t => t !== tag))
        const nextInc = new Set(selectedIncludeTags)
        nextInc.delete(tag)
        setSelectedIncludeTags(nextInc)
        const nextExc = new Set(selectedExcludeTags)
        nextExc.delete(tag)
        setSelectedExcludeTags(nextExc)
    }

    const handleToggleFilterTagState = (tag: string) => {
        if (selectedIncludeTags.has(tag)) {
            const nextInc = new Set(selectedIncludeTags)
            nextInc.delete(tag)
            setSelectedIncludeTags(nextInc)

            const nextExc = new Set(selectedExcludeTags)
            nextExc.add(tag)
            setSelectedExcludeTags(nextExc)
        } else {
            const nextExc = new Set(selectedExcludeTags)
            nextExc.delete(tag)
            setSelectedExcludeTags(nextExc)

            const nextInc = new Set(selectedIncludeTags)
            nextInc.add(tag)
            setSelectedIncludeTags(nextInc)
        }
    }

    const availableTagsToPick = allAvailableTags
        .filter(t => !activeFilterTags.includes(t))
        .filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase()))

    const allFilteredSelected = filteredDocuments.length > 0 && filteredDocuments.every((d) => selectedIds.has(d.id))

    return (
        <div className="space-y-6 p-6 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">{t('library.title')}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t('library.description')}
                    </p>
                </div>

                <Button size="sm" onClick={() => setDocumentDialog({ mode: 'create' })}>
                    <Plus className="h-4 w-4" />
                    {t('library.newDocument')}
                </Button>
            </div>

            {droppedFiles.length > 0 && !bannerDismissed && (
                <button
                    onClick={() => setReviewDialogOpen(true)}
                    className="flex w-full items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted/70"
                >
                    <FolderInput className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">
                        {t('library.droppedFiles', { count: droppedFiles.length })}
                    </span>
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation()
                            setBannerDismissed(true)
                        }}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
                    >
                        <X className="h-3.5 w-3.5" />
                    </span>
                </button>
            )}
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}

            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                    <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unfiled')}>
                        <TabsList>
                            <TabsTrigger value="all">{t('library.tabs.all')}</TabsTrigger>
                            <TabsTrigger value="unfiled">{t('library.tabs.unfiled')}</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="relative w-72">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder={t('library.searchPlaceholder')}
                            className="pl-9 h-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {allAvailableTags.length > 0 && (
                    <div className="flex flex-col gap-3 rounded-lg border p-4 bg-card text-card-foreground">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="relative w-full sm:w-72" ref={tagDropdownRef}>
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={t('library.tagsFilter')}
                                    className="pl-9 h-9"
                                    value={tagSearchQuery}
                                    onChange={(e) => setTagSearchQuery(e.target.value)}
                                    onFocus={() => setIsTagDropdownOpen(true)}
                                />
                                {isTagDropdownOpen && availableTagsToPick.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-md max-h-48 overflow-y-auto">
                                        {availableTagsToPick.map(tag => (
                                            <div
                                                key={tag}
                                                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                                                onClick={() => handleAddFilterTag(tag)}
                                            >
                                                {tag}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {activeFilterTags.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                    {t('library.tagsFilterHint')}
                                </div>
                            )}

                            <div className="flex-1" />

                            <Button variant="outline" size="sm" onClick={() => setManageTagsOpen(true)} className="gap-2">
                                <Settings className="h-4 w-4" />
                                {t('library.actions.manageTags')}
                            </Button>
                        </div>

                        {activeFilterTags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                                {activeFilterTags.map((tag) => {
                                    const isExcluded = selectedExcludeTags.has(tag)

                                    return (
                                        <div
                                            key={tag}
                                            className={`flex items-center gap-1 border rounded-md px-2 py-1 text-xs font-medium transition-colors ${isExcluded
                                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                                : 'border-primary/30 bg-primary/10 text-primary'
                                                }`}
                                        >
                                            <button
                                                onClick={() => handleToggleFilterTagState(tag)}
                                                className="flex items-center gap-1.5 hover:opacity-75 focus:outline-none"
                                                title={isExcluded ? "Click to include" : "Click to exclude"}
                                            >
                                                {isExcluded ? (
                                                    <EyeOff className="h-3 w-3" />
                                                ) : (
                                                    <TagSymbol className="h-3 w-3" />
                                                )}
                                                {tag}
                                            </button>

                                            <div className="w-px h-3 bg-border mx-1" />

                                            <button
                                                onClick={() => handleRemoveFilterTag(tag)}
                                                className="hover:bg-background/50 rounded-sm p-0.5 focus:outline-none text-muted-foreground hover:text-foreground"
                                                title={t('library.actions.removeFilter')}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">{t('library.loading')}</p>
            ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {filter === 'unfiled' ? t('library.emptyUnfiled') : t('library.emptyAll')}
                </p>
            ) : filteredDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                    {t('library.noSearchResults')}
                </p>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
                        <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                        />
                        <span>{t('library.actions.selectAll')}</span>
                    </div>

                    {filteredDocuments.map((doc) => {
                        const tags = documentTags[doc.id] || []
                        return (
                            <Card key={doc.id} className={selectedIds.has(doc.id) ? 'border-primary' : ''}>
                                <CardContent className="flex items-center justify-between gap-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <Checkbox
                                            checked={selectedIds.has(doc.id)}
                                            onCheckedChange={(checked) => toggleSelectOne(doc.id, checked === true)}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="truncate text-sm font-medium">{doc.title}</p>
                                                {doc.quantity > 1 && (
                                                    <Badge variant="outline" className="text-xs">
                                                        x{doc.quantity}
                                                    </Badge>
                                                )}
                                                {linkedCounts[doc.id] > 0 ? (
                                                    <Badge variant="secondary" className="text-xs">
                                                        {t('library.badges.category', { count: linkedCounts[doc.id] })}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                                        {t('library.badges.unfiled')}
                                                    </Badge>
                                                )}

                                                {tags.map((tag) => (
                                                    <Badge
                                                        key={tag.id}
                                                        className="text-xs gap-1 border-transparent"
                                                        style={{
                                                            backgroundColor: tag.color || '#e5e7eb',
                                                            color: getContrastYIQ(tag.color)
                                                        }}
                                                    >
                                                        <TagIcon className="h-2.5 w-2.5" />
                                                        {tag.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {[doc.issuer, doc.issued_at, doc.hours ? `${doc.hours}h` : null, doc.notes]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => setDocumentDialog({ mode: 'edit', document: doc })}
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <TagsEditor documentId={doc.id} onChanged={refresh} />
                                        {doc.file_status === 'ready' ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                                                    onClick={() => handleOpenFile(doc.id)}
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    {t('library.actions.open')}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground"
                                                    onClick={() => handleRemoveFile(doc.id)}
                                                    title={t('library.actions.removeFile')}
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                                                onClick={() => handleAttach(doc.id)}
                                            >
                                                <Paperclip className="h-3 w-3" />
                                                {t('library.actions.attach')}
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                                            onClick={() => setLinkDialogDoc(doc.id)}
                                        >
                                            <Link2 className="h-3 w-3" />
                                            {t('library.actions.link')}
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>{t('library.delete.title', { title: doc.title })}</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {t('library.delete.description', { count: linkedCounts[doc.id] ?? 0 })}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>{t('library.delete.cancel')}</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(doc.id)}>
                                                        {t('library.delete.confirm')}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
                    <span className="text-sm font-medium">{t('bulk.selected', { count: selectedIds.size })}</span>
                    <div className="h-4 w-px bg-border" />
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkTagsOpen(true)}>
                        <TagSymbol className="h-3.5 w-3.5" />
                        {t('bulk.tags')}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkCategoriesOpen(true)}>
                        <Folder className="h-3.5 w-3.5" />
                        {t('bulk.categories')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                        {t('bulk.clear')}
                    </Button>
                </div>
            )}

            {linkDialogDoc && (
                <LinkCategoriesDialog
                    documentId={linkDialogDoc}
                    open={!!linkDialogDoc}
                    onOpenChange={(open) => !open && setLinkDialogDoc(null)}
                    onChanged={refresh}
                />
            )}
            <BulkTagsDialog
                selectedIds={Array.from(selectedIds)}
                open={bulkTagsOpen}
                onOpenChange={setBulkTagsOpen}
                onChanged={refresh}
            />
            <BulkLinkCategoriesDialog
                selectedIds={Array.from(selectedIds)}
                open={bulkCategoriesOpen}
                onOpenChange={setBulkCategoriesOpen}
                onChanged={refresh}
            />
            <ManageTagsDialog
                open={manageTagsOpen}
                onOpenChange={setManageTagsOpen}
                onChanged={refresh}
            />
            <NewFilesDialog
                open={reviewDialogOpen}
                onOpenChange={setReviewDialogOpen}
                files={droppedFiles}
                onImported={handleImported}
            />
            <DocumentFormDialog
                open={documentDialog !== null}
                onOpenChange={(open) => !open && setDocumentDialog(null)}
                onSaved={refresh}
                document={documentDialog?.mode === 'edit' ? documentDialog.document : null}
            />
        </div>
    )
}