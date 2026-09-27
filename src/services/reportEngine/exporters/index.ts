import type { ReportData } from '../types'
import { buildCsv, type CsvOptions } from './exportCsv'
import { serializeExportJson } from './exportJson'
import { buildXlsx } from './exportXlsx'
import { downloadBlob } from './download'
import { safeFilename, todayStamp } from './shared'

export type DataExportFormat = 'json' | 'xlsx' | 'csv'

export interface ExportOptions {
    csv?: CsvOptions
    /** Written to the JSON `description` field (ReportData doesn't carry it). */
    description?: string | null
    templateOrigin?: { templateName: string; templateFingerprint: string } | null
    /**
     * JSON exports go through a native "Save as" dialog and get marked
     * read-only on disk (default true) instead of a browser-style download —
     * see electron/ipc/exportFiles.ts. Set false to keep the old download
     * behavior (e.g. for an automated/background export with no dialog).
     */
    readOnly?: boolean
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Builds the file for `format` from the same ReportData snapshot the preview and
 * the PDF use, then hands it to the browser/Electron save flow.
 * Throws on failure *before* any download starts, so no partial file is saved.
 */
export async function exportReportData(
    format: DataExportFormat,
    report: ReportData,
    options: ExportOptions = {}
): Promise<void> {
    const base = `${safeFilename(report.collectionName)}_${todayStamp()}`

    switch (format) {
        case 'json': {
            const text = serializeExportJson(report, {
                description: options.description,
                templateOrigin: options.templateOrigin,
            })
            if (options.readOnly === false) {
                downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), `${base}_export.json`)
                return
            }
            // Saved (not downloaded) so it can be marked read-only: window.location's download
            // attribute gives the browser no handle to the final file to chmod afterward.
            await window.api.exportFiles.saveText({
                content: text,
                suggestedFilename: `${base}_export`,
                extension: 'json',
                readOnly: true,
            })
            return
        }
        case 'csv': {
            const text = buildCsv(report, options.csv)
            downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${base}_documentos.csv`)
            return
        }
        case 'xlsx': {
            const bytes = await buildXlsx(report)
            downloadBlob(new Blob([bytes], { type: XLSX_MIME }), `${base}_pontuacao.xlsx`)
            return
        }
    }
}