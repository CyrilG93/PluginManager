const fs = require("node:fs/promises");
const { findInstalledProductMatches, selectBestInstalledMatch } = require("./installStatus");

// Builds the normal empty install state returned after all copies are removed.
function createNotInstalledState() {
  return {
    installed: false,
    installedPath: null,
    installedVersion: null
  };
}

// Removes every detected Adobe extension folder for one product.
async function uninstallProduct(product, options = {}) {
  const matches = await findInstalledProductMatches(product, process.platform, options.roots);
  const removed = [];
  const failures = [];

  for (const match of matches) {
    try {
      await fs.rm(match.installedPath, { recursive: true, force: true });
      removed.push(match.installedPath);
    } catch (error) {
      failures.push(`${match.installedPath}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Could not uninstall every copy. ${failures.join(" | ")}`);
  }

  const remainingMatches = await findInstalledProductMatches(product, process.platform, options.roots);
  return {
    removed,
    installed: selectBestInstalledMatch(remainingMatches) || createNotInstalledState()
  };
}

module.exports = {
  uninstallProduct
};
