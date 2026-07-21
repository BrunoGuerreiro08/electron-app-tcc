import { useEffect, useState } from 'react'
import { documentRepository } from '@/repository/documentRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import type { Document } from '@/types/entities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2, Link2 } from 'lucide-react'
import { TagsEditor } from './tagsEditor'
import { LinkCategoriesDialog } from './linkCategoriesDialog'
import { fileRepository } from '@/repository/fileRepository'
import { Paperclip, ExternalLink, XCircle } from 'lucide-react'

export function DocumentLibraryScreen() {
    const [documents, setDocuments] = useState<Document[]>([])
    const [filter, setFilter] = useState<'all' | 'unfiled'>('all')
    const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)

    const [createOpen, setCreateOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [issuer, setIssuer] = useState('')
    const [issuedAt, setIssuedAt] = useState('')
    const [quantity, setQuantity] = useState('1')
    const [hours, setHours] = useState('')
    const [notes, setNotes] = useState('')

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

    const resetForm = () => {
        setTitle('')
        setIssuer('')
        setIssuedAt('')
        setQuantity('1')
        setHours('')
        setNotes('')
    }

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

    const handleCreate = async () => {
        if (!title.trim()) return
        await documentRepository.create({
            title: title.trim(),
            issuer: issuer.trim() || undefined,
            issuedAt: issuedAt || undefined,
            quantity: quantity ? Number(quantity) : 1,
            hours: hours ? Number(hours) : undefined,
            notes: notes.trim() || undefined,
        })
        resetForm()
        setCreateOpen(false)
        refresh()
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

                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="h-4 w-4" />
                            New document
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>New document</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label>Title</Label>
                                <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Issuer</Label>
                                    <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Date issued</Label>
                                    <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Quantity</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        step="any"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        e.g. 2 if this one document covers 2 contributions.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Hours (if applicable)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={hours}
                                        onChange={(e) => setHours(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={!title.trim()}>
                                Create
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
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
        </div>
    )
}