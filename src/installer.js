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

// Builds the background process used to run installers without opening a terminal window.
function getScriptLaunchSpec(scriptPath, platform = process.platform) {
  const cwd = path.dirname(scriptPath);

  if (platform === "darwin") {
    return {
      command: "/bin/bash",
      args: [scriptPath],
      options: { cwd, windowsHide: true }
    };
  }

  if (platform === "win32") {
    const command = process.env.ComSpec || "cmd.exe";
    const escapedScriptPath = String(scriptPath).replace(/"/g, '""');
    return {
      command,
      args: ["/d", "/c", `"${escapedScriptPath}" --no-pause`],
      options: { cwd, windowsHide: true }
    };
  }

  throw new Error("Automatic script installation is only supported on macOS and Windows.");
}

// Converts process output chunks into complete log lines for the renderer.
function createLogStream(onLine) {
  let pending = "";

  return {
    push(chunk) {
      pending += chunk.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      lines.filter(Boolean).forEach(onLine);
    },
    flush() {
      if (pending) {
        onLine(pending);
        pending = "";
      }
    }
  };
}

// Runs a script installer in the background and forwards its output to the in-app logs.
async function launchScriptInstaller(scriptPath, onStatus = () => {}, platform = process.platform) {
  if (platform === "darwin") {
    await fs.chmod(scriptPath, 0o755);
  }

  const spec = getScriptLaunchSpec(scriptPath, platform);
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      ...spec.options,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = createLogStream((line) => {
      onStatus({ stage: "install", message: "Installing in background...", log: line, stream: "stdout" });
    });
    const stderr = createLogStream((line) => {
      onStatus({ stage: "install", message: "Installing in background...", log: line, stream: "stderr" });
    });
    let settled = false;

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      stdout.flush();
      stderr.flush();
      if (settled) {
        return;
      }

      settled = true;
      if (code === 0) {
        resolve({ launched: true, method: "background", exitCode: code });
        return;
      }

      reject(new Error(`Installer exited with code ${code}. Check the installation logs.`));
    });
  });
}

// Opens a file location in Finder or Explorer.
function revealInFileManager(filePath, shell) {
  shell.showItemInFolder(filePath);
}

// Opens a downloaded package with the operating system's associated installer application.
async function openManualInstaller(filePath, shell) {
  const errorMessage = await shell.openPath(filePath);
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return { launched: true, method: "system" };
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
    const installerName = path.basename(plan.file);
    onStatus({
      stage: "launch",
      message: `Running ${installerName} in background...`,
      log: `Running ${installerName} without a terminal window.`
    });
    const result = await launchScriptInstaller(plan.file, onStatus);
    return {
      action: "script",
      filePath: plan.file,
      message: "Installation completed.",
      ...result
    };
  }

  const manualPath = await copyManualInstaller(plan.file, product, release);
  onStatus({
    stage: "launch",
    message: `Opening ${path.basename(manualPath)}...`,
    log: `Opening ${path.basename(manualPath)} with the system installer.`
  });

  try {
    const result = await openManualInstaller(manualPath, shell);
    return {
      action: "manual",
      filePath: manualPath,
      message: "Installer opened. Complete the installation window, then refresh the product status.",
      ...result
    };
  } catch (error) {
    revealInFileManager(manualPath, shell);
    onStatus({
      stage: "launch",
      message: "Installer downloaded, but it could not be opened automatically.",
      log: `Automatic opening failed: ${error.message}`,
      stream: "stderr"
    });
    return {
      action: "manual",
      filePath: manualPath,
      launched: false,
      message: "Installer downloaded and revealed. Open it manually to continue."
    };
  }
}

module.exports = {
  copyManualInstaller,
  extractZipSafely,
  getCacheRoot,
  getManualDownloadRoot,
  getScriptLaunchSpec,
  installProductRelease,
  launchScriptInstaller,
  openManualInstaller,
  prepareReleaseFiles,
  revealInFileManager
};
