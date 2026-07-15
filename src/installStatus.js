const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
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

// Lists the documented Adobe UPIA executables that can report managed UXP installs.
function getUpiaExecutableCandidates(platform = process.platform) {
  const normalized = normalizePlatform(platform);

  if (normalized === "macos") {
    return [
      "/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/macOS/UnifiedPluginInstallerAgent"
    ];
  }

  if (normalized === "windows") {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const relativePath = path.join(
      "Common Files",
      "Adobe",
      "Adobe Desktop Common",
      "RemoteComponents",
      "UPI",
      "UnifiedPluginInstallerAgent",
      "UnifiedPluginInstallerAgent.exe"
    );

    return [path.join(programFiles, relativePath), path.join(programFilesX86, relativePath)];
  }

  return [];
}

// Returns the first available UPIA executable without making detection depend on Adobe tooling.
async function findUpiaExecutable(platform = process.platform) {
  for (const candidate of getUpiaExecutableCandidates(platform)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch (_error) {
      // Continue through the documented Adobe installation locations.
    }
  }

  return null;
}

// Reads Adobe's managed plugin inventory as a fallback when no readable UXP folder is found.
async function listUpiaPlugins(platform = process.platform) {
  const normalized = normalizePlatform(platform);
  const executable = await findUpiaExecutable(platform);
  if (!executable) {
    return "";
  }

  const args = normalized === "windows" ? ["/list", "all"] : ["--list", "all"];
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.on("error", () => resolve(""));
    child.on("close", (code) => resolve(code === 0 ? Buffer.concat(stdout).toString("utf8") : ""));
  });
}

// Parses the fixed-column inventory printed by UPIA on macOS and Windows.
function parseUpiaPluginList(output) {
  const plugins = [];

  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(Enabled|Disabled)\s+(.+?)\s{2,}([0-9][0-9A-Za-z.+_-]*)\s*$/i);
    if (match) {
      plugins.push({
        status: match[1].toLowerCase(),
        name: match[2].trim(),
        version: match[3]
      });
    }
  }

  return plugins;
}

// Normalizes UPIA display names so catalog aliases remain case-insensitive.
function normalizeInstalledName(value) {
  return String(value || "").trim().toLowerCase();
}

// Selects the newest UPIA entry matching a product's explicit display-name aliases.
function selectUpiaProductMatch(product, output) {
  const acceptedNames = new Set([
    product.name,
    ...(product.upiaNames || []),
    ...(product.bundleIds || [])
  ].map(normalizeInstalledName));
  const matches = parseUpiaPluginList(output)
    .filter((plugin) => acceptedNames.has(normalizeInstalledName(plugin.name)))
    .map((plugin) => ({
      installed: true,
      installedPath: null,
      installedVersion: plugin.version,
      installedSource: "upia"
    }));

  return selectBestInstalledMatch(matches);
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
    return String(right.installedPath || "").includes(os.homedir())
      - String(left.installedPath || "").includes(os.homedir());
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
async function detectInstalledProduct(product, platform = process.platform, options = {}) {
  const roots = options.roots || getAdobeExtensionRoots(platform);
  const matches = await findInstalledProductMatches(product, platform, roots);
  const bestMatch = selectBestInstalledMatch(matches);
  if (bestMatch?.installedVersion) {
    return bestMatch;
  }

  // Use Adobe's own inventory for UXP installs hidden behind Creative Cloud management.
  if (String(product.kind || "").toUpperCase() === "UXP" || product.upiaNames?.length) {
    const upiaOutput = Object.hasOwn(options, "upiaOutput")
      ? options.upiaOutput
      : await listUpiaPlugins(platform);
    const upiaMatch = selectUpiaProductMatch(product, upiaOutput);
    if (upiaMatch) {
      return upiaMatch;
    }
  }

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
  findUpiaExecutable,
  findInstalledProductMatches,
  getAdobeExtensionRoots,
  getUpiaExecutableCandidates,
  listUpiaPlugins,
  parseUpiaPluginList,
  selectBestInstalledMatch,
  selectUpiaProductMatch
};
