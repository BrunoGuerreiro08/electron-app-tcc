import type { Category } from '@/types/entities'
import type { Rule } from '@/services/scoringEngine/types'

export const categoryRepository = {
    listBySubgroup: (subgroupId: string): Promise<Category[]> =>
        window.api.categories.listBySubgroup(subgroupId),
    create: (subgroupId: string, name: string, rule: Rule, displayOrder?: number): Promise<string> =>
        window.api.categories.create(subgroupId, name, rule, displayOrder),
    update: (id: string, updates: { name?: string; rule?: Rule }): Promise<void> =>
        window.api.categories.update(id, updates),
    reorder: (orderedIds: string[]): Promise<void> => window.api.categories.reorder(orderedIds),
    delete: (id: string): Promise<void> => window.api.categories.delete(id),
}