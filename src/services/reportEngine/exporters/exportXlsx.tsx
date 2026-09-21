import type { Workbook, Worksheet, Row } from 'exceljs'
import type { ReportData } from '../types'
import {
    completionLabel,
    describeRule,
    fileNameOf,
    flattenDocuments,
    parseIsoDate,
} from './shared'

/**
 * Builds a 3-sheet workbook:
 *   Resumo      – collection header + one line per group
 *   Estrutura   – group → subgroup → category tree with calculated totals
 *   Documentos  – flat, filterable list: one row per document with its points
 *
 * All numbers are the scoring engine's output (the same snapshot the PDF uses).
 * They are written as values on purpose: category caps, subgroup clamps and the
 * group bonus are engine logic, and re-implementing them as Excel formulas would
 * let the spreadsheet silently drift from the app.
 */

const FONT = 'Arial'
const NUM_FMT = '0.00'
const DATE_FMT = 'dd/mm/yyyy'

const COLORS = {
    header: 'FF1F3A5F',
    headerText: 'FFFFFFFF',
    group: 'FFD9E2F3',
    subgroup: 'FFEEF2F9',
    border: 'FFBFBFBF',
}

const base = { name: FONT, size: 10 }

function styleHeaderRow(row: Row) {
    row.font = { ...base, bold: true, color: { argb: COLORS.headerText } }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } }
    row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    row.height = 22
}

function fillRow(row: Row, argb: string, colCount: number) {
    for (let c = 1; c <= colCount; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    }
}

function applyPrintSetup(ws: Worksheet) {
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
}

/** Forces Arial everywhere; optionally top-aligns body rows so wrapped text and numbers line up. */
function applyFontToSheet(ws: Worksheet, topAlignFromRow?: number) {
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { ...base, ...(cell.font ?? {}), name: FONT }
            if (topAlignFromRow && rowNumber >= topAlignFromRow) {
                cell.alignment = { ...(cell.alignment ?? {}), vertical: 'top' }
            }
        })
    })
}

function buildSummarySheet(wb: Workbook, report: ReportData) {
    const ws = wb.addWorksheet('Resumo')
    ws.columns = [
        { width: 52 },
        { width: 12 },
        { width: 12 },
        { width: 16 },
        { width: 18 },
        { width: 14 },
        { width: 14 },
    ]

    ws.getCell('A1').value = report.collectionName
    ws.getCell('A1').font = { name: FONT, size: 14, bold: true }
    ws.mergeCells('A1:G1')

    const meta: Array<[string, string | number]> = [
        ['Usuário', report.userName],
        ['E-mail', report.userEmail],
        ['Gerado em', report.generatedAt],
        ['Pontuação total', report.totalScore],
    ]
    meta.forEach(([label, value], i) => {
        const r = 3 + i
        ws.getCell(`A${r}`).value = label
        ws.getCell(`A${r}`).font = { ...base, bold: true }
        ws.getCell(`B${r}`).value = value
        ws.getCell(`B${r}`).alignment = { horizontal: 'left' }
        ws.mergeCells(`B${r}:G${r}`)
        if (typeof value === 'number') {
            ws.getCell(`B${r}`).numFmt = NUM_FMT
            ws.getCell(`B${r}`).font = { ...base, bold: true }
        }
    })

    const headerRowIdx = 8
    const header = ws.getRow(headerRowIdx)
    header.values = [
        'Grupo',
        'Mínimo',
        'Máximo',
        'Pontos brutos',
        'Pontos contabilizados',
        'Situação',
        'Excedente (bônus)',
    ]
    styleHeaderRow(header)

    report.groups.forEach((g, i) => {
        const row = ws.getRow(headerRowIdx + 1 + i)
        row.values = [
            g.name,
            g.minPoints ?? null,
            g.maxPoints ?? null,
            g.rawTotal,
            g.total,
            completionLabel(g.completion),
            g.bonus ?? null,
        ]
        row.getCell(1).alignment = { wrapText: true, vertical: 'top' }
            ;[2, 3, 4, 5, 7].forEach((c) => (row.getCell(c).numFmt = NUM_FMT))
    })

    const noteRow = headerRowIdx + report.groups.length + 3
    ws.getCell(`A${noteRow}`).value =
        'Valores calculados pelo motor de pontuação do aplicativo no momento da exportação.'
    ws.getCell(`A${noteRow}`).font = { name: FONT, size: 9, italic: true, color: { argb: 'FF666666' } }
    ws.mergeCells(`A${noteRow}:G${noteRow}`)

    applyFontToSheet(ws)
    applyPrintSetup(ws)
}

