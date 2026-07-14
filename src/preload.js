const { contextBridge, ipcRenderer } = require("electron");

// Exposes a small, explicit API to the renderer without enabling Node in the UI.
contextBridge.exposeInMainWorld("pluginManager", {
  listProducts: () => ipcRenderer.invoke("products:list"),
  refreshProduct: (productId) => ipcRenderer.invoke("products:refresh", productId),
  installProduct: (productId) => ipcRenderer.invoke("products:install", productId),
  openRelease: (url) => ipcRenderer.invoke("products:open-release", url),
  onProductProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("product-progress", listener);

    return () => ipcRenderer.removeListener("product-progress", listener);
  }
});
