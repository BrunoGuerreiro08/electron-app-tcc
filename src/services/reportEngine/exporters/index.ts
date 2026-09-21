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
            const text = serializeExportJson(report, { description: options.description })
            downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), `${base}_export.json`)
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