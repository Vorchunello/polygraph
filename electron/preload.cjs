// Мост между окном и главным процессом. Форма API описана в src/storage/platform.ts.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("polygraph", {
  vault: {
    root: () => ipcRenderer.invoke("vault:root"),
    choose: () => ipcRenderer.invoke("vault:choose"),
    reveal: () => ipcRenderer.invoke("vault:reveal"),
    list: (dir) => ipcRenderer.invoke("vault:list", dir),
    read: (p) => ipcRenderer.invoke("vault:read", p),
    write: (p, content) => ipcRenderer.invoke("vault:write", p, content),
    remove: (p) => ipcRenderer.invoke("vault:remove", p),
  },
  http: (req) => ipcRenderer.invoke("http:request", req),
  ticker: {
    open: () => ipcRenderer.invoke("ticker:open"),
    close: () => ipcRenderer.invoke("ticker:close"),
  },
  onVaultChanged: (fn) => {
    const handler = (_e, rel) => fn(rel);
    ipcRenderer.on("vault:changed", handler);
    return () => ipcRenderer.removeListener("vault:changed", handler);
  },
});
