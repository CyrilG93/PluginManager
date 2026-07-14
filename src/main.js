const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { enableAdminMode, getAdminState } = require("./adminState");
const { getProductById, loadProducts } = require("./catalog");
const { getLatestBetaRelease, getLatestRelease } = require("./github");
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

// Converts a GitHub release into the compact shape consumed by the renderer.
function normalizeReleaseState(product, release) {
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

// Fetches stable and optional beta release state for one product.
async function getProductReleaseState(product, options = {}) {
  const release = await getLatestRelease(product);
  const releaseState = normalizeReleaseState(product, release);

  if (!options.includeBeta) {
    return releaseState;
  }

  const betaRelease = await getLatestBetaRelease(product);
  return {
    ...releaseState,
    beta: betaRelease ? normalizeReleaseState(product, betaRelease) : null
  };
}

// Sends progress updates to the renderer for one product action.
function sendProductProgress(productId, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("product-progress", { productId, ...payload });
  }
}

ipcMain.handle("products:list", async () => getProductsWithInstalledState());

ipcMain.handle("products:refresh", async (_event, productId, options = {}) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Unknown product.");
  }

  const adminState = await getAdminState(app.getPath("userData"));
  return getProductReleaseState(product, {
    includeBeta: Boolean(options.includeBeta && adminState.enabled)
  });
});

ipcMain.handle("products:install", async (_event, productId, channel = "stable") => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Unknown product.");
  }

  const adminState = await getAdminState(app.getPath("userData"));
  if (channel === "beta" && !adminState.enabled) {
    throw new Error("Admin mode is required for beta installs.");
  }

  const release = channel === "beta" ? await getLatestBetaRelease(product) : await getLatestRelease(product);
  if (!release) {
    throw new Error("No beta release is available for this product.");
  }

  const result = await installProductRelease(product, release, shell, (status) => {
    sendProductProgress(product.id, status);
  });
  const installed = await detectInstalledProduct(product);

  return {
    ...result,
    release: await getProductReleaseState(product, { includeBeta: adminState.enabled }),
    installed
  };
});

ipcMain.handle("products:open-release", async (_event, url) => {
  const adminState = await getAdminState(app.getPath("userData"));
  if (!adminState.enabled) {
    throw new Error("Admin mode is required to open release pages.");
  }

  if (!url || !String(url).startsWith("https://github.com/")) {
    throw new Error("Invalid release URL.");
  }

  await shell.openExternal(url);
  return true;
});

ipcMain.handle("admin:get-state", async () => getAdminState(app.getPath("userData")));

ipcMain.handle("admin:enable", async (_event, password) => enableAdminMode(app.getPath("userData"), password));

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
