/**
 * Triggers a save of an in-memory blob. In Electron's renderer this fires the
 * `will-download` flow, which shows the native "Save as" dialog by default.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Give the browser a moment to start the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
}