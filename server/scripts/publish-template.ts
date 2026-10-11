/**
 * Publishes an official template: validates it with the same rules the app
 * uses and, only if valid, copies it into server/templates/ (NFR-A01-02).
 *
 *   npm run publish-template -- path/to/My_Template.template.json
 *
 * Clients pick it up on their next sync (app start, or opening the
 * template dialog) — including those that are offline right now.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateTemplate } from '../../shared/templateValidation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? path.resolve(__dirname, '../templates')

const source = process.argv[2]
if (!source) {
    console.error('Usage: npm run publish-template -- <file.json>')
    process.exit(1)
}

let parsed: unknown
try {
    parsed = JSON.parse(fs.readFileSync(source, 'utf-8'))
} catch (err) {
    console.error(`Could not read ${source} as JSON: ${(err as Error).message}`)
    process.exit(1)
}

const result = validateTemplate(parsed)
if (!result.ok) {
    console.error(`${source} is not a valid template — not published:`)
    for (const error of result.errors) console.error(`  - ${error}`)
    process.exit(1)
}

const fileName = path.basename(source)
if (!fileName.endsWith('.json')) {
    console.error('Template file names must end in .json.')
    process.exit(1)
}

const destination = path.join(TEMPLATES_DIR, fileName)
const replacing = fs.existsSync(destination)
fs.copyFileSync(source, destination)
console.log(`${replacing ? 'Updated' : 'Published'} "${result.template!.name}" as ${fileName}.`)