function buildStructureSheet(wb: Workbook, report: ReportData) {
    const ws = wb.addWorksheet('Estrutura')
    const COLS = 9
    ws.columns = [
        { width: 70 }, // Item
        { width: 30 }, // Regra
        { width: 10 }, // Min
        { width: 10 }, // Max
        { width: 14 }, // Bruto
        { width: 18 }, // Contabilizado
        { width: 14 }, // Situação
        { width: 16 }, // Bônus
        { width: 12 }, // Docs
    ]

    const header = ws.getRow(1)
    header.values = [
        'Item',
        'Regra',
        'Mínimo',
        'Máximo',
        'Pontos brutos',
        'Pontos contabilizados',
        'Situação',
        'Excedente (bônus)',
        'Documentos',
    ]
    styleHeaderRow(header)

    const numCols = [3, 4, 5, 6, 8]
    let r = 2

    for (const g of report.groups) {
        const gr = ws.getRow(r++)
        gr.values = [
            g.name,
            g.bonusRate != null ? `Bônus de ${(g.bonusRate * 100).toFixed(0)}% sobre o excedente` : null,
            g.minPoints ?? null,
            g.maxPoints ?? null,
            g.rawTotal,
            g.total,
            completionLabel(g.completion),
            g.bonus ?? null,
            null,
        ]
        fillRow(gr, COLORS.group, COLS)
        gr.font = { ...base, bold: true }
        numCols.forEach((c) => (gr.getCell(c).numFmt = NUM_FMT))
        gr.getCell(1).alignment = { wrapText: true, vertical: 'top' }

        for (const s of g.subgroups) {
            const sr = ws.getRow(r++)
            sr.values = [
                s.name,
                null,
                s.minPoints ?? null,
                s.maxPoints ?? null,
                s.rawTotal,
                s.total,
                completionLabel(s.completion),
                null,
                null,
            ]
            fillRow(sr, COLORS.subgroup, COLS)
            sr.font = { ...base, bold: true }
            numCols.forEach((c) => (sr.getCell(c).numFmt = NUM_FMT))
            sr.getCell(1).alignment = { indent: 1, wrapText: true, vertical: 'top' }

            for (const c of s.categories) {
                const cr = ws.getRow(r++)
                cr.values = [
                    c.name,
                    describeRule(c.rule),
                    null,
                    null,
                    c.rawTotal,
                    c.total,
                    c.capped ? 'Teto atingido' : null,
                    null,
                    c.documents.length,
                ]
                cr.font = base
                numCols.forEach((col) => (cr.getCell(col).numFmt = NUM_FMT))
                cr.getCell(1).alignment = { indent: 2, wrapText: true, vertical: 'top' }
                cr.getCell(2).alignment = { wrapText: true, vertical: 'top' }
            }
        }
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }]
    applyFontToSheet(ws, 2)
    applyPrintSetup(ws)
}

function buildDocumentsSheet(wb: Workbook, report: ReportData) {
    const ws = wb.addWorksheet('Documentos')
    const columns = [
        { header: 'Grupo', width: 34 },
        { header: 'Subgrupo', width: 30 },
        { header: 'Categoria', width: 50 },
        { header: 'Regra', width: 28 },
        { header: 'Documento', width: 44 },
        { header: 'Data de emissão', width: 16 },
        { header: 'Quantidade', width: 12 },
        { header: 'Horas', width: 10 },
        { header: 'Pontos', width: 10 },
        { header: 'Anexo', width: 34 },
        { header: 'Total da categoria (contabilizado)', width: 22 },
        { header: 'Teto da categoria atingido', width: 16 },
    ]
    ws.columns = columns.map((c) => ({ width: c.width }))

    const header = ws.getRow(1)
    header.values = columns.map((c) => c.header)
    styleHeaderRow(header)

    let r = 2
    for (const { group, subgroup, category, document: d } of flattenDocuments(report)) {
        const p = parseIsoDate(d.issuedAt)
        const row = ws.getRow(r++)
        row.values = [
            group.name,
            subgroup.name,
            category.name,
            describeRule(category.rule),
            d.title,
            // Real Excel date (UTC so the local timezone can't shift the day).
            p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : (d.issuedAt ?? ''),
            d.quantity,
            d.hours ?? null,
            d.points,
            d.hasFile ? (fileNameOf(d.filePath) ?? 'Sim') : 'Sem anexo',
            category.total,
            category.capped ? 'Sim' : 'Não',
        ]
        if (p) row.getCell(6).numFmt = DATE_FMT
        row.getCell(9).numFmt = NUM_FMT
        row.getCell(11).numFmt = NUM_FMT
            ;[1, 2, 3, 4, 5, 10].forEach((c) => (row.getCell(c).alignment = { wrapText: true, vertical: 'top' }))
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
    applyFontToSheet(ws, 2)
    applyPrintSetup(ws)
}

/** Returns the raw .xlsx bytes. ExcelJS is loaded lazily so it stays out of the main bundle. */
export async function buildXlsx(report: ReportData): Promise<ArrayBuffer> {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = report.userName
    wb.created = new Date()

    buildSummarySheet(wb, report)
    buildStructureSheet(wb, report)
    buildDocumentsSheet(wb, report)

    return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}