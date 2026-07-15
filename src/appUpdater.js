const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { downloadAsset, getLatestRelease } = require("./github");
const { cleanVersion, compareVersions } = require("./releasePlanner");

const APP_PRODUCT = Object.freeze({
  id: "cyril-plugin-manager",
  name: "Cyril Plugin Manager",
  repository: "CyrilG93/PluginManager"
});

// Selects only the installer architecture currently published for each supported platform.
function selectAppUpdateAsset(release, platform = process.platform, arch = process.arch) {
  const assets = release?.assets || [];

  if (platform === "darwin" && arch === "arm64") {
    return assets.find((asset) => asset.name.toLowerCase().endsWith("-mac-arm64.dmg")) || null;
  }

  if (platform === "win32" && arch === "x64") {
    return assets.find((asset) => asset.name.toLowerCase().endsWith("-win-x64.exe")) || null;
  }

  return null;
}

// Compares the running app with the latest stable GitHub release.
async function checkForAppUpdate(currentVersion, options = {}) {
  const getRelease = options.getRelease || getLatestRelease;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const release = await getRelease(APP_PRODUCT);
  const latestVersion = cleanVersion(release.tagName);
  const installedVersion = cleanVersion(currentVersion);
  const available = compareVersions(installedVersion, latestVersion) < 0;
  const asset = selectAppUpdateAsset(release, platform, arch);

  return {
    currentVersion: installedVersion,
    latestVersion,
    available,
    supported: Boolean(asset),
    releaseUrl: release.htmlUrl,
    assetName: asset?.name || null,
    release,
    asset
  };
}

// Removes private download metadata before returning update state to the renderer.
function toPublicAppUpdateState(update) {
  return {
    currentVersion: update.currentVersion,
    latestVersion: update.latestVersion,
    available: update.available,
    supported: update.supported,
    releaseUrl: update.releaseUrl,
    assetName: update.assetName
  };
}

// Calculates a streaming SHA-256 digest without loading a large installer into memory.
async function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Verifies the GitHub-provided asset digest when the release exposes one.
async function verifyAssetDigest(filePath, digest) {
  if (!digest || !digest.toLowerCase().startsWith("sha256:")) {
    return false;
  }

  const expected = digest.slice("sha256:".length).toLowerCase();
  const actual = await calculateSha256(filePath);
  if (actual !== expected) {
    throw new Error("The downloaded update failed its SHA-256 integrity check.");
  }

  return true;
}

// Downloads the selected installer and opens it with the operating system.
async function downloadAndOpenAppUpdate(update, electronShell, onProgress = () => {}, options = {}) {
  if (!update?.available) {
    throw new Error("No newer Plugin Manager release is available.");
  }

  if (!update.asset) {
    throw new Error("The latest release has no compatible installer for this computer.");
  }

  const downloadReleaseAsset = options.downloadAsset || downloadAsset;
  const downloadRoot = options.downloadRoot || path.join(
    os.homedir(),
    "Downloads",
    "Cyril Plugin Manager",
    "App Updates"
  );
  const targetDir = path.join(downloadRoot, update.latestVersion);
  const targetPath = path.join(targetDir, path.basename(update.asset.name));

  await fsp.mkdir(targetDir, { recursive: true });
  await downloadReleaseAsset(update.asset, targetPath, onProgress);

  try {
    await verifyAssetDigest(targetPath, update.asset.digest);
  } catch (error) {
    await fsp.unlink(targetPath).catch(() => {});
    throw error;
  }

  const errorMessage = await electronShell.openPath(targetPath);
  if (errorMessage) {
    electronShell.showItemInFolder(targetPath);
    return {
      launched: false,
      filePath: targetPath,
      message: "Update downloaded, but it could not be opened automatically. Open it from the revealed folder."
    };
  }

  return {
    launched: true,
    filePath: targetPath,
    message: "Update installer opened. Close Plugin Manager before replacing or reinstalling the app."
  };
}

module.exports = {
  APP_PRODUCT,
  calculateSha256,
  checkForAppUpdate,
  downloadAndOpenAppUpdate,
  selectAppUpdateAsset,
  toPublicAppUpdateState,
  verifyAssetDigest
};
