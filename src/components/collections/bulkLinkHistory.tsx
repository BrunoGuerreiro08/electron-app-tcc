/**
 * Pure state logic for the bulk-link dialog's staged changes.
 *
 * Nothing here touches React, the repositories or the DOM, so it can be
 * unit-tested by feeding actions straight into `historyReducer`.
 *
 * Undo model: every mutation snapshots the previous `changes` array onto
 * `past`. One user gesture (e.g. dropping 3 documents on a category) is one
 * snapshot, so a single Ctrl+Z reverts the whole gesture.
 */

/** A link the user has staged but not yet applied. */
export interface PendingLink {
    /** Deterministic `${docId}:${categoryId}` — doubles as the dedupe key. */
    id: string
    docId: string
    docTitle: string
    collectionId: string
    collectionName: string
    collectionColor?: string | null
    groupId: string
    groupName: string
    subgroupId: string
    subgroupName: string
    categoryId: string
    categoryName: string
}

export interface HistoryState {
    changes: PendingLink[]
    past: PendingLink[][]
    future: PendingLink[][]
}

export type HistoryAction =
    | { type: 'add'; changes: PendingLink[] }
    | { type: 'remove'; id: string }
    | { type: 'clear' }
    | { type: 'undo' }
    | { type: 'redo' }
    | { type: 'reset' }

export const initialHistory: HistoryState = { changes: [], past: [], future: [] }

export const pairKey = (docId: string, categoryId: string) => `${docId}:${categoryId}`

/** Record `changes` as the new present; a fresh edit invalidates redo. */
function commit(state: HistoryState, changes: PendingLink[]): HistoryState {
    return { changes, past: [...state.past, state.changes], future: [] }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
    switch (action.type) {
        case 'add': {
            const seen = new Set(state.changes.map((c) => c.id))
            const fresh = action.changes.filter((c) => !seen.has(c.id))
            // Nothing new (all duplicates) → no history entry, no re-render.
            if (fresh.length === 0) return state
            return commit(state, [...state.changes, ...fresh])
        }
        case 'remove': {
            if (!state.changes.some((c) => c.id === action.id)) return state
            return commit(state, state.changes.filter((c) => c.id !== action.id))
        }
        case 'clear':
            return state.changes.length === 0 ? state : commit(state, [])
        case 'undo': {
            if (state.past.length === 0) return state
            const previous = state.past[state.past.length - 1]
            return {
                changes: previous,
                past: state.past.slice(0, -1),
                future: [state.changes, ...state.future],
            }
        }
        case 'redo': {
            if (state.future.length === 0) return state
            const [next, ...rest] = state.future
            return {
                changes: next,
                past: [...state.past, state.changes],
                future: rest,
            }
        }
        case 'reset':
            return initialHistory
    }
}