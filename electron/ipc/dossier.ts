import { app, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { runDossierExport } from '../dossier/runDossierExport'
import type { DossierOutputKind, DossierPlan, DossierRunResult } from '../../src/services/dossierExport/types'

// Local, minimal mirror of buildDossierPlan's sanitizeSegment (that function lives in the
// renderer project and isn't imported here — this file only needs a safe DEFAULT filename,
// the actual in-dossier names are decided entirely by the plan the renderer already built).
const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g
function suggestedNameFrom(collectionName: string): string {
    const s = collectionName.replace(ILLEGAL_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '')
    return s.slice(0, 100) || 'colecao'
}

/**
 * The renderer decides WHAT to write and WHERE within the dossier (see
 * buildDossierPlan) — this handler only asks the OS for a real destination
 * and asks runDossierExport to do the I/O. `plan` crosses the IPC boundary
 * as plain data; absolute source paths inside it were chosen by the
 * renderer from data the user already owns (their own collection), not
 * from anything remote.
 */
export function registerDossierHandlers() {
    ipcMain.handle(
        'dossier:chooseDestination',
        async (_e, args: { outputKind: DossierOutputKind; collectionName: string }) => {
            const suggestedName = suggestedNameFrom(args.collectionName)
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
        'dossier:run',
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
}
