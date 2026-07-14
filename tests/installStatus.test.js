const test = require("node:test");
const assert = require("node:assert/strict");
const { selectBestInstalledMatch } = require("../src/installStatus");

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
