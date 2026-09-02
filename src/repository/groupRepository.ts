import type { Group } from '@/types/entities'

interface GroupUpdateInput {
    name?: string
    displayOrder?: number
    minPoints?: number | null
    maxPoints?: number | null
    bonusRate?: number | null
}

export const groupRepository = {
    listByCollection: (collectionId: string): Promise<Group[]> =>
        window.api.groups.listByCollection(collectionId),
    create: (collectionId: string, name: string, displayOrder?: number): Promise<string> =>
        window.api.groups.create(collectionId, name, displayOrder),
    update: (id: string, updates: Partial<GroupUpdateInput>): Promise<void> =>
        window.api.groups.update(id, updates),
    delete: (id: string): Promise<void> => window.api.groups.delete(id),
}