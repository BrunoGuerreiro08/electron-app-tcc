import type { Collection } from '@/types/entities'

export const collectionRepository = {
    list: (): Promise<Collection[]> => window.api.collections.list(),
    create: (name: string, color?: string): Promise<string> =>
        window.api.collections.create(name, color),
    rename: (id: string, name: string): Promise<void> =>
        window.api.collections.rename(id, name),
    delete: (id: string): Promise<void> => window.api.collections.delete(id),
}