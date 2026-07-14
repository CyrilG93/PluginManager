const path = require("node:path");

const ARCHIVE_EXTENSIONS = [".zip"];
const MANUAL_EXTENSIONS = [".pkg", ".exe", ".ccx", ".zxp"];
const MAC_SCRIPT_EXTENSIONS = [".sh"];
const WINDOWS_SCRIPT_EXTENSIONS = [".bat", ".cmd", ".ps1"];

// Normalizes platform names so tests and Electron use the same decision path.
function normalizePlatform(platform = process.platform) {
  if (platform === "darwin") {
    return "macos";
  }

  if (platform === "win32") {
    return "windows";
  }

  return platform;
}

// Removes a leading v from GitHub tags before comparing or displaying versions.
function cleanVersion(version) {
  return String(version || "").replace(/^v/i, "");
}

// Classifies a release file by extension so install planning stays predictable.
function classifyFile(fileName) {
  const lowerName = fileName.toLowerCase();
  const extension = path.extname(lowerName);

  if (ARCHIVE_EXTENSIONS.includes(extension)) {
    return "archive";
  }

  if (MANUAL_EXTENSIONS.includes(extension)) {
    return "manual";
  }

  if ([...MAC_SCRIPT_EXTENSIONS, ...WINDOWS_SCRIPT_EXTENSIONS].includes(extension)) {
    return "script";
  }

  return "unknown";
}

// Checks whether a file looks useful for the current operating system.
function matchesPlatform(fileName, platform) {
  const normalized = normalizePlatform(platform);
  const lowerName = fileName.toLowerCase();

  if (normalized === "macos") {
    return !lowerName.includes("windows") && !lowerName.includes("win-") && !lowerName.includes("_win");
  }

  if (normalized === "windows") {
    return !lowerName.includes("macos") && !lowerName.includes("mac-") && !lowerName.includes("_mac");
  }

  return true;
}

// Gives platform-specific files a higher score without rejecting neutral names.
function platformScore(fileName, platform) {
  const normalized = normalizePlatform(platform);
  const lowerName = fileName.toLowerCase();

  if (normalized === "macos" && (lowerName.includes("macos") || lowerName.includes("mac-") || lowerName.includes("_mac"))) {
    return 5;
  }

  if (normalized === "windows" && (lowerName.includes("windows") || lowerName.includes("win-") || lowerName.includes("_win"))) {
    return 5;
  }

  return 1;
}

// Selects the best top-level release asset before any archive extraction occurs.
function selectReleaseAsset(product, assets, platform = process.platform) {
  const usefulAssets = assets.filter((asset) => matchesPlatform(asset.name, platform));
  const mode = product.installMode || "script";
  const scoredAssets = usefulAssets.map((asset) => ({
    asset,
    kind: classifyFile(asset.name),
    score: platformScore(asset.name, platform)
  }));

  const directManual = scoredAssets
    .filter((candidate) => candidate.kind === "manual")
    .sort((a, b) => b.score - a.score)[0];
  const directScript = scoredAssets
    .filter((candidate) => candidate.kind === "script")
    .sort((a, b) => b.score - a.score)[0];
  const archive = scoredAssets
    .filter((candidate) => candidate.kind === "archive")
    .sort((a, b) => b.score - a.score)[0];

  if (mode === "manual") {
    return directManual?.asset || archive?.asset || directScript?.asset || null;
  }

  return directScript?.asset || archive?.asset || directManual?.asset || null;
}

// Chooses the exact installer file after an archive has been extracted.
function planInstallFromFiles(product, files, platform = process.platform) {
  const normalized = normalizePlatform(platform);
  const scriptExtensions = normalized === "windows" ? WINDOWS_SCRIPT_EXTENSIONS : MAC_SCRIPT_EXTENSIONS;
  const mode = product.installMode || "script";
  const platformFiles = files.filter((file) => matchesPlatform(file, normalized));

  const scripts = platformFiles
    .filter((file) => scriptExtensions.includes(path.extname(file.toLowerCase())))
    .sort((a, b) => platformScore(b, normalized) - platformScore(a, normalized));
  const manualPackages = platformFiles
    .filter((file) => MANUAL_EXTENSIONS.includes(path.extname(file.toLowerCase())))
    .sort((a, b) => platformScore(b, normalized) - platformScore(a, normalized));

  if (mode === "manual") {
    const manualFile = manualPackages[0] || platformFiles.find((file) => classifyFile(file) === "archive");
    return manualFile ? { action: "manual", file: manualFile } : null;
  }

  if (scripts[0]) {
    return { action: "script", file: scripts[0] };
  }

  if (manualPackages[0]) {
    return { action: "manual", file: manualPackages[0] };
  }

  return null;
}

module.exports = {
  classifyFile,
  cleanVersion,
  normalizePlatform,
  planInstallFromFiles,
  selectReleaseAsset
};
