import { ipcMain, BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { PDFDocument } from 'pdf-lib'

export function registerReportHandlers() {
    /**
     * Renders a hidden window with HTML/CSS content and generates a PDF buffer via Chrome print engine
     */
    ipcMain.handle('reports:printToPdf', async (_event, htmlContent: string) => {
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        })

        // Load the styled HTML print layout directly
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
     * Stitches the primary generated PDF report and attached PDF document files into a single Dossier
     */
    ipcMain.handle(
        'reports:exportDossier',
        async (
            _event,
            {
                reportHtml,
                attachmentPaths,
                suggestedFilename,
            }: {
                reportHtml: string
                attachmentPaths: string[]
                suggestedFilename: string
            }
        ) => {
            const win = BrowserWindow.getFocusedWindow()
            const saveResult = await dialog.showSaveDialog(win!, {
                title: 'Export Dossier PDF',
                defaultPath: suggestedFilename,
                filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
            })

            if (saveResult.canceled || !saveResult.filePath) {
                return { success: false, reason: 'canceled' }
            }

            // 1. Generate primary report PDF buffer from HTML
            const printWindow = new BrowserWindow({
                show: false,
                webPreferences: { nodeIntegration: false, contextIsolation: true },
            })

            await printWindow.loadURL(
                `data:text/html;charset=utf-8,${encodeURIComponent(reportHtml)}`
            )

            const reportPdfBuffer = await printWindow.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4',
                margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
            })
            printWindow.destroy()

            // 2. Initialize pdf-lib Master Document
            const masterPdf = await PDFDocument.create()

            // Merge Summary Report pages
            const reportDoc = await PDFDocument.load(reportPdfBuffer)
            const reportPages = await masterPdf.copyPages(reportDoc, reportDoc.getPageIndices())
            reportPages.forEach((page) => masterPdf.addPage(page))

            // 3. Append valid attached PDF files
            for (const filePath of attachmentPaths) {
                try {
                    // Only stitch if file exists and is a PDF
                    if (path.extname(filePath).toLowerCase() === '.pdf') {
                        const fileBytes = await fs.readFile(filePath)
                        const attachmentDoc = await PDFDocument.load(fileBytes)
                        const attachmentPages = await masterPdf.copyPages(
                            attachmentDoc,
                            attachmentDoc.getPageIndices()
                        )
                        attachmentPages.forEach((page) => masterPdf.addPage(page))
                    }
                } catch (err) {
                    console.warn(`Failed to merge attachment file: ${filePath}`, err)
                }
            }

            // 4. Save consolidated dossier to target path
            const mergedBytes = await masterPdf.save()
            await fs.writeFile(saveResult.filePath, mergedBytes)

            return { success: true, filePath: saveResult.filePath }
        }
    )
}