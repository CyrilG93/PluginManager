const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const AdmZip = require("adm-zip");
const { downloadAsset } = require("./github");
const { classifyFile, cleanVersion, planInstallFromFiles, selectReleaseAsset } = require("./releasePlanner");

// Creates a filesystem-safe folder name for product release staging.
function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

// Returns the app cache directory used for downloaded release assets.
function getCacheRoot() {
  return path.join(os.homedir(), ".cyril-plugin-manager", "cache");
}

// Returns the user-visible download folder used for manual installer files.
function getManualDownloadRoot() {
  return path.join(os.homedir(), "Downloads", "Cyril Plugin Manager");
}

// Quotes a shell argument for macOS Terminal commands.
function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

// Hashes a short value so repeated installs do not collide in the cache.
function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

// Recursively lists files inside an extracted release directory.
async function listFiles(rootDir) {
  const files = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

// Extracts a zip archive while preventing entries from escaping the target folder.
async function extractZipSafely(zipPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const zip = new AdmZip(zipPath);

  for (const entry of zip.getEntries()) {
    const destinationPath = path.resolve(outputDir, entry.entryName);
    const safeRoot = path.resolve(outputDir);

    if (!destinationPath.startsWith(`${safeRoot}${path.sep}`) && destinationPath !== safeRoot) {
      throw new Error(`Unsafe zip entry blocked: ${entry.entryName}`);
    }

    if (entry.isDirectory) {
      await fs.mkdir(destinationPath, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.writeFile(destinationPath, entry.getData());
    }
  }

  return outputDir;
}

// Copies a manual installer into Downloads so the user can inspect and run it.
async function copyManualInstaller(filePath, product, release) {
  const targetDir = path.join(getManualDownloadRoot(), safeName(product.name), cleanVersion(release.tagName));
  const targetPath = path.join(targetDir, path.basename(filePath));

  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(filePath, targetPath);

  return targetPath;
}

// Launches a script installer in a visible terminal or command prompt.
async function launchScriptInstaller(scriptPath) {
  const platform = process.platform;
  const cwd = path.dirname(scriptPath);

  if (platform === "darwin") {
    await fs.chmod(scriptPath, 0o755);
    const command = `cd ${shellQuote(cwd)} && /bin/bash ${shellQuote(scriptPath)}`;
    spawn("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(command)}`], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return { launched: true, method: "terminal" };
  }

  if (platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", scriptPath], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }).unref();
    return { launched: true, method: "cmd" };
  }

  throw new Error("Automatic script installation is only supported on macOS and Windows.");
}

// Opens a file location in Finder or Explorer.
function revealInFileManager(filePath, shell) {
  shell.showItemInFolder(filePath);
}

// Downloads one release asset and returns either the file or extracted release files.
async function prepareReleaseFiles(product, release, asset, onProgress) {
  const cacheDir = path.join(
    getCacheRoot(),
    safeName(product.id),
    `${cleanVersion(release.tagName)}-${shortHash(asset.name)}`
  );
  const downloadPath = path.join(cacheDir, asset.name);

  await fs.mkdir(cacheDir, { recursive: true });
  await downloadAsset(asset, downloadPath, onProgress);

  if (classifyFile(asset.name) !== "archive") {
    return {
      downloadedAssetPath: downloadPath,
      files: [downloadPath]
    };
  }

  const extractDir = path.join(cacheDir, "extracted");
  await extractZipSafely(downloadPath, extractDir);

  return {
    downloadedAssetPath: downloadPath,
    files: await listFiles(extractDir)
  };
}

// Plans, downloads and launches or reveals the installer for a product release.
async function installProductRelease(product, release, shell, onStatus = () => {}) {
  const asset = selectReleaseAsset(product, release.assets, process.platform);
  if (!asset) {
    throw new Error("No compatible release asset was found for this platform.");
  }

  onStatus({ stage: "download", message: `Downloading ${asset.name}` });
  const prepared = await prepareReleaseFiles(product, release, asset, (progress) => {
    onStatus({ stage: "download", message: `Downloading ${asset.name}`, progress });
  });

  const plan = planInstallFromFiles(product, prepared.files, process.platform);
  if (!plan) {
    const manualPath = await copyManualInstaller(prepared.downloadedAssetPath, product, release);
    revealInFileManager(manualPath, shell);
    return {
      action: "manual",
      filePath: manualPath,
      message: "Release downloaded. No platform installer was detected inside it."
    };
  }

  if (plan.action === "script") {
    onStatus({ stage: "launch", message: `Launching ${path.basename(plan.file)}` });
    const result = await launchScriptInstaller(plan.file);
    return {
      action: "script",
      filePath: plan.file,
      message: "Installer script launched.",
      ...result
    };
  }

  const manualPath = await copyManualInstaller(plan.file, product, release);
  revealInFileManager(manualPath, shell);
  return {
    action: "manual",
    filePath: manualPath,
    message: "Installer downloaded. Open it manually to continue."
  };
}

module.exports = {
  copyManualInstaller,
  extractZipSafely,
  getCacheRoot,
  getManualDownloadRoot,
  installProductRelease,
  launchScriptInstaller,
  prepareReleaseFiles,
  revealInFileManager
};
