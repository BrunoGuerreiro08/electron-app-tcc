import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateTemplate } from '../../../shared/templateValidation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? path.resolve(__dirname, '../../templates')

export const templateRoutes = new Hono()

interface TemplateIndexEntry {
    fileName: string
    name: string
    description: string | null
    sha256: string
    updatedAt: number
    /** False when the file fails validation: listed (so clients keep their cached copy) but never served. */
    valid: boolean
}

function isSafeFileName(fileName: string): boolean {
    return fileName === path.basename(fileName) && fileName.endsWith('.json')
}

// Only templates that pass the same validator the app uses are published
// (NFR-A01-02). Checked on every request, so a hand-edited file that breaks
// is withdrawn immediately rather than at the next deploy.
function checkTemplate(fileName: string, raw: string): { valid: boolean; name?: string; description?: string } {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch (err) {
        console.error(`[templates] ${fileName} is not valid JSON:`, (err as Error).message)
        return { valid: false }
    }

    const result = validateTemplate(parsed)
    if (!result.ok) {
        console.error(`[templates] ${fileName} failed validation:\n  ${result.errors.join('\n  ')}`)
    }
    const meta = parsed as { name?: string; description?: string }
    return { valid: result.ok, name: meta?.name, description: meta?.description }
}

templateRoutes.get('/', async (c) => {
    const entries: TemplateIndexEntry[] = []

    for (const fileName of await fs.readdir(TEMPLATES_DIR)) {
        if (!isSafeFileName(fileName)) continue
        const filePath = path.join(TEMPLATES_DIR, fileName)
        let raw: Buffer
        let mtimeMs: number
        try {
            raw = await fs.readFile(filePath)
                ; ({ mtimeMs } = await fs.stat(filePath))
        } catch (err) {
            console.error(`[templates] skipping unreadable ${fileName}:`, (err as Error).message)
            continue
        }

        // An invalid file is still listed: leaving it out would read as
        // "removed" to clients and make them delete their last good copy.
        const check = checkTemplate(fileName, raw.toString('utf-8'))
        entries.push({
            fileName,
            name: check.name ?? fileName,
            description: check.description ?? null,
            sha256: createHash('sha256').update(raw).digest('hex'),
            updatedAt: Math.round(mtimeMs),
            valid: check.valid,
        })
    }

    return c.json({ templates: entries })
})

templateRoutes.get('/:fileName', async (c) => {
    const fileName = c.req.param('fileName')
    if (!isSafeFileName(fileName)) {
        return c.json({ error: 'Invalid template name.' }, 400)
    }

    let raw: string
    try {
        raw = await fs.readFile(path.join(TEMPLATES_DIR, fileName), 'utf-8')
    } catch {
        return c.json({ error: 'Template not found.' }, 404)
    }

    if (!checkTemplate(fileName, raw).valid) {
        return c.json({ error: 'Template failed validation and is not published.' }, 422)
    }
    return c.body(raw, 200, { 'Content-Type': 'application/json; charset=utf-8' })
})
