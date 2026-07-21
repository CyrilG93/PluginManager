const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { findInstalledProductMatches, getAdobeExtensionRoots, selectBestInstalledMatch } = require("./installStatus");

// Builds the normal empty install state returned after all copies are removed.
function createNotInstalledState() {
  return {
    installed: false,
    installedPath: null,
    installedVersion: null
  };
}

// Returns true when an error means a system-wide extension needs elevated rights.
function isPermissionError(error) {
  return error?.code === "EACCES" || error?.code === "EPERM";
}

// Identifies only Adobe system extension roots; user-level installs never trigger elevation.
function isSystemExtensionPath(extensionPath, platform) {
  const home = path.resolve(os.homedir());
  const resolvedPath = path.resolve(extensionPath);
  if (resolvedPath === home || resolvedPath.startsWith(`${home}${path.sep}`)) {
    return false;
  }

  return getAdobeExtensionRoots(platform)
    .filter((root) => !path.resolve(root).startsWith(`${home}${path.sep}`))
    .some((root) => resolvedPath.startsWith(`${path.resolve(root)}${path.sep}`));
}

// Waits for an elevated helper and exposes a useful error if the user cancels UAC/password entry.
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Administrator permission was declined or the extension is still in use."));
      }
    });
  });
}

// Removes a system copy using the platform's native elevation prompt after normal deletion is denied.
async function removeElevated(extensionPath, platform = process.platform) {
  if (platform === "win32") {
    const escapedPath = extensionPath.replace(/'/g, "''");
    const deleteCommand = `Remove-Item -LiteralPath '${escapedPath}' -Recurse -Force -ErrorAction Stop`;
    const launcherCommand = [
      "$child = Start-Process -FilePath 'powershell.exe'",
      `-ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${deleteCommand.replace(/'/g, "''").replace(/"/g, '\\"')}"'`,
      "-Verb RunAs -Wait -PassThru; exit $child.ExitCode"
    ].join(" ");
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", launcherCommand]);
    return;
  }

  if (platform === "darwin") {
    // Pass the path as an argument so AppleScript quotes it safely before invoking rm.
    await run("/usr/bin/osascript", [
      "-e",
      "on run argv\n do shell script \"/bin/rm -rf -- \" & quoted form of item 1 of argv with administrator privileges\nend run",
      extensionPath
    ]);
    return;
  }

  throw new Error("Elevated uninstall is only supported on macOS and Windows.");
}

// Removes every detected Adobe extension folder for one product.
async function uninstallProduct(product, options = {}) {
  const platform = options.platform || process.platform;
  const matches = await findInstalledProductMatches(product, platform, options.roots);
  const removed = [];
  const elevated = [];
  const failures = [];

  for (const match of matches) {
    try {
      await (options.remove || fs.rm)(match.installedPath, { recursive: true, force: true });
      removed.push(match.installedPath);
    } catch (error) {
      if (isPermissionError(error) && isSystemExtensionPath(match.installedPath, platform)) {
        try {
          await (options.removeElevated || removeElevated)(match.installedPath, platform);
          await fs.access(match.installedPath);
          failures.push(`${match.installedPath}: administrator removal did not complete.`);
        } catch (elevationError) {
          if (elevationError?.code === "ENOENT") {
            removed.push(match.installedPath);
            elevated.push(match.installedPath);
          } else {
            failures.push(`${match.installedPath}: ${elevationError.message}`);
          }
        }
      } else {
        failures.push(`${match.installedPath}: ${error.message}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Could not uninstall every copy. ${failures.join(" | ")}`);
  }

  const remainingMatches = await findInstalledProductMatches(product, platform, options.roots);
  return {
    removed,
    elevated,
    installed: selectBestInstalledMatch(remainingMatches) || createNotInstalledState()
  };
}

module.exports = {
  isPermissionError,
  isSystemExtensionPath,
  removeElevated,
  uninstallProduct
};
