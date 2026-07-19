// ---- Rule shapes (mirrors entities.md CATEGORY.rule column) ----

export interface FlatRule {
    type: 'flat'
    pointsPerUnit: number
}

export interface HoursRule {
    type: 'hours'
    pointsPerUnit: number
    unitSize: number
}

export interface CappedRule {
    type: 'capped'
    inner: FlatRule | HoursRule
    cap: number
}

export type Rule = FlatRule | HoursRule | CappedRule

// ---- Minimal document shape the engine actually needs ----
// Deliberately narrow — decouples the engine from the full storage entity.
// Callers map their real Document rows (joined via DOCUMENT_CATEGORY_LINK)
// to this shape. `quantity` represents how many contributions a single
// document accounts for (e.g. one certificate covering 2 internship
// orientations) and multiplies the rule's base result for that document.

export interface ScorableDocument {
    id: string
    hours?: number | null
    quantity?: number | null
}

// ---- Results ----

export interface DocumentContribution {
    documentId: string
    points: number
}

export interface CategoryScoreResult {
    categoryId: string
    rule: Rule
    /** Score before any cap is applied */
    rawTotal: number
    /** Score after cap is applied (equals rawTotal for flat/hours) */
    total: number
    capped: boolean
    breakdown: DocumentContribution[]
}

export type SubgroupCompletionState = 'incomplete' | 'complete' | 'exceeded' | null

export interface SubgroupScoreResult {
    subgroupId: string
    total: number
    minPoints: number | null
    maxPoints: number | null
    completion: SubgroupCompletionState
    categories: CategoryScoreResult[]
}

export interface CollectionScoreResult {
    collectionId: string
    total: number
    subgroups: SubgroupScoreResult[]
}

// ---- Validation ----

export interface ValidationResult {
    valid: boolean
    errors: string[]
}