import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collectionRepository } from '@/repository/collectionRepository'
import { documentRepository } from '@/repository/documentRepository'
import { useSettingsStore } from '@/store/settingsStore'
import type { Collection, Document } from '@/types/entities'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog'
import { FolderOpen, Plus, FileText, Loader2 } from 'lucide-react'

export function HomeScreen() {
    const navigate = useNavigate()
    const [collections, setCollections] = useState<Collection[]>([])
    const [unfiled, setUnfiled] = useState<Document[]>([])
    const [loading, setLoading] = useState(true)
    const [newName, setNewName] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)

    const { storageFolder, isCustomFolder, migrating, error, load, changeFolder } =
        useSettingsStore()

    const refresh = async () => {
        const [cols, docs] = await Promise.all([
            collectionRepository.list(),
            documentRepository.listUnlinked(),
        ])
        setCollections(cols)
        setUnfiled(docs)
        setLoading(false)
    }

    useEffect(() => {
        refresh()
        load()
    }, [load])

    const handleCreate = async () => {
        if (!newName.trim()) return
        await collectionRepository.create(newName.trim())
        setNewName('')
        setDialogOpen(false)
        refresh()
    }

    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-2xl font-semibold">Your portfolio</h1>
                <p className="text-sm text-muted-foreground">
                    Collections, documents, and where everything is stored.
                </p>
            </div>

            {/* Storage folder — surfaced prominently, not buried in settings */}
            <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-base">Document storage folder</CardTitle>
                        <CardDescription>
                            {isCustomFolder
                                ? 'Using a custom folder — e.g. one synced by Google Drive or similar.'
                                : 'Using the default app data folder.'}
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={changeFolder} disabled={migrating}>
                        {migrating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <FolderOpen className="h-4 w-4" />
                        )}
                        {migrating ? 'Moving files…' : 'Change folder'}
                    </Button>
                </CardHeader>
                <CardContent>
                    <code className="text-xs text-muted-foreground break-all">
                        {storageFolder ?? 'Loading…'}
                    </code>
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>

            {/* Unfiled documents — surfaces the "log now, categorize later" workflow */}
            {unfiled.length > 0 && (
                <Card
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => navigate('/documents')}
                >
                    <CardContent className="flex items-center gap-3 py-4">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">
                                {unfiled.length} document{unfiled.length === 1 ? '' : 's'} not yet linked to a
                                category
                            </p>
                            <p className="text-xs text-muted-foreground">Click to organize them.</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Collections */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Collections</h2>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="h-4 w-4" />
                            New collection
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>New collection</DialogTitle>
                        </DialogHeader>
                        <Input
                            placeholder="e.g. 2026 Progression Portfolio"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        />
                        <DialogFooter>
                            <Button onClick={handleCreate} disabled={!newName.trim()}>
                                Create
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : collections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No collections yet — create one to get started.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {collections.map((c) => (
                        <Card
                            key={c.id}
                            className="cursor-pointer transition-colors hover:bg-muted/50"
                            onClick={() => navigate(`/collections/${c.id}`)}
                        >
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <span
                                        className="h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: c.color ?? '#a3a3a3' }}
                                    />
                                    <CardTitle className="text-base">{c.name}</CardTitle>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}