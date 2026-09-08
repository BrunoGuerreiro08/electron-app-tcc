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

/**
 * Caps EACH document's own contribution individually, before summing —
 * distinct from CappedRule, which caps the category's AGGREGATE sum
 * across all documents. Field deliberately named capPerDocument, not
 * cap, so the two concepts can never be confused at the type level:
 * `capped(flat(2), cap: 10)` means "10 documents at most, combined,
 * count toward 10 points total"; `cappedPerDocument(hours(0.5), 3)`
 * means "each document maxes at 3 points, but log as many as you
 * want — nothing stops the sum from growing across documents."
 *
 * Matches a source spreadsheet pattern where an hours-based item (e.g.
 * "0.5 points per hour of attendance") has each individual event's
 * points clamped (=IF(hours*rate>=3,3,hours*rate)) before being summed
 * with other events of the same type — someone can't inflate one
 * event's hours to dominate the category, but logging more qualifying
 * events keeps adding up normally.
 */
export interface CappedPerDocumentRule {
    type: 'cappedPerDocument'
    inner: FlatRule | HoursRule
    capPerDocument: number
}

export type Rule = FlatRule | HoursRule | CappedRule | CappedPerDocumentRule

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

// CompletionState is level-agnostic — the same incomplete/complete/
// exceeded logic applies identically whether it's a SubGroup or a Group
// being checked against its own min/max. Kept the original name as an
// alias since SubgroupScoreResult already used it before Group existed.
export type CompletionState = 'incomplete' | 'complete' | 'exceeded' | null
export type SubgroupCompletionState = CompletionState

export interface SubgroupScoreResult {
    subgroupId: string
    /** Score before maxPoints is applied */
    rawTotal: number
    /** Score after maxPoints is applied (equals rawTotal when maxPoints is null) */
    total: number
    minPoints: number | null
    maxPoints: number | null
    completion: CompletionState
    categories: CategoryScoreResult[]
}

export interface GroupScoreResult {
    groupId: string
    /** Score before maxPoints is applied */
    rawTotal: number
    /** Score after maxPoints is applied (equals rawTotal when maxPoints is null) */
    total: number
    minPoints: number | null
    maxPoints: number | null
    completion: CompletionState
    /**
     * Points earned above minPoints, revalued at the group's bonusRate,
     * kept as a SEPARATE figure — never added into `total`. Computed
     * from the CLAMPED `total`, not `rawTotal` — the bonus applies to
     * points actually credited, not to an excess that was already
     * capped away. Mirrors a source spreadsheet that displays "Total
     * Grupo I" and "Excedente" as two distinct numbers. null means
     * bonusRate/minPoints weren't configured — "not applicable here",
     * not "0 bonus". This lives on Group, not SubGroup — a group-
     * spanning bonus needs to sit above the subgroups it spans. See
     * computeSubgroupBonus in subgroupBonus.ts (name kept — the
     * function itself is level-agnostic, it just takes total/min/rate).
     */
    bonus: number | null
    subgroups: SubgroupScoreResult[]
}

export interface CollectionScoreResult {
    collectionId: string
    total: number
    groups: GroupScoreResult[]
}

// ---- Validation ----

export interface ValidationError {
    key: string
    params?: Record<string, unknown>
}

export interface ValidationResult {
    valid: boolean
    errors: ValidationError[]
}