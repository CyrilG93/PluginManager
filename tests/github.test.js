const test = require("node:test");
const assert = require("node:assert/strict");
const { isBetaRelease } = require("../src/github");

test("isBetaRelease only accepts GitHub prereleases", () => {
  assert.equal(isBetaRelease({ prerelease: true, draft: false }), true);
  assert.equal(isBetaRelease({ prerelease: false, draft: false, tagName: "v1.0.0-beta.1" }), false);
  assert.equal(isBetaRelease({ prerelease: true, draft: true }), false);
});
