const { contextBridge, ipcRenderer } = require("electron");

// Exposes a small, explicit API to the renderer without enabling Node in the UI.
contextBridge.exposeInMainWorld("pluginManager", {
  listProducts: () => ipcRenderer.invoke("products:list"),
  refreshProduct: (productId, options) => ipcRenderer.invoke("products:refresh", productId, options),
  installProduct: (productId, channel) => ipcRenderer.invoke("products:install", productId, channel),
  openRelease: (url) => ipcRenderer.invoke("products:open-release", url),
  getAdminState: () => ipcRenderer.invoke("admin:get-state"),
  enableAdmin: (password) => ipcRenderer.invoke("admin:enable", password),
  onProductProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("product-progress", listener);

    return () => ipcRenderer.removeListener("product-progress", listener);
  }
});
