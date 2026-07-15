const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  checkForAppUpdate,
  downloadAndOpenAppUpdate,
  selectAppUpdateAsset,
  verifyAssetDigest
} = require("../src/appUpdater");

const release = {
  tagName: "v0.1.16",
  htmlUrl: "https://github.com/CyrilG93/PluginManager/releases/tag/v0.1.16",
  assets: [
    { name: "Cyril.Plugin.Manager-0.1.16-mac-arm64.dmg" },
    { name: "Cyril.Plugin.Manager-0.1.16-win-x64.exe" }
  ]
};

test("selectAppUpdateAsset chooses macOS ARM64 and Windows x64 installers", () => {
  assert.equal(
    selectAppUpdateAsset(release, "darwin", "arm64").name,
    "Cyril.Plugin.Manager-0.1.16-mac-arm64.dmg"
  );
  assert.equal(
    selectAppUpdateAsset(release, "win32", "x64").name,
    "Cyril.Plugin.Manager-0.1.16-win-x64.exe"
  );
  assert.equal(selectAppUpdateAsset(release, "darwin", "x64"), null);
});

test("checkForAppUpdate reports only newer stable versions", async () => {
  const options = {
    platform: "darwin",
    arch: "arm64",
    getRelease: async () => release
  };

  const update = await checkForAppUpdate("0.1.15", options);
  const current = await checkForAppUpdate("0.1.16", options);

  assert.equal(update.available, true);
  assert.equal(update.supported, true);
  assert.equal(update.latestVersion, "0.1.16");
  assert.equal(current.available, false);
});

test("verifyAssetDigest validates GitHub SHA-256 metadata", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-app-digest-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, "update.dmg");

  await fs.writeFile(filePath, "verified-update");

  assert.equal(
    await verifyAssetDigest(filePath, "sha256:0e826af2f816493def6c67e2abe35c36e1386c4fe550d2b85877150e9043d6fa"),
    true
  );
  await assert.rejects(
    verifyAssetDigest(filePath, `sha256:${"0".repeat(64)}`),
    /integrity check/
  );
});

test("downloadAndOpenAppUpdate downloads and launches the installer", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-app-update-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const opened = [];
  const update = {
    available: true,
    latestVersion: "0.1.16",
    asset: {
      name: "Cyril.Plugin.Manager-0.1.16-mac-arm64.dmg",
      digest: null
    }
  };
  const electronShell = {
    // Records the system-open request without launching a real installer during tests.
    openPath: async (filePath) => {
      opened.push(filePath);
      return "";
    },
    showItemInFolder: () => {}
  };

  const result = await downloadAndOpenAppUpdate(update, electronShell, () => {}, {
    downloadRoot: root,
    // Creates the deterministic downloaded file expected by the installer launcher.
    downloadAsset: async (_asset, destinationPath) => {
      await fs.writeFile(destinationPath, "installer");
    }
  });

  assert.equal(result.launched, true);
  assert.deepEqual(opened, [path.join(root, "0.1.16", update.asset.name)]);
});
