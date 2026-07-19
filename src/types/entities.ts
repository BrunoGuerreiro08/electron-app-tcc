import type { Rule } from '@/services/scoringEngine/types'

export interface Collection {
    id: string
    name: string
    color: string | null
    created_at: string
    updated_at: string
}

export interface Subgroup {
    id: string
    collection_id: string
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