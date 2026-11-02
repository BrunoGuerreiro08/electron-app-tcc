import type { SyncStatus } from '../../shared/syncProtocol'

export const syncRepository = {
    status: (): Promise<SyncStatus> => window.api.sync.status(),
    now: (): Promise<SyncStatus> => window.api.sync.now(),
    setCollectionEnabled: (collectionId: string, enabled: boolean): Promise<void> =>
        window.api.sync.setCollectionEnabled(collectionId, enabled),
}
