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
import { Plus, Trash2, Link2, Pencil } from 'lucide-react'
import { TagsEditor } from './tagsEditor'
import { LinkCategoriesDialog } from './linkCategoriesDialog'
import { fileRepository } from '@/repository/fileRepository'
import { Paperclip, ExternalLink, XCircle } from 'lucide-react'
import { DocumentFormDialog } from './documentFormDialog'

export function DocumentLibraryScreen() {
    const [documents, setDocuments] = useState<Document[]>([])
    const [filter, setFilter] = useState<'all' | 'unfiled'>('all')
    const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)

    // const [createOpen, setCreateOpen] = useState(false)
    // const [title, setTitle] = useState('')
    // const [issuer, setIssuer] = useState('')
    // const [issuedAt, setIssuedAt] = useState('')
    // const [quantity, setQuantity] = useState('1')
    // const [hours, setHours] = useState('')
    // const [notes, setNotes] = useState('')
    const [documentDialog, setDocumentDialog] = useState<
        { mode: 'create' } | { mode: 'edit'; document: Document } | null
    >(null)

    const [linkDialogDoc, setLinkDialogDoc] = useState<string | null>(null)

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

    const [fileError, setFileError] = useState<string | null>(null)

    const handleAttach = async (documentId: string) => {
        setFileError(null)

        const picked = await fileRepository.pick()
        if (!picked) return // cancelled
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
                    <h1 className="text-2xl font-semibold">Document library</h1>
                    <p className="text-sm text-muted-foreground">
                        Log documents any time, then link them to categories whenever you're ready.
                    </p>
                </div>

                <Button size="sm" onClick={() => setDocumentDialog({ mode: 'create' })}>
                    <Plus className="h-4 w-4" />
                    New document
                </Button>
            </div>
            {fileError && (
                <>
                    <p className="text-sm text-destructive">{fileError}</p>
                    {console.log(fileError)}
                </>
            )}

            <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unfiled')}>
                <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="unfiled">Unfiled</TabsTrigger>
                </TabsList>
            </Tabs>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {filter === 'unfiled' ? 'Everything is linked to a category.' : 'No documents yet.'}
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
                                                {linkedCounts[doc.id]} categor{linkedCounts[doc.id] === 1 ? 'y' : 'ies'}
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-xs text-muted-foreground">
                                                Unfiled
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
                                                Open
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground"
                                                onClick={() => handleRemoveFile(doc.id)}
                                                title="Remove file"
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
                                            Attach
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                                        onClick={() => setLinkDialogDoc(doc.id)}
                                    >
                                        <Link2 className="h-3 w-3" />
                                        Link
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete "{doc.title}"?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This removes the document, its tags, and unlinks it from{' '}
                                                    {linkedCounts[doc.id] ?? 0} categor{linkedCounts[doc.id] === 1 ? 'y' : 'ies'}.
                                                    This can't be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(doc.id)}>
                                                    Delete
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
            <DocumentFormDialog
                open={documentDialog !== null}
                onOpenChange={(open) => !open && setDocumentDialog(null)}
                onSaved={refresh}
                document={documentDialog?.mode === 'edit' ? documentDialog.document : null}
            />
        </div>
    )
}