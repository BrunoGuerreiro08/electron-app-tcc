import { useEffect, useState } from 'react'
import { documentRepository } from '@/repository/documentRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import type { Document } from '@/types/entities'
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
import { Plus, Trash2, Link2, Pencil, FolderInput, X, Search, Tag, Folder } from 'lucide-react'
import { TagsEditor } from './tagsEditor'
import { LinkCategoriesDialog } from './linkCategoriesDialog'
import { BulkTagsDialog } from './bulkTagsDialog'
import { BulkLinkCategoriesDialog } from './bulkLinkCategoriesDialog'
import { fileRepository } from '@/repository/fileRepository'
import { Paperclip, ExternalLink, XCircle } from 'lucide-react'
import { DocumentFormDialog } from './documentFormDialog'
import { NewFilesDialog } from './newFilesDialog'
import type { ScannedFile } from '@/types/entities'
import { useTranslation } from 'react-i18next'

export function DocumentLibraryScreen() {
    const { t } = useTranslation('documents')
    const [documents, setDocuments] = useState<Document[]>([])
    const [filter, setFilter] = useState<'all' | 'unfiled'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)

    const [documentDialog, setDocumentDialog] = useState<
        { mode: 'create' } | { mode: 'edit'; document: Document } | null
    >(null)

    const [linkDialogDoc, setLinkDialogDoc] = useState<string | null>(null)
    const [bulkTagsOpen, setBulkTagsOpen] = useState(false)
    const [bulkCategoriesOpen, setBulkCategoriesOpen] = useState(false)

    const [droppedFiles, setDroppedFiles] = useState<ScannedFile[]>([])
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
    const [bannerDismissed, setBannerDismissed] = useState(false)

    const refresh = async () => {
        setLoading(true)
        const docs =
            filter === 'unfiled'
                ? await documentRepository.listUnlinked()
                : await documentRepository.list()
        setDocuments(docs)
        setSelectedIds(new Set()) // Reset selection on refresh

        const counts: Record<string, number> = {}
        await Promise.all(
            docs.map(async (d) => {
                const links = await documentCategoryLinkRepository.listByDocument(d.id)
                counts[d.id] = links.length
            })
        )
        setLinkedCounts(counts)
        setLoading(false)
    }

    useEffect(() => {
        refresh()
    }, [filter])

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
                        placeholder={t('library.searchPlaceholder', 'Search by title, issuer...')}
                        className="pl-9 h-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">{t('library.loading')}</p>
            ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {filter === 'unfiled' ? t('library.emptyUnfiled') : t('library.emptyAll')}
                </p>
            ) : filteredDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                    {t('library.noSearchResults', 'No documents match your search.')}
                </p>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
                        <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                        />
                        <span>Select all</span>
                    </div>

                    {filteredDocuments.map((doc) => (
                        <Card key={doc.id} className={selectedIds.has(doc.id) ? 'border-primary' : ''}>
                            <CardContent className="flex items-center justify-between gap-4 py-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <Checkbox
                                        checked={selectedIds.has(doc.id)}
                                        onCheckedChange={(checked) => toggleSelectOne(doc.id, checked === true)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
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
                    ))}
                </div>
            )}

            {/* Floating Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
                    <span className="text-sm font-medium">{t('bulk.selected', { count: selectedIds.size })}</span>
                    <div className="h-4 w-px bg-border" />
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkTagsOpen(true)}>
                        <Tag className="h-3.5 w-3.5" />
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