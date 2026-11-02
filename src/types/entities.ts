import type { Rule } from '@/services/scoringEngine/types'

// Structured template validation errors, shared with the main process and
// the server; translated for display by src/lib/translateTemplateErrors.ts.
export type { TemplateError, TemplateErrorKey, TemplateErrorLocation } from '../../shared/templateValidation'

export interface Collection {
    id: string
    name: string
    color: string | null
    created_at: string
    updated_at: string
    /** 0 = local-only: this collection is not sent to the server. */
    sync_enabled: number
}

export interface Group {
    id: string
    collection_id: string
    name: string
    display_order: number
    min_points: number | null
    max_points: number | null
    bonus_rate: number | null
}

export interface Subgroup {
    id: string
    collection_id: string
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
    /** missing_local: the file is on another device (synced file_hash, no file here yet). */
    file_status: 'pending' | 'ready' | 'orphaned' | 'missing_local'
    file_hash: string | null
}

export interface Tag {
    id: string
    name: string
    color: string | null
}

export interface ScannedFile {
    path: string
    name: string
    size: number
    valid: boolean
    reason?: string
}

/** Present only when the template file is a collection_export being reused as a template. */
export interface TemplateDocumentRef {
    title: string
    issued_at: string | null
    quantity: number
    hours: number | null
    file_name: string | null
}

export interface TemplateCategory {
    name: string
    display_order: number
    rule: Rule
    documents?: TemplateDocumentRef[]
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
    /** Official only: set when the template arrived or changed recently. */
    change?: 'added' | 'updated'
}

export type OfficialSyncResult =
    | { ok: true; lastSyncedAt: number; added: number; updated: number; removed: number }
    | { ok: false; lastSyncedAt: number | null }

export interface DocumentMatchSummary {
    added: number
    existing: number
    missing: number
}

export interface ApplyTemplateResult {
    collectionId: string
    documentSummary: DocumentMatchSummary | null
}