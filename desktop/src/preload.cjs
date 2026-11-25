const { contextBridge, ipcRenderer } = require("electron");

const arcDesktop = Object.freeze({
  isDesktop: true,
  platform: process.platform,
  getStoredUser: () => ipcRenderer.invoke("desktop:get-user"),
  clearStoredSession: () => ipcRenderer.invoke("desktop:clear-session"),
  getVersion: () => ipcRenderer.invoke("desktop:get-version"),
  startOAuth: (provider) => ipcRenderer.invoke("desktop:start-oauth", provider),
  notify: (payload) => ipcRenderer.invoke("desktop:notify", payload),
  onAuthChanged: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, user) => callback(user);
    ipcRenderer.on("desktop:auth-changed", listener);
    return () => ipcRenderer.removeListener("desktop:auth-changed", listener);
  }
});

contextBridge.exposeInMainWorld("arcDesktop", arcDesktop);
