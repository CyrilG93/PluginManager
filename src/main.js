const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { disableAdminMode, enableAdminMode, getAdminState } = require("./adminState");
const { checkForAppUpdate, downloadAndOpenAppUpdate, toPublicAppUpdateState } = require("./appUpdater");
const { getProductById, loadProducts } = require("./catalog");
const { GitHubApiError, getLatestBetaRelease, getLatestRelease } = require("./github");
const { detectInstalledProduct } = require("./installStatus");
const { installProductRelease } = require("./installer");
const { cleanVersion, compareVersions, extractVersionFromAssetName, selectReleaseAsset } = require("./releasePlanner");
const { uninstallProduct } = require("./uninstaller");

let mainWindow = null;
const RELEASE_CACHE_TTL_MS = 15 * 60 * 1000;
const INSTALL_DETECTION_RETRIES = 12;
const INSTALL_DETECTION_DELAY_MS = 1000;
const releaseCache = new Map();
let appUpdateCache = null;

// Waits between post-install scans without blocking the Electron process.
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Creates the main product manager window.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    title: `Cyril Plugin Manager v${app.getVersion()}`,
    backgroundColor: "#202124",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Reapplies the versioned native title after the renderer document has loaded.
  mainWindow.webContents.once("did-finish-load", () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.setTitle(`Cyril Plugin Manager v${app.getVersion()}`);
    }
  });
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
  const assetVersion = extractVersionFromAssetName(selectedAsset?.name);

  return {
    tagName: release.tagName,
    // Beta packages can have different macOS and Windows versions under one GitHub tag.
    version: release.prerelease ? assetVersion || cleanVersion(release.tagName) : cleanVersion(release.tagName),
    name: release.name,
    publishedAt: release.publishedAt,
    htmlUrl: release.htmlUrl,
    assets: release.assets,
    selectedAssetName: selectedAsset?.name || null
  };
}

// Builds a stable empty state for products without a usable public release.
function createUnavailableReleaseState(reason) {
  return {
    tagName: null,
    version: null,
    name: null,
    publishedAt: null,
    htmlUrl: null,
    assets: [],
    selectedAssetName: null,
    unavailableReason: reason
  };
}

// Checks whether cached release data can be reused for refresh-free actions.
function isReleaseCacheFresh(entry) {
  return Boolean(entry && Date.now() - entry.fetchedAt < RELEASE_CACHE_TTL_MS);
}

// Fetches the stable release and turns missing releases into a non-blocking state.
async function fetchStableReleaseState(product) {
  try {
    const release = await getLatestRelease(product);
    return {
      release,
      state: normalizeReleaseState(product, release)
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return {
        release: null,
        state: createUnavailableReleaseState(error.message)
      };
    }

    throw error;
  }
}

// Fetches the latest admin beta release without treating a missing release as fatal.
async function fetchBetaReleaseState(product) {
  try {
    const release = await getLatestBetaRelease(product);
    return {
      release,
      state: release ? normalizeReleaseState(product, release) : null
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return {
        release: null,
        state: null
      };
    }

    throw error;
  }
}

// Fetches stable and optional beta release state for one product.
async function getProductReleaseState(product, options = {}) {
  const includeBeta = Boolean(options.includeBeta);
  const force = Boolean(options.force);
  let cached = releaseCache.get(product.id);

  if (force || !isReleaseCacheFresh(cached)) {
    const stable = await fetchStableReleaseState(product);
    cached = {
      fetchedAt: Date.now(),
      stableRelease: stable.release,
      stableState: stable.state,
      betaFetched: false,
      betaRelease: null,
      betaState: null
    };
    releaseCache.set(product.id, cached);
  }

  if (!includeBeta) {
    return cached.stableState;
  }

  if (force || !cached.betaFetched) {
    const beta = await fetchBetaReleaseState(product);
    cached.betaFetched = true;
    cached.betaRelease = beta.release;
    cached.betaState = beta.state;
  }

  return {
    ...cached.stableState,
    beta: cached.betaState
  };
}

// Returns the cached release object needed for downloads, fetching only when required.
async function getInstallRelease(product, channel, includeBeta) {
  await getProductReleaseState(product, { includeBeta });

  const cached = releaseCache.get(product.id);
  const release = channel === "beta" ? cached?.betaRelease : cached?.stableRelease;
  if (release) {
    return release;
  }

  throw new Error(channel === "beta"
    ? "No beta release is available for this product."
    : cached?.stableState?.unavailableReason || "No public GitHub release is available for this product.");
}

