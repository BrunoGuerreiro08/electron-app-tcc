import type { ReportData } from '../types'
import { buildCsv, type CsvOptions } from './exportCsv'
import { serializeExportJson } from './exportJson'
import { buildXlsx } from './exportXlsx'
import { buildReportHtml } from './exportPdf'
import { downloadBlob } from './download'
import { safeFilename, todayStamp } from './shared'

export type DataExportFormat = 'pdf' | 'json' | 'xlsx' | 'csv'

export interface ExportOptions {
    csv?: CsvOptions
    /** Written to the JSON `description` field (ReportData doesn't carry it). */
    description?: string | null
    templateOrigin?: { templateName: string; templateFingerprint: string } | null
    /**
     * PDF and JSON exports go through a native "Save as" dialog and get
     * marked read-only on disk (default true) instead of a browser-style
     * download — see reports:saveFile in electron/ipc/reports.ts. Set false
     * to keep the old download behavior (e.g. an automated/background export
     * with no dialog).
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
        case 'pdf': {
            const html = buildReportHtml(report)
            const bytes = await window.api.reports.printToPdf(html)
            if (options.readOnly === false) {
                downloadBlob(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${base}_relatorio.pdf`)
                return
            }
            // Same reasoning as JSON below: saved through a native dialog (not a
            // browser download) so the result can be marked read-only on disk.
            await window.api.reports.saveFile({
                content: bytes,
                suggestedFilename: `${base}_relatorio`,
                extension: 'pdf',
                readOnly: true,
            })
            return
        }
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
            await window.api.reports.saveFile({
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