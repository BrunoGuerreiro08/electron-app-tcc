/**
 * Filesystem-safe name for one path segment (a folder or file name — never a
 * full path; callers join segments with their own separator). Targets the
 * intersection of Windows/macOS/Linux rules since exported dossiers travel
 * between machines the app doesn't control.
 */

// Windows-illegal characters + ASCII control chars. `/` and `\` excluded on
// purpose — see stripSeparators below, kept separate so callers that build a
// path by joining pre-sanitized segments can't have a segment smuggle in an
// extra path level.
const ILLEGAL_CHARS = /[<>:"|?*\x00-\x1f]/g
const SEPARATORS = /[\\/]/g

// Reserved device names on Windows — matches the bare name or name+extension.
const RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i

const MAX_SEGMENT_LENGTH = 150

/** Sanitizes one path segment. Never returns empty, never starts/ends with space or dot. */
export function sanitizeSegment(raw: string, fallback = 'sem-nome'): string {
    let s = raw
        .normalize('NFC')
        .replace(SEPARATORS, '-')
        .replace(ILLEGAL_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    // Windows forbids a trailing dot or space.
    s = s.replace(/[. ]+$/g, '')

    if (!s) s = fallback
    if (RESERVED_NAME.test(s)) s = `_${s}`
    if (s.length > MAX_SEGMENT_LENGTH) s = s.slice(0, MAX_SEGMENT_LENGTH).trim() || fallback

    return s
}

/** `3, "Categoria X"` → `"03 - Categoria X"` — keeps the app's display order visible in a file browser. */
export function withOrderPrefix(index: number, name: string): string {
    return `${String(index + 1).padStart(2, '0')} - ${name}`
}

/**
 * De-duplicates a sanitized name against names already used in the same
 * folder: "Nome.pdf" → "Nome (2).pdf" → "Nome (3).pdf".
 * `used` is mutated (the folder's running set) — one instance per folder.
 */
export function dedupeInFolder(used: Set<string>, name: string, ext: string): string {
    let candidate = `${name}${ext}`
    let n = 2
    while (used.has(candidate.toLowerCase())) {
        candidate = `${name} (${n})${ext}`
        n++
    }
    used.add(candidate.toLowerCase())
    return candidate
}
