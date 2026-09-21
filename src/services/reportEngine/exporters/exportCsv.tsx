import type { ReportData } from '../types'
import { describeRule, flattenDocuments, parseIsoDate } from './shared'

export interface CsvOptions {
    /** `;` opens correctly in pt-BR Excel (the default list separator there is `;`). Use `,` for other tools. */
    delimiter?: ';' | ',' | '\t'
    /** `,` matches pt-BR Excel; use `.` for programmatic consumers. */
    decimal?: ',' | '.'
}

const HEADERS = [
    'Grupo',
    'Subgrupo',
    'Categoria',
    'Regra',
    'Documento',
    'Data de emissão',
    'Quantidade',
    'Horas',
    'Pontos',
    'Anexo',
    'Total da categoria (contabilizado)',
    'Teto da categoria atingido',
]

export function buildCsv(report: ReportData, options: CsvOptions = {}): string {
    const delimiter = options.delimiter ?? ';'
    const decimal = options.decimal ?? ','

    const num = (n: number | null | undefined): string =>
        n == null ? '' : Number(n.toFixed(4)).toString().replace('.', decimal)

    const date = (iso: string | null): string => {
        const p = parseIsoDate(iso)
        return p
            ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
            : (iso ?? '')
    }

    const escape = (value: string): string => {
        // CSV/formula injection guard: titles are user-typed and Excel evaluates
        // cells that start with = + - @ (or tab / CR).
        const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
        return safe.includes(delimiter) || /["\r\n]/.test(safe)
            ? `"${safe.replace(/"/g, '""')}"`
            : safe
    }

    const lines: string[] = [HEADERS.map(escape).join(delimiter)]

    for (const { group, subgroup, category, document: d } of flattenDocuments(report)) {
        lines.push(
            [
                group.name,
                subgroup.name,
                category.name,
                describeRule(category.rule),
                d.title,
                date(d.issuedAt),
                String(d.quantity ?? ''),
                num(d.hours),
                num(d.points),
                d.hasFile ? 'Sim' : 'Não',
                num(category.total),
                category.capped ? 'Sim' : 'Não',
            ]
                .map(escape)
                .join(delimiter)
        )
    }

    // BOM so Excel detects UTF-8 (accents); CRLF per RFC 4180.
    return '\uFEFF' + lines.join('\r\n') + '\r\n'
}