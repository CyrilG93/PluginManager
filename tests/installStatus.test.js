const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  detectInstalledProduct,
  findInstalledProductMatches,
  parseUpiaPluginList,
  selectBestInstalledMatch,
  selectUpiaProductMatch
} = require("../src/installStatus");

// Creates the versioned folder shape produced by a packaged UXP installation.
async function createUxpExtension(root, folderName, bundleId, version) {
  const extensionPath = path.join(root, folderName);
  await fs.mkdir(extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "manifest.json"),
    JSON.stringify({ id: bundleId, version }),
    "utf8"
  );
  return extensionPath;
}

test("selectBestInstalledMatch returns the newest installed version", () => {
  const match = selectBestInstalledMatch([
    {
      installed: true,
      installedPath: "/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator",
      installedVersion: "2.4.0"
    },
    {
      installed: true,
      installedPath: "/Users/test/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator",
      installedVersion: "2.4.7"
    }
  ]);

  assert.equal(match.installedVersion, "2.4.7");
});

test("selectBestInstalledMatch prefers user installs when versions tie", () => {
  const home = process.env.HOME;
  const match = selectBestInstalledMatch([
    {
      installed: true,
      installedPath: "/Library/Application Support/Adobe/CEP/extensions/com.example.plugin",
      installedVersion: "1.0.0"
    },
    {
      installed: true,
      installedPath: `${home}/Library/Application Support/Adobe/CEP/extensions/com.example.plugin`,
      installedVersion: "1.0.0"
    }
  ]);

  assert.ok(match.installedPath.startsWith(home));
});

test("findInstalledProductMatches detects versioned Tool Bar UXP folders", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-uxp-detection-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const extensionPath = await createUxpExtension(
    root,
    "com.cyrilplugin.toolbar_1.1.5",
    "com.cyrilplugin.toolbar",
    "1.1.5"
  );
  const product = {
    id: "premiere-toolbar",
    kind: "UXP",
    bundleIds: ["com.cyrilplugin.toolbar"]
  };

  const matches = await findInstalledProductMatches(product, "darwin", [root]);

  assert.deepEqual(matches, [{
    installed: true,
    installedPath: extensionPath,
    installedVersion: "1.1.5"
  }]);
});

test("parseUpiaPluginList reads Adobe managed plugin names and versions", () => {
  const output = `
 Status                        Extension Name                         Version
=========  =======================================================  ==========
 Enabled    SafeFrame                                                    1.1.0
 Enabled    Tool Bar                                                     1.1.5
`;

  assert.deepEqual(parseUpiaPluginList(output), [
    { status: "enabled", name: "SafeFrame", version: "1.1.0" },
    { status: "enabled", name: "Tool Bar", version: "1.1.5" }
  ]);
});

test("selectUpiaProductMatch uses Tool Bar's Adobe display-name alias", () => {
  const output = " Enabled    Tool Bar                                                     1.1.5";
  const match = selectUpiaProductMatch({
    name: "Premiere Tool Bar",
    upiaNames: ["Tool Bar"],
    bundleIds: ["com.cyrilplugin.toolbar"]
  }, output);

  assert.deepEqual(match, {
    installed: true,
    installedPath: null,
    installedVersion: "1.1.5",
    installedSource: "upia"
  });
});

test("detectInstalledProduct falls back to UPIA for managed UXP installs", async () => {
  const product = {
    name: "Premiere Tool Bar",
    kind: "UXP",
    upiaNames: ["Tool Bar"],
    bundleIds: ["com.cyrilplugin.toolbar"]
  };
  const output = " Enabled    Tool Bar                                                     1.1.5";

  const installed = await detectInstalledProduct(product, "darwin", {
    roots: [],
    upiaOutput: output
  });

  assert.equal(installed.installedVersion, "1.1.5");
  assert.equal(installed.installedSource, "upia");
});
