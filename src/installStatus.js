const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { compareVersions, normalizePlatform } = require("./releasePlanner");

// Lists common Adobe extension folders for the current platform.
function getAdobeExtensionRoots(platform = process.platform) {
  const normalized = normalizePlatform(platform);
  const home = os.homedir();

  if (normalized === "macos") {
    return [
      "/Library/Application Support/Adobe/CEP/extensions",
      path.join(home, "Library", "Application Support", "Adobe", "CEP", "extensions"),
      "/Library/Application Support/Adobe/UXP/Plugins/External",
      path.join(home, "Library", "Application Support", "Adobe", "UXP", "Plugins", "External")
    ];
  }

  if (normalized === "windows") {
    const commonFilesX86 = process.env["CommonProgramFiles(x86)"] || "C:\\Program Files (x86)\\Common Files";
    const commonFiles = process.env.CommonProgramFiles || "C:\\Program Files\\Common Files";
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

    return [
      path.join(commonFilesX86, "Adobe", "CEP", "extensions"),
      path.join(commonFiles, "Adobe", "CEP", "extensions"),
      path.join(appData, "Adobe", "CEP", "extensions"),
      path.join(localAppData, "Adobe", "UXP", "Plugins", "External")
    ];
  }

  return [];
}

// Reads a file only when it exists so install detection can scan many paths.
async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

// Extracts a version from a CEP manifest, UXP manifest, or package metadata.
async function readInstalledVersion(extensionPath) {
  const cepManifest = await readOptionalFile(path.join(extensionPath, "CSXS", "manifest.xml"));
  const cepVersion = cepManifest.match(/ExtensionBundleVersion="([^"]+)"/i)?.[1];
  if (cepVersion) {
    return cepVersion;
  }

  const uxpManifest = await readOptionalFile(path.join(extensionPath, "manifest.json"));
  if (uxpManifest) {
    try {
      return JSON.parse(uxpManifest).version || null;
    } catch (_error) {
      return null;
    }
  }

  const packageJson = await readOptionalFile(path.join(extensionPath, "package.json"));
  if (packageJson) {
    try {
      return JSON.parse(packageJson).version || null;
    } catch (_error) {
      return null;
    }
  }

  return null;
}

// Checks whether an extension folder appears to match one of the product ids.
async function folderMatchesProduct(extensionPath, product) {
  const lowerBaseName = path.basename(extensionPath).toLowerCase();
  const bundleIds = product.bundleIds || [];

  if (bundleIds.some((bundleId) => lowerBaseName === bundleId.toLowerCase())) {
    return true;
  }

  const manifestText = [
    await readOptionalFile(path.join(extensionPath, "CSXS", "manifest.xml")),
    await readOptionalFile(path.join(extensionPath, "manifest.json"))
  ].join("\n");

  return bundleIds.some((bundleId) => manifestText.includes(bundleId));
}

// Selects the newest matching install when a plugin exists in several Adobe folders.
function selectBestInstalledMatch(matches) {
  return matches.sort((left, right) => {
    const versionComparison = compareVersions(right.installedVersion, left.installedVersion);
    if (versionComparison !== 0) {
      return versionComparison;
    }

    // Prefer user-level installs when versions tie because they usually override system copies.
    return right.installedPath.includes(os.homedir()) - left.installedPath.includes(os.homedir());
  })[0] || null;
}

// Finds every installed location that matches one product.
async function findInstalledProductMatches(product, platform = process.platform, roots = getAdobeExtensionRoots(platform)) {
  const matches = [];

  for (const root of roots) {
    let entries = [];
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const extensionPath = path.join(root, entry.name);
      if (await folderMatchesProduct(extensionPath, product)) {
        matches.push({
          installed: true,
          installedPath: extensionPath,
          installedVersion: await readInstalledVersion(extensionPath)
        });
      }
    }
  }

  return matches;
}

// Returns the newest installed location found for one product.
async function detectInstalledProduct(product, platform = process.platform) {
  const matches = await findInstalledProductMatches(product, platform);
  const bestMatch = selectBestInstalledMatch(matches);
  if (bestMatch) {
    return bestMatch;
  }

  return {
    installed: false,
    installedPath: null,
    installedVersion: null
  };
}

module.exports = {
  detectInstalledProduct,
  findInstalledProductMatches,
  getAdobeExtensionRoots,
  selectBestInstalledMatch
};
