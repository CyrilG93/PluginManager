const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { enableAdminMode, getAdminState } = require("../src/adminState");

test("enableAdminMode accepts the fixed admin password", async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-admin-"));

  assert.deepEqual(await getAdminState(userDataPath), {
    configured: true,
    enabled: false
  });

  assert.deepEqual(await enableAdminMode(userDataPath, "Extron"), {
    configured: true,
    enabled: true
  });
});

test("enableAdminMode rejects incorrect admin passwords", async () => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-admin-"));

  await assert.rejects(
    () => enableAdminMode(userDataPath, "wrong"),
    /Incorrect admin password/
  );
});
