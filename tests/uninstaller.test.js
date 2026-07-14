const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { uninstallProduct } = require("../src/uninstaller");

const product = {
  id: "example",
  name: "Example Plugin",
  bundleIds: ["com.example.plugin"]
};

// Creates a minimal CEP-like extension folder for uninstall tests.
async function createCepExtension(root, folderName, bundleId, version) {
  const extensionPath = path.join(root, folderName);
  await fs.mkdir(path.join(extensionPath, "CSXS"), { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "CSXS", "manifest.xml"),
    `<ExtensionManifest ExtensionBundleId="${bundleId}" ExtensionBundleVersion="${version}"></ExtensionManifest>`,
    "utf8"
  );
  return extensionPath;
}

test("uninstallProduct removes matching extension folders only", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-uninstall-"));
  const matchingPath = await createCepExtension(root, "com.example.plugin", "com.example.plugin", "1.0.0");
  const otherPath = await createCepExtension(root, "com.example.other", "com.example.other", "1.0.0");

  const result = await uninstallProduct(product, { roots: [root] });

  assert.deepEqual(result.removed, [matchingPath]);
  await assert.rejects(fs.stat(matchingPath));
  assert.ok(await fs.stat(otherPath));
  assert.deepEqual(result.installed, {
    installed: false,
    installedPath: null,
    installedVersion: null
  });
});
