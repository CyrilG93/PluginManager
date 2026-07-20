const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const projectRoot = path.resolve(__dirname, "..");
const packageConfig = require("../package.json");

// Reads the PNG header so packaging tests do not require an image-processing dependency.
function readPngSize(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  assert.deepEqual(header.subarray(0, 8), pngSignature);

  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test("packaging uses the CPT icon on macOS and Windows", () => {
  const iconPath = packageConfig.build.mac.icon;
  const absoluteIconPath = path.join(projectRoot, iconPath);

  assert.equal(packageConfig.build.win.icon, iconPath);
  assert.equal(fs.existsSync(absoluteIconPath), true);

  const size = readPngSize(absoluteIconPath);
  assert.equal(size.width, size.height);
  assert.ok(size.width >= 512);
});

test("packaging includes configured product banner assets", () => {
  const bannerPath = path.join(projectRoot, "assets", "AudioSeparatorBanner.jpg");

  assert.ok(packageConfig.build.files.includes("assets/**/*"));
  assert.equal(fs.existsSync(bannerPath), true);
});
