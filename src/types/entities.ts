import type { Rule } from '@/services/scoringEngine/types'

export interface Collection {
    id: string
    name: string
    color: string | null
    created_at: string
    updated_at: string
}

/**
 * New level between Collection and SubGroup, added to represent
 * group-spanning thresholds/bonuses a single subgroup can't express on
 * its own (e.g. a combined minimum across several subgroups, or a
 * surplus bonus computed on that combined total).
 */
export interface Group {
    id: string
    collection_id: string
    name: string
    display_order: number
    min_points: number | null
    max_points: number | null
    /**
     * Fraction (e.g. 0.25) applied to points earned above min_points to
     * produce a separate "surplus bonus" figure — see
     * GroupScoreResult.bonus in scoringEngine/types.ts. Null means this
     * mechanism doesn't apply to this group (most groups), not "bonus
     * is zero".
     */
    bonus_rate: number | null
}

export interface Subgroup {
    id: string
    collection_id: string
    /**
     * Required in practice everywhere in the app, even though the
     * underlying SQLite column is nullable for migration reasons (see
     * db.ts) — every subgroup belongs to exactly one group now.
     * bonus_rate moved to Group (see above) — a group-spanning bonus
     * needs to sit above the subgroups it spans, not on one of them.
     */
    group_id: string
    name: string
    display_order: number
    min_points: number | null
    max_points: number | null
}

export interface Category {
    id: string
    subgroup_id: string
    name: string
    rule: Rule
    display_order: number
}

export interface Document {
    id: string
    title: string
    issuer: string | null
    issued_at: string | null
    created_at: string
    quantity: number
    hours: number | null
    notes: string | null
    file_path: string | null
    file_status: 'pending' | 'ready' | 'orphaned'
}

export interface Tag {
    id: string
    name: string
    color: string | null
}

/**
 * Mirrors electron/fileHandler.ts's ScannedFile across the IPC boundary.
 * That backend copy is the source of truth for the actual scan result
 * shape; this is the single frontend copy — electron.d.ts and
 * fileRepository.ts both reference this one instead of each declaring
 * their own.
 */
export interface ScannedFile {
    path: string
    name: string
    size: number
    valid: boolean
    reason?: string
}

/**
 * Mirrors electron/templates.ts's TemplateFile shape across the IPC
 * boundary — same reasoning as ScannedFile above. `rule` reuses the
 * REAL Rule type imported at the top of this file, not a redeclared
 * copy — the backend's own template validator has its own local Rule
 * shape (it has to; electron/ is a separate compilation context that
 * can't import from src/), but the frontend side should only ever have
 * one definition, referenced everywhere else.
 */
export interface TemplateCategory {
    name: string
    display_order: number
    rule: Rule
}

export interface TemplateSubgroup {
    name: string
    display_order: number
    min_points: number | null
    max_points: number | null
    categories: TemplateCategory[]
}

export interface TemplateGroup {
    name: string
    display_order: number
    min_points: number | null
    max_points: number | null
    bonus_rate: number | null
    subgroups: TemplateSubgroup[]
}

export interface TemplateFile {
    schemaVersion: 1
    name: string
    description?: string
    groups: TemplateGroup[]
}

export interface TemplateSummary {
    fileName: string
    source: 'official' | 'imported'
    template: TemplateFile
}