import type { ReportData } from './types'

export function generateReportHtml(data: ReportData): string {
    const getBadgeClass = (status: string | null) => {
        switch (status) {
            case 'complete':
                return 'background:#dcfce7; color:#166534;'
            case 'exceeded':
                return 'background:#dbeafe; color:#1e40af;'
            case 'incomplete':
                return 'background:#fee2e2; color:#991b1b;'
            default:
                return 'background:#f3f4f6; color:#374151;'
        }
    }

    const translateStatus = (status: string | null) => {
        switch (status) {
            case 'complete':
                return 'Concluído'
            case 'exceeded':
                return 'Excedido'
            case 'incomplete':
                return 'Incompleto'
            default:
                return 'Sem meta'
        }
    }

    // Shown only when a maxPoints cap actually reduced the total — the
    // same transparency `cat.capped` already gives per category (NFR-
    // 08-02), extended one and two levels up now that SubGroup/Group
    // both expose rawTotal alongside the clamped total.
    const rawTotalNote = (rawTotal: number, total: number, mutedColor: string) =>
        total < rawTotal
            ? `<span style="font-size:10px; color:${mutedColor}; margin-left:6px;">(bruto: ${rawTotal.toFixed(2)})</span>`
            : ''

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            body { padding: 24px; color: #111827; background: #fff; font-size: 13px; line-height: 1.5; }
            .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .title { font-size: 20px; font-weight: 700; color: #0f172a; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            .meta { text-align: right; font-size: 12px; color: #475569; }
            .total-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
            .total-label { font-size: 14px; font-weight: 600; color: #334155; }
            .total-value { font-size: 24px; font-weight: 800; color: #2563eb; }

            .group { margin-bottom: 32px; page-break-inside: avoid; }
            .group-header { background: #1e293b; color: #fff; padding: 12px 16px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; }
            .group-title { font-size: 16px; font-weight: 800; }
            .group-body { border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 16px; background: #fff; }
            .bonus-badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #ede9fe; color: #5b21b6; margin-right: 8px; }

            .subgroup { margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
            .subgroup:last-child { margin-bottom: 0; }
            .subgroup-header { background: #f1f5f9; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
            .subgroup-title { font-size: 14px; font-weight: 700; color: #1e293b; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
            
            .category { padding: 12px 16px; border-bottom: 1px dashed #f1f5f9; }
            .category:last-child { border-bottom: none; }
            .category-header { display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 600; font-size: 13px; color: #334155; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
            th { text-align: left; background: #fafafa; padding: 6px 8px; color: #64748b; font-weight: 600; border-bottom: 1px solid #f1f5f9; }
            td { padding: 6px 8px; border-bottom: 1px solid #f8fafc; color: #334155; }
            .text-right { text-align: right; }
            .file-icon { font-size: 11px; color: #059669; }
            .no-file { color: #9ca3af; }
        </style>
    </head>
    <body>
        <div class="header">
            <div>
                <div class="title">${data.collectionName}</div>
                <div class="subtitle">Relatório de Pontuação e Comprovação Portfolio</div>
            </div>
            <div class="meta">
                <div><strong>Docente:</strong> ${data.userName}</div>
                <div><strong>Emissão:</strong> ${data.generatedAt}</div>
            </div>
        </div>

        <div class="total-card">
            <div class="total-label">Pontuação Total Acumulada</div>
            <div class="total-value">${data.totalScore.toFixed(2)} pts</div>
        </div>

        ${data.groups
            .map(
                (group) => `
            <div class="group">
                <div class="group-header">
                    <div class="group-title">${group.name}</div>
                    <div>
                        ${group.bonus != null && group.bonus > 0
                        ? `<span class="bonus-badge">+${group.bonus.toFixed(2)} bônus</span>`
                        : ''}
                        <span class="badge" style="${getBadgeClass(group.completion)}">
                            ${translateStatus(group.completion)}
                        </span>
                        <strong style="margin-left: 8px;">${group.total.toFixed(2)} pts</strong>
                        ${rawTotalNote(group.rawTotal, group.total, '#cbd5e1')}
                    </div>
                </div>
                <div class="group-body">
                    ${group.subgroups
                        .map(
                            (subgroup) => `
                        <div class="subgroup">
                            <div class="subgroup-header">
                                <div class="subgroup-title">${subgroup.name}</div>
                                <div>
                                    <span class="badge" style="${getBadgeClass(subgroup.completion)}">
                                        ${translateStatus(subgroup.completion)}
                                    </span>
                                    <strong style="margin-left: 8px;">${subgroup.total.toFixed(2)} pts</strong>
                                    ${rawTotalNote(subgroup.rawTotal, subgroup.total, '#94a3b8')}
                                </div>
                            </div>
                            ${subgroup.categories
                                    .map(
                                        (cat) => `
                                <div class="category">
                                    <div class="category-header">
                                        <span>${cat.name}</span>
                                        <span>${cat.total.toFixed(2)} pts ${cat.capped ? '(Teto aplicado)' : ''}</span>
                                    </div>
                                    ${cat.documents.length > 0
                                                ? `
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Documento</th>
                                                    <th>Emissão</th>
                                                    <th>Qtd / Horas</th>
                                                    <th>Anexo</th>
                                                    <th class="text-right">Pontos</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${cat.documents
                                                    .map(
                                                        (doc) => `
                                                    <tr>
                                                        <td>${doc.title}</td>
                                                        <td>${doc.issuedAt || '-'}</td>
                                                        <td>${doc.hours ? `${doc.hours}h` : `${doc.quantity}x`}</td>
                                                        <td>${doc.hasFile ? '<span class="file-icon">✓ Anexado</span>' : '<span class="no-file">Sem arquivo</span>'}</td>
                                                        <td class="text-right"><strong>+${doc.points.toFixed(2)}</strong></td>
                                                    </tr>
                                                `
                                                    )
                                                    .join('')}
                                            </tbody>
                                        </table>
                                    `
                                                : '<div style="font-size:11px; color:#9ca3af; padding: 4px 0;">Nenhum documento associado.</div>'
                                            }
                                </div>
                            `
                                    )
                                    .join('')}
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </div>
        `
            )
            .join('')}
    </body>
    </html>
    `
}