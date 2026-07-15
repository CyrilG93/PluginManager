const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  getScriptLaunchSpec,
  launchScriptInstaller,
  openManualInstaller
} = require("../src/installer");

// Creates a harmless native installer used to verify background output capture on each CI platform.
async function createTestInstaller(root, unixBody, windowsBody) {
  const isWindows = process.platform === "win32";
  const scriptPath = path.join(root, isWindows ? "test-installer.bat" : "test-installer.sh");
  const contents = isWindows ? `@echo off\r\n${windowsBody}\r\n` : `#!/bin/bash\n${unixBody}\n`;
  await fs.writeFile(scriptPath, contents, "utf8");
  return scriptPath;
}

// Adds captured child output to test failures so Windows command parsing remains diagnosable in CI.
async function launchTestInstaller(scriptPath, statuses) {
  try {
    return await launchScriptInstaller(scriptPath, (status) => statuses.push(status));
  } catch (error) {
    const output = statuses.map((status) => `${status.stream}: ${status.log}`).join(" | ");
    error.message = `${error.message} Captured output: ${output || "none"}`;
    throw error;
  }
}

test("getScriptLaunchSpec hides Windows installers and disables pauses", () => {
  const scriptPath = "C:\\Temp\\Plugin Installer\\install-windows.bat";
  const spec = getScriptLaunchSpec(scriptPath, "win32");

  assert.equal(spec.options.windowsHide, true);
  assert.deepEqual(spec.args.slice(0, 2), ["/d", "/c"]);
  assert.equal(spec.args[2], scriptPath);
  assert.equal(spec.args[3], "--no-pause");
});

test("launchScriptInstaller captures stdout and stderr without a terminal", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-background-installer-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scriptPath = await createTestInstaller(
    root,
    "echo installed-output\necho installed-warning >&2",
    "echo installed-output\necho installed-warning 1>&2"
  );
  const statuses = [];

  const result = await launchTestInstaller(scriptPath, statuses);

  assert.equal(result.method, "background");
  assert.equal(result.exitCode, 0);
  assert.ok(statuses.some((status) => status.log === "installed-output" && status.stream === "stdout"));
  assert.ok(statuses.some((status) => status.log === "installed-warning" && status.stream === "stderr"));
});

test("launchScriptInstaller reports non-zero installer exits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-failed-installer-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scriptPath = await createTestInstaller(
    root,
    "echo failed >&2\nexit 7",
    "echo failed 1>&2\nexit /b 7"
  );
  const statuses = [];

  await assert.rejects(
    launchTestInstaller(scriptPath, statuses),
    /code 7/
  );
});

test("openManualInstaller launches packages through Electron shell", async () => {
  const openedPaths = [];
  const shell = {
    // Simulates Electron returning an empty error string after a successful launch.
    openPath: async (filePath) => {
      openedPaths.push(filePath);
      return "";
    }
  };

  const result = await openManualInstaller("/tmp/Plugin.pkg", shell);

  assert.deepEqual(openedPaths, ["/tmp/Plugin.pkg"]);
  assert.deepEqual(result, { launched: true, method: "system" });
});

test("openManualInstaller surfaces Electron launch errors", async () => {
  const shell = {
    // Simulates a missing file association reported by Electron.
    openPath: async () => "No application is associated with this file."
  };

  await assert.rejects(
    openManualInstaller("/tmp/Plugin.ccx", shell),
    /No application is associated/
  );
});