// Sends progress updates to the renderer for one product action.
function sendProductProgress(productId, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("product-progress", { productId, ...payload });
  }
}

// Sends application update download progress without mixing it into product logs.
function sendAppUpdateProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app-update-progress", payload);
  }
}

// Rechecks Adobe extension folders after a script installer has been launched.
async function detectInstalledProductAfterInstall(product, release, onStatus = () => {}) {
  const targetVersion = cleanVersion(release.tagName);
  let latestDetection = await detectInstalledProduct(product);

  for (let attempt = 0; attempt < INSTALL_DETECTION_RETRIES; attempt += 1) {
    if (
      latestDetection.installedVersion &&
      compareVersions(latestDetection.installedVersion, targetVersion) >= 0
    ) {
      return latestDetection;
    }

    onStatus({ stage: "detect", message: "Checking installed version..." });
    await delay(INSTALL_DETECTION_DELAY_MS);
    latestDetection = await detectInstalledProduct(product);
  }

  return latestDetection;
}

// Shows the target version when an automatic installer was launched but scanning lags behind.
function createOptimisticInstalledState(product, release, detected) {
  return {
    installed: true,
    installedPath: detected.installedPath,
    installedVersion: cleanVersion(release.tagName),
    pendingDetection: true,
    productId: product.id
  };
}

ipcMain.handle("products:list", async () => getProductsWithInstalledState());

ipcMain.handle("products:refresh", async (_event, productId, options = {}) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Unknown product.");
  }

  const adminState = await getAdminState(app.getPath("userData"));
  const [release, installed] = await Promise.all([
    getProductReleaseState(product, {
      includeBeta: Boolean(options.includeBeta && adminState.enabled),
      force: Boolean(options.force)
    }),
    detectInstalledProduct(product)
  ]);

  // Return both remote and local state so every refresh can correct stale installed versions.
  return { release, installed };
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

  const includeBeta = Boolean(adminState.enabled);
  const release = await getInstallRelease(product, channel, includeBeta);

  const result = await installProductRelease(product, release, shell, (status) => {
    sendProductProgress(product.id, status);
  });
  const detected = result.action === "script"
    ? await detectInstalledProductAfterInstall(product, release, (status) => sendProductProgress(product.id, status))
    : await detectInstalledProduct(product);
  const installed = result.action === "script" && compareVersions(detected.installedVersion, release.tagName) < 0
    ? createOptimisticInstalledState(product, release, detected)
    : detected;

  return {
    ...result,
    release: await getProductReleaseState(product, { includeBeta }),
    installed
  };
});

ipcMain.handle("products:uninstall", async (_event, productId) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Unknown product.");
  }

  const result = await uninstallProduct(product);
  releaseCache.delete(product.id);

  return {
    ...result,
    message: result.removed.length > 0 ? "Plugin uninstalled." : "No installed copy was detected."
  };
});

// Opens only configured HTTPS product documentation in the user's default browser.
ipcMain.handle("products:open-readme", async (_event, productId) => {
  // Refreshes the catalog so Readme URL fixes do not wait for an app restart.
  const product = await getProductById(productId, { force: true });
  if (!product?.readmeUrl) {
    throw new Error("No Readme page is available for this product yet.");
  }

  const readmeUrl = new URL(product.readmeUrl);
  if (readmeUrl.protocol !== "https:") {
    throw new Error("The configured Readme page must use HTTPS.");
  }

  await shell.openExternal(readmeUrl.toString());
  return { opened: true };
});

ipcMain.handle("admin:get-state", async () => getAdminState(app.getPath("userData")));

ipcMain.handle("admin:enable", async (_event, password) => enableAdminMode(app.getPath("userData"), password));

ipcMain.handle("admin:disable", async () => disableAdminMode(app.getPath("userData")));

ipcMain.handle("app:update:check", async () => {
  appUpdateCache = await checkForAppUpdate(app.getVersion());
  return toPublicAppUpdateState(appUpdateCache);
});

ipcMain.handle("app:update:install", async () => {
  if (!appUpdateCache?.available) {
    appUpdateCache = await checkForAppUpdate(app.getVersion());
  }

  return downloadAndOpenAppUpdate(appUpdateCache, shell, (progress) => {
    sendAppUpdateProgress({
      message: `Downloading ${appUpdateCache.assetName}`,
      progress
    });
  });
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
