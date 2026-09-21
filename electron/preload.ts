import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
    collections: {
        get: (id: string) => ipcRenderer.invoke('collections:get', id),
        list: () => ipcRenderer.invoke('collections:list'),
        create: (name: string, color?: string) =>
            ipcRenderer.invoke('collections:create', name, color),
        rename: (id: string, name: string) => ipcRenderer.invoke('collections:rename', id, name),
        delete: (id: string) => ipcRenderer.invoke('collections:delete', id),
    },
    groups: {
        listByCollection: (collectionId: string) =>
            ipcRenderer.invoke('groups:listByCollection', collectionId),
        create: (collectionId: string, name: string, displayOrder?: number) =>
            ipcRenderer.invoke('groups:create', collectionId, name, displayOrder),
        update: (id: string, updates: unknown) => ipcRenderer.invoke('groups:update', id, updates),
        delete: (id: string) => ipcRenderer.invoke('groups:delete', id),
    },
    subgroups: {
        listByCollection: (collectionId: string) =>
            ipcRenderer.invoke('subgroups:listByCollection', collectionId),
        create: (collectionId: string, groupId: string, name: string, displayOrder?: number) =>
            ipcRenderer.invoke('subgroups:create', collectionId, groupId, name, displayOrder),
        update: (id: string, updates: unknown) =>
            ipcRenderer.invoke('subgroups:update', id, updates),
        delete: (id: string) => ipcRenderer.invoke('subgroups:delete', id),
    },
    categories: {
        listBySubgroup: (subgroupId: string) =>
            ipcRenderer.invoke('categories:listBySubgroup', subgroupId),
        create: (subgroupId: string, name: string, rule: unknown, displayOrder?: number) =>
            ipcRenderer.invoke('categories:create', subgroupId, name, rule, displayOrder),
        update: (id: string, updates: unknown) =>
            ipcRenderer.invoke('categories:update', id, updates),
        delete: (id: string) => ipcRenderer.invoke('categories:delete', id),
    },
    documents: {
        list: () => ipcRenderer.invoke('documents:list'),
        listUnlinked: () => ipcRenderer.invoke('documents:listUnlinked'),
        create: (input: unknown) => ipcRenderer.invoke('documents:create', input),
        bulkImport: (items: { fileName: string; title: string }[]) =>
            ipcRenderer.invoke('documents:bulkImport', items),
        update: (id: string, updates: unknown) =>
            ipcRenderer.invoke('documents:update', id, updates),
        delete: (id: string) => ipcRenderer.invoke('documents:delete', id),
    },
    tags: {
        list: () => ipcRenderer.invoke('tags:list'),
        create: (name: string, color?: string) => ipcRenderer.invoke('tags:create', name, color),
        update: (id: string, name: string, color: string) => ipcRenderer.invoke('tags:update', id, name, color),
        delete: (id: string) => ipcRenderer.invoke('tags:delete', id),
        listForDocument: (documentId: string) =>
            ipcRenderer.invoke('tags:listForDocument', documentId),
        attachToDocument: (documentId: string, tagId: string) =>
            ipcRenderer.invoke('tags:attachToDocument', documentId, tagId),
        detachFromDocument: (documentId: string, tagId: string) =>
            ipcRenderer.invoke('tags:detachFromDocument', documentId, tagId),
    },
    documentCategoryLinks: {
        listByCategory: (categoryId: string) =>
            ipcRenderer.invoke('documentCategoryLinks:listByCategory', categoryId),
        listByDocument: (documentId: string) =>
            ipcRenderer.invoke('documentCategoryLinks:listByDocument', documentId),
        link: (documentId: string, categoryId: string) =>
            ipcRenderer.invoke('documentCategoryLinks:link', documentId, categoryId),
        unlink: (documentId: string, categoryId: string) =>
            ipcRenderer.invoke('documentCategoryLinks:unlink', documentId, categoryId),
    },
    session: {
        get: () => ipcRenderer.invoke('session:get'),
        set: (session: unknown) => ipcRenderer.invoke('session:set', session),
        clear: () => ipcRenderer.invoke('session:clear'),
    },
    settings: {
        getStorageFolder: () => ipcRenderer.invoke('settings:getStorageFolder'),
        pickStorageFolder: () => ipcRenderer.invoke('settings:pickStorageFolder'),
        changeStorageFolder: (newFolder: string) =>
            ipcRenderer.invoke('settings:changeStorageFolder', newFolder),
    },
    files: {
        pick: () => ipcRenderer.invoke('files:pick'),
        attach: (documentId: string, sourcePath: string) =>
            ipcRenderer.invoke('files:attach', documentId, sourcePath),
        remove: (documentId: string) => ipcRenderer.invoke('files:remove', documentId),
        open: (documentId: string) => ipcRenderer.invoke('files:open', documentId),
        detectOrphans: () => ipcRenderer.invoke('files:detectOrphans'),
        detectDroppedFiles: () => ipcRenderer.invoke('files:detectDroppedFiles'),
    },
    reports: {
        printToPdf: (htmlContent: string) =>
            ipcRenderer.invoke('reports:printToPdf', htmlContent),
        exportDossier: (params: {
            reportHtml: string
            attachmentPaths: string[]
            suggestedFilename: string
        }) => ipcRenderer.invoke('reports:exportDossier', params),
    },
    preferences: {
        get: () => ipcRenderer.invoke('preferences:get'),
        setLanguage: (language: 'en' | 'pt-BR') => ipcRenderer.invoke('preferences:setLanguage', language),
        setTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke('preferences:setTheme', theme),
    },
    templates: {
        listOfficial: () => ipcRenderer.invoke('templates:listOfficial'),
        listImported: () => ipcRenderer.invoke('templates:listImported'),
        pickAndImport: () => ipcRenderer.invoke('templates:pickAndImport'),
        apply: (
            source: { kind: 'official' | 'imported'; fileName: string },
            collectionName: string,
            color: string | null
        ) => ipcRenderer.invoke('templates:apply', source, collectionName, color),
        exportCollection: (collectionId: string) =>
            ipcRenderer.invoke('templates:exportCollection', collectionId),
        deleteImported: (fileName: string) => ipcRenderer.invoke('templates:deleteImported', fileName),
    },
    reviews: {
        list: () => ipcRenderer.invoke('reviews:list'),
        get: (id: string) => ipcRenderer.invoke('reviews:get', id),
        save: (input: unknown) => ipcRenderer.invoke('reviews:save', input),
        remove: (id: string) => ipcRenderer.invoke('reviews:remove', id),
    },
})