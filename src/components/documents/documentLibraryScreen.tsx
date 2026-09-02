import { useEffect, useState } from 'react'
import { documentRepository } from '@/repository/documentRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import type { Document } from '@/types/entities'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Trash2, Link2, Pencil, FolderInput, X } from 'lucide-react'
import { TagsEditor } from './tagsEditor'
import { LinkCategoriesDialog } from './linkCategoriesDialog'
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
    const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)

    const [documentDialog, setDocumentDialog] = useState<
        { mode: 'create' } | { mode: 'edit'; document: Document } | null
    >(null)

    const [linkDialogDoc, setLinkDialogDoc] = useState<string | null>(null)
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

    return (
        <div className="space-y-6 p-6">
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
            {fileError && (
                <>
                    <p className="text-sm text-destructive">{fileError}</p>
                </>
            )}

            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unfiled')}>
                <TabsList>
                    <TabsTrigger value="all">{t('library.tabs.all')}</TabsTrigger>
                    <TabsTrigger value="unfiled">{t('library.tabs.unfiled')}</TabsTrigger>
                </TabsList>
            </Tabs>

            {loading ? (
                <p className="text-sm text-muted-foreground">{t('library.loading')}</p>
            ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {filter === 'unfiled' ? t('library.emptyUnfiled') : t('library.emptyAll')}
                </p>
            ) : (
                <div className="space-y-2">
                    {documents.map((doc) => (
                        <Card key={doc.id}>
                            <CardContent className="flex items-center justify-between gap-4 py-3">
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
                                        {[doc.issuer, doc.issued_at, doc.hours ? `${doc.hours}h` : null]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
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

            {linkDialogDoc && (
                <LinkCategoriesDialog
                    documentId={linkDialogDoc}
                    open={!!linkDialogDoc}
                    onOpenChange={(open) => !open && setLinkDialogDoc(null)}
                    onChanged={refresh}
                />
            )}
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