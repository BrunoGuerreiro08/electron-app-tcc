import { app, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Saves exported text content (collection JSON, template JSON, …) through a
 * native "Save as" dialog and marks the result read-only on disk — same
 * mechanism and same caveats as the dossier writer (see runDossierExport's
 * makeReadOnly): a guard against accidental edits, overridable by an
 * owner/admin, and not preserved by re-zipping or re-copying.
 *
 * Kept separate from the download-blob path used by CSV/XLSX for now — this
 * channel is for content the sender explicitly wants protected as a fixed
 * snapshot (an export meant to be reviewed unmodified, or a distributed
 * template). Route more formats through it later if that's wanted too.
 */

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g
function sanitizeFilename(name: string): string {
    const s = name.replace(ILLEGAL_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '')
    return s.slice(0, 150) || 'export'
}

export function registerExportFileHandlers() {
    ipcMain.handle(
        'exportFiles:saveText',
        async (
            _e,
            args: { content: string; suggestedFilename: string; extension: string; readOnly?: boolean }
        ): Promise<{ path: string } | null> => {
            const ext = args.extension.replace(/^\./, '')
            const result = await dialog.showSaveDialog({
                title: 'Salvar arquivo',
                defaultPath: path.join(app.getPath('downloads'), `${sanitizeFilename(args.suggestedFilename)}.${ext}`),
                filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
            })
            if (result.canceled || !result.filePath) return null

            await fs.writeFile(result.filePath, args.content, 'utf8')
            if (args.readOnly ?? true) await fs.chmod(result.filePath, 0o444)
            return { path: result.filePath }
        }
    )
}