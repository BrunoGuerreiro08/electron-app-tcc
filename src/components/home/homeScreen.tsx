import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentRepository } from '@/repository/documentRepository'
import { useCollectionsStore } from '@/store/collectionsStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { Document } from '@/types/entities'
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
import { FolderOpen, Plus, FileText, Loader2, FileStack } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UseTemplateDialog } from '@/components/collections/useTemplateDialog'

export function HomeScreen() {
    const { t } = useTranslation(['common', 'home'])
    const navigate = useNavigate()
    const { collections, loading, load, create } = useCollectionsStore()
    const [unfiled, setUnfiled] = useState<Document[]>([])
    const [newName, setNewName] = useState('')
    const [dialogOpen, setDialogOpen] = useState(false)
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

    const { storageFolder, isCustomFolder, migrating, error, load: loadSettings, changeFolder } =
        useSettingsStore()

    const refreshUnfiled = async () => {
        const docs = await documentRepository.listUnlinked()
        setUnfiled(docs)
    }

    useEffect(() => {
        load()
        refreshUnfiled()
        loadSettings()
    }, [load, loadSettings])

    const handleCreate = async () => {
        if (!newName.trim()) return
        const id = await create(newName.trim())
        setNewName('')
        setDialogOpen(false)
        navigate(`/collections/${id}`)
    }

    const handleTemplateCreated = async (collectionId: string) => {
        await load()
        navigate(`/collections/${collectionId}`)
    }

    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-2xl font-semibold">{t('home:title')}</h1>
                <p className="text-sm text-muted-foreground">
                    {t('home:description')}
                </p>
            </div>

            {/* Storage folder — surfaced prominently, not buried in settings */}
            <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-base">{t('home:storage.title')}</CardTitle>
                        <CardDescription>
                            {t(isCustomFolder
                                ? 'home:storage.custom'
                                : 'home:storage.default')}
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={changeFolder} disabled={migrating}>
                        {migrating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <FolderOpen className="h-4 w-4" />
                        )}
                        {t(migrating ? 'home:storage.moving' : 'common:actions.changeFolder')}
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
                                {t('home:unfiled.title', { count: unfiled.length })}
                            </p>
                            <p className="text-xs text-muted-foreground">{t('home:unfiled.subtitle')}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Collections */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">{t('home:collections.title')}</h2>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setTemplateDialogOpen(true)}>
                        <FileStack className="h-4 w-4" />
                        From template
                    </Button>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="h-4 w-4" />
                                {t('home:collections.newCollection')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('home:collections.newCollection')}</DialogTitle>
                            </DialogHeader>
                            <Input
                                placeholder={t('home:collections.placeholder')}
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            />
                            <DialogFooter>
                                <Button onClick={handleCreate} disabled={!newName.trim()}>
                                    {t('common:actions.create')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <UseTemplateDialog
                open={templateDialogOpen}
                onOpenChange={setTemplateDialogOpen}
                onCreated={handleTemplateCreated}
            />

            {loading ? (
                <p className="text-sm text-muted-foreground">{t('common:states.loading')}</p>
            ) : collections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('home:collections.empty')}
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