const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyFile,
  cleanVersion,
  compareVersions,
  planInstallFromFiles,
  selectReleaseAsset
} = require("../src/releasePlanner");

const scriptProduct = {
  id: "simple-plugin",
  installMode: "script"
};

const manualProduct = {
  id: "runtime-plugin",
  installMode: "manual"
};

test("classifyFile detects supported release file types", () => {
  assert.equal(classifyFile("Plugin.zip"), "archive");
  assert.equal(classifyFile("Plugin.pkg"), "manual");
  assert.equal(classifyFile("Plugin.exe"), "manual");
  assert.equal(classifyFile("Plugin.ccx"), "manual");
  assert.equal(classifyFile("install-windows.bat"), "script");
  assert.equal(classifyFile("install-macos.sh"), "script");
});

test("cleanVersion removes the GitHub v prefix", () => {
  assert.equal(cleanVersion("v1.2.3"), "1.2.3");
  assert.equal(cleanVersion("1.2.3"), "1.2.3");
});

test("compareVersions compares dotted versions", () => {
  assert.equal(compareVersions("1.2.0", "1.2.1"), -1);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("v2.0.0-beta.1", "2.0.0"), 1);
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
});

test("selectReleaseAsset prefers script releases for script products", () => {
  const asset = selectReleaseAsset(scriptProduct, [
    { name: "Plugin-1.0.0.pkg" },
    { name: "Plugin-1.0.0-install.zip" },
    { name: "install-macos.sh" }
  ], "darwin");

  assert.equal(asset.name, "install-macos.sh");
});

test("selectReleaseAsset prefers manual packages for manual products", () => {
  const asset = selectReleaseAsset(manualProduct, [
    { name: "Plugin-1.0.0-install.zip" },
    { name: "Plugin-1.0.0-macOS-Installer-arm64.pkg" }
  ], "darwin");

  assert.equal(asset.name, "Plugin-1.0.0-macOS-Installer-arm64.pkg");
});

test("selectReleaseAsset falls back to zip archives when packages are not direct assets", () => {
  const asset = selectReleaseAsset(manualProduct, [
    { name: "Plugin-1.0.0.zip" }
  ], "win32");

  assert.equal(asset.name, "Plugin-1.0.0.zip");
});

test("planInstallFromFiles selects macOS shell scripts for script products", () => {
  const plan = planInstallFromFiles(scriptProduct, [
    "/tmp/release/install-windows.bat",
    "/tmp/release/install-macos.sh"
  ], "darwin");

  assert.deepEqual(plan, {
    action: "script",
    file: "/tmp/release/install-macos.sh"
  });
});

test("planInstallFromFiles selects Windows batch scripts for script products", () => {
  const plan = planInstallFromFiles(scriptProduct, [
    "C:\\release\\install-macos.sh",
    "C:\\release\\install-windows.bat"
  ], "win32");

  assert.deepEqual(plan, {
    action: "script",
    file: "C:\\release\\install-windows.bat"
  });
});

test("planInstallFromFiles selects manual packages for manual products", () => {
  const plan = planInstallFromFiles(manualProduct, [
    "/tmp/release/install-macos.sh",
    "/tmp/release/Plugin-1.0.0-macOS-Installer.pkg"
  ], "darwin");

  assert.deepEqual(plan, {
    action: "manual",
    file: "/tmp/release/Plugin-1.0.0-macOS-Installer.pkg"
  });
});
