import { buildDossierPlan } from './buildDossierPlan'
import type { DossierMode, DossierOutputKind, DossierPlan, DossierRunResult } from './types'
import type { ReportData } from '../reportEngine/types'

export * from './types'
export { buildDossierPlan }

export interface DossierExportOutcome {
    /** User cancelled the destination picker — not an error. */
    cancelled: boolean
    plan?: DossierPlan
    result?: DossierRunResult
}

/**
 * Full flow for the two "export documents" buttons on the report screen:
 * build the plan locally, let the user pick where it goes (native dialog,
 * main process), then hand the plan to the main process to actually merge/
 * copy/zip the files. `report` must be the live ReportData with real local
 * file paths (the one already used for the PDF/JSON/XLSX exports) — this
 * never runs against an imported/reviewed snapshot, which has no files.
 */
export async function exportDossier(
    report: ReportData,
    mode: DossierMode,
    outputKind: DossierOutputKind,
    options: { readOnly?: boolean } = {}
): Promise<DossierExportOutcome> {
    const plan = buildDossierPlan(report, mode)

    const destinationPath = await window.api.dossier.chooseDestination({
        outputKind,
        collectionName: report.collectionName,
    })
    if (!destinationPath) return { cancelled: true, plan }

    const result = await window.api.dossier.run({
        plan,
        outputKind,
        destinationPath,
        readOnly: options.readOnly ?? true,
    })
    return { cancelled: false, plan, result }
}
