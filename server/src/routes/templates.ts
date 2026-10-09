import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? path.resolve(__dirname, '../../templates')

export const templateRoutes = new Hono()

interface TemplateIndexEntry {
    fileName: string
    name: string
    description: string | null
    sha256: string
    updatedAt: number
}

function isSafeFileName(fileName: string): boolean {
    return fileName === path.basename(fileName) && fileName.endsWith('.json')
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

        let parsed: { name?: string; description?: string } = {}
        try {
            parsed = JSON.parse(raw.toString('utf-8'))
        } catch (err) {
            console.error(`[templates] ${fileName} is not valid JSON:`, (err as Error).message)
        }

        entries.push({
            fileName,
            name: parsed.name ?? fileName,
            description: parsed.description ?? null,
            sha256: createHash('sha256').update(raw).digest('hex'),
            updatedAt: Math.round(mtimeMs),
        })
    }

    return c.json({ templates: entries })
})

templateRoutes.get('/:fileName', async (c) => {
    const fileName = c.req.param('fileName')
    if (!isSafeFileName(fileName)) {
        return c.json({ error: 'Invalid template name.' }, 400)
    }

    try {
        const raw = await fs.readFile(path.join(TEMPLATES_DIR, fileName), 'utf-8')
        return c.body(raw, 200, { 'Content-Type': 'application/json; charset=utf-8' })
    } catch {
        return c.json({ error: 'Template not found.' }, 404)
    }
})
