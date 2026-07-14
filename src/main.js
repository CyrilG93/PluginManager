const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { getProductById, loadProducts } = require("./catalog");
const { getLatestRelease } = require("./github");
const { detectInstalledProduct } = require("./installStatus");
const { installProductRelease } = require("./installer");
const { cleanVersion, selectReleaseAsset } = require("./releasePlanner");

let mainWindow = null;

// Creates the main product manager window.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    title: "Cyril Plugin Manager",
    backgroundColor: "#202124",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// Loads local product state without requiring network access.
async function getProductsWithInstalledState() {
  const products = await loadProducts();
  return Promise.all(products.map(async (product) => ({
    ...product,
    installed: await detectInstalledProduct(product)
  })));
}

// Fetches latest GitHub release state for one product.
async function getProductReleaseState(product) {
  const release = await getLatestRelease(product);
  const selectedAsset = selectReleaseAsset(product, release.assets, process.platform);

  return {
    tagName: release.tagName,
    version: cleanVersion(release.tagName),
    name: release.name,
    publishedAt: release.publishedAt,
    htmlUrl: release.htmlUrl,
    assets: release.assets,
    selectedAssetName: selectedAsset?.name || null
  };
}

// Sends progress updates to the renderer for one product action.
function sendProductProgress(productId, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("product-progress", { productId, ...payload });
  }
}

ipcMain.handle("products:list", async () => getProductsWithInstalledState());

ipcMain.handle("products:refresh", async (_event, productId) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Unknown product.");
  }

  return getProductReleaseState(product);
});

ipcMain.handle("products:install", async (_event, productId) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Unknown product.");
  }

  const release = await getLatestRelease(product);
  const result = await installProductRelease(product, release, shell, (status) => {
    sendProductProgress(product.id, status);
  });
  const installed = await detectInstalledProduct(product);

  return {
    ...result,
    release: await getProductReleaseState(product),
    installed
  };
});

ipcMain.handle("products:open-release", async (_event, url) => {
  if (!url || !String(url).startsWith("https://github.com/")) {
    throw new Error("Invalid release URL.");
  }

  await shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
