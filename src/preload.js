const { contextBridge, ipcRenderer } = require("electron");

// Exposes a small, explicit API to the renderer without enabling Node in the UI.
contextBridge.exposeInMainWorld("pluginManager", {
  listProducts: () => ipcRenderer.invoke("products:list"),
  refreshProduct: (productId, options) => ipcRenderer.invoke("products:refresh", productId, options),
  installProduct: (productId, channel) => ipcRenderer.invoke("products:install", productId, channel),
  uninstallProduct: (productId) => ipcRenderer.invoke("products:uninstall", productId),
  openProductReadme: (productId) => ipcRenderer.invoke("products:open-readme", productId),
  checkAppUpdate: () => ipcRenderer.invoke("app:update:check"),
  installAppUpdate: () => ipcRenderer.invoke("app:update:install"),
  getAdminState: () => ipcRenderer.invoke("admin:get-state"),
  enableAdmin: (password) => ipcRenderer.invoke("admin:enable", password),
  disableAdmin: () => ipcRenderer.invoke("admin:disable"),
  onAppUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app-update-progress", listener);

    return () => ipcRenderer.removeListener("app-update-progress", listener);
  },
  onProductProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("product-progress", listener);

    return () => ipcRenderer.removeListener("product-progress", listener);
  }
});
