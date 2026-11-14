import type { AppInfo } from '@/types/app'

export const appRepository = {
    info: (): Promise<AppInfo> => window.api.app.info(),
    /** Opens in the system browser / mail client; the main process only allows http(s) and mailto. */
    openExternal: (url: string): Promise<void> => window.api.app.openExternal(url),
}
