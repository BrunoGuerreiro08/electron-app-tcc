//#region electron/preload.ts
require("electron").contextBridge.exposeInMainWorld("api", {});
//#endregion
