import { promises as fs } from 'node:fs'
import path from 'node:path'
import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { mergeToPdf } from './mergeToPdf'
import type { DossierOutputKind, DossierPlan, DossierRunResult } from '../../src/services/dossierExport/types'

/**
 * Makes a file un-writable by its owner. On POSIX this clears the write bits
 * (0o444 = r--r--r--); on Windows, Node's fs.chmod only has one bit of
 * expressive power and maps it to the file's Read-only attribute — the same
 * mechanism Explorer's "Read-only" checkbox uses. Either way this is a guard
 * against accidental edits, not a security boundary: an owner/admin can
 * always chmod it back, and the protection doesn't survive being zipped,
 * emailed, or copied to a filesystem that doesn't track permissions (e.g.
 * inside most zip extractions, depending on the tool used).
 */
async function makeReadOnly(absolutePath: string): Promise<void> {
    await fs.chmod(absolutePath, 0o444)
}

async function writeToFolder(plan: DossierPlan, destDir: string, readOnly: boolean): Promise<DossierRunResult> {
    const failures: DossierRunResult['failures'] = []
    let written = 0

    for (const entry of plan.entries) {
        const destAbs = path.join(destDir, ...entry.destPath.split('/'))
        await fs.mkdir(path.dirname(destAbs), { recursive: true })

        if (entry.kind === 'stitched') {
            const { bytes, failures: mergeFailures } = await mergeToPdf(entry.sources)
            mergeFailures.forEach((f) => failures.push({ destPath: entry.destPath, reason: f.reason }))
            if (mergeFailures.length === entry.sources.length) continue // nothing merged, skip writing an empty shell
            await fs.writeFile(destAbs, bytes)
        } else {
            try {
                await fs.copyFile(entry.source.absolutePath, destAbs)
            } catch (err) {
                failures.push({
                    destPath: entry.destPath,
                    reason: err instanceof Error ? err.message : 'arquivo não encontrado no disco',
                })
                continue
            }
        }

        if (readOnly) await makeReadOnly(destAbs)
        written++
    }

    return { outputPath: destDir, entriesWritten: written, failures, readOnly }
}

async function writeToZip(plan: DossierPlan, destZipPath: string, readOnly: boolean): Promise<DossierRunResult> {
    const failures: DossierRunResult['failures'] = []
    let written = 0

    await fs.mkdir(path.dirname(destZipPath), { recursive: true })

    const output = createWriteStream(destZipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    const closed = new Promise<void>((resolve, reject) => {
        output.on('close', resolve)
        output.on('error', reject)
        archive.on('error', reject)
    })
    archive.pipe(output)

    for (const entry of plan.entries) {
        if (entry.kind === 'stitched') {
            const { bytes, failures: mergeFailures } = await mergeToPdf(entry.sources)
            mergeFailures.forEach((f) => failures.push({ destPath: entry.destPath, reason: f.reason }))
            if (mergeFailures.length === entry.sources.length) continue
            archive.append(Buffer.from(bytes), { name: entry.destPath })
            written++
        } else {
            try {
                await fs.access(entry.source.absolutePath)
            } catch {
                failures.push({ destPath: entry.destPath, reason: 'arquivo não encontrado no disco' })
                continue
            }
            archive.file(entry.source.absolutePath, { name: entry.destPath })
            written++
        }
    }

    await archive.finalize()
    await closed

    if (readOnly) await makeReadOnly(destZipPath)
    return { outputPath: destZipPath, entriesWritten: written, failures, readOnly }
}

/**
 * Executes a plan already fully decided by buildDossierPlan (renderer side —
 * see that module for naming/ordering/skip logic). This function only does
 * I/O: read source files, merge PDFs where the plan says to, write the
 * result to a folder or a single zip, optionally make outputs read-only.
 */
export async function runDossierExport(
    plan: DossierPlan,
    outputKind: DossierOutputKind,
    destinationPath: string,
    readOnly = true
): Promise<DossierRunResult> {
    return outputKind === 'zip'
        ? writeToZip(plan, destinationPath, readOnly)
        : writeToFolder(plan, destinationPath, readOnly)
}
