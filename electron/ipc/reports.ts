import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { runDossierExport } from '../dossier/runDossierExport'
import type { DossierOutputKind, DossierPlan, DossierRunResult } from '../../src/services/dossierExport/types'

/**
 * Everything under the `reports:*` channel namespace — printing a report to
 * PDF, the structured zip/folder document dossier, and a generic file save.
 * Previously split across reports.ts / dossier.ts / exportFiles.ts; merged
 * here since all three are "take something the user already has on screen
 * and save it as a real file" and none of them need to live apart.
 *
 * The screen now offers exactly six exports: PDF, JSON, XLSX, CSV (all via
 * exporters/index.ts's exportReportData, PDF routed through printToPdf below)
 * plus the stitched/individual document dossiers (chooseDossierDestination /
 * runDossierExport). The original exportDossier — one flat PDF merging the
 * printed report with every attachment, no folder structure — is retired:
 * it's no longer reachable from the UI, and the DossierBytesSource adapter
 * that existed solely to feed it into mergeToPdf went with it (see
 * mergeToPdf.ts / dossierExport/types.ts, reverted to path-only sources).
 */

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

/** Shared by every save path below — was duplicated as suggestedNameFrom (dossier.ts) and sanitizeFilename (exportFiles.ts). */
function sanitizeFilename(name: string, fallback = 'export', maxLen = 150): string {
    const s = name.replace(ILLEGAL_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '')
    return s.slice(0, maxLen) || fallback
}

export function registerReportHandlers() {
    /**
     * Renders a hidden window with HTML/CSS content and generates a PDF buffer via Chrome print engine
     */
    ipcMain.handle('reports:printToPdf', async (_event, htmlContent: string) => {
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: false, contextIsolation: true },
        })

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`)

        const pdfBuffer = await printWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }, // inches
        })

        printWindow.destroy()
        return pdfBuffer
    })

    /**
     * Structured zip/folder dossier (see buildDossierPlan/runDossierExport) —
     * the renderer decides WHAT to write and WHERE within the dossier; this
     * handler only asks the OS for a real destination and hands the plan to
     * runDossierExport to do the I/O.
     */
    ipcMain.handle(
        'reports:chooseDossierDestination',
        async (_e, args: { outputKind: DossierOutputKind; collectionName: string }) => {
            const suggestedName = sanitizeFilename(args.collectionName, 'colecao', 100)
            const dateStamp = new Date().toISOString().slice(0, 10)

            if (args.outputKind === 'zip') {
                const result = await dialog.showSaveDialog({
                    title: 'Salvar dossiê de documentos',
                    defaultPath: path.join(app.getPath('downloads'), `${suggestedName}_dossie_${dateStamp}.zip`),
                    filters: [{ name: 'Arquivo ZIP', extensions: ['zip'] }],
                })
                return result.canceled ? null : result.filePath
            }

            const result = await dialog.showOpenDialog({
                title: 'Escolha uma pasta para o dossiê',
                defaultPath: app.getPath('downloads'),
                properties: ['openDirectory', 'createDirectory'],
            })
            if (result.canceled || result.filePaths.length === 0) return null
            // Individual folder pick: nest under a named subfolder so the export
            // doesn't dump its tree straight into whatever folder the user picked.
            return path.join(result.filePaths[0], `${suggestedName}_dossie_${dateStamp}`)
        }
    )

    ipcMain.handle(
        'reports:runDossierExport',
        async (
            _e,
            args: { plan: DossierPlan; outputKind: DossierOutputKind; destinationPath: string; readOnly?: boolean }
        ): Promise<DossierRunResult> => {
            if (typeof args?.destinationPath !== 'string' || !args.destinationPath) {
                throw new Error('Invalid destination path')
            }
            return runDossierExport(args.plan, args.outputKind, args.destinationPath, args.readOnly ?? true)
        }
    )

    /**
     * Generic file save through a native "Save as" dialog, optionally marked
     * read-only on disk (default true) — used for collection/template JSON
     * exports and now the PDF report export. Accepts either text (JSON) or
     * raw bytes (a printed PDF) — was saveTextFile/exportFiles.ts's
     * text-only version before this widening; renamed since "text" no
     * longer describes what it saves.
     *
     * Read-only caveats unchanged from the original exportFiles.ts note: a
     * guard against accidental edits, not a security boundary; overridable
     * by an owner/admin; not preserved by re-zipping.
     */
    ipcMain.handle(
        'reports:saveFile',
        async (
            _e,
            args: {
                content: string | Uint8Array
                suggestedFilename: string
                extension: string
                readOnly?: boolean
            }
        ): Promise<{ path: string } | null> => {
            const ext = args.extension.replace(/^\./, '')
            const result = await dialog.showSaveDialog({
                title: 'Salvar arquivo',
                defaultPath: path.join(app.getPath('downloads'), `${sanitizeFilename(args.suggestedFilename)}.${ext}`),
                filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
            })
            if (result.canceled || !result.filePath) return null

            if (typeof args.content === 'string') {
                await fs.writeFile(result.filePath, args.content, 'utf8')
            } else {
                await fs.writeFile(result.filePath, Buffer.from(args.content))
            }
            if (args.readOnly ?? true) await fs.chmod(result.filePath, 0o444)
            return { path: result.filePath }
        }
    )
}