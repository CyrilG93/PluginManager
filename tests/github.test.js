const test = require("node:test");
const assert = require("node:assert/strict");
const { GitHubApiError, isBetaRelease } = require("../src/github");

test("isBetaRelease only accepts GitHub prereleases", () => {
  assert.equal(isBetaRelease({ prerelease: true, draft: false }), true);
  assert.equal(isBetaRelease({ prerelease: false, draft: false, tagName: "v1.0.0-beta.1" }), false);
  assert.equal(isBetaRelease({ prerelease: true, draft: true }), false);
});

test("GitHubApiError hides raw rate-limit payloads", () => {
  const response = {
    statusText: "Forbidden",
    headers: {
      get: () => ""
    }
  };
  const error = new GitHubApiError(403, "{\"message\":\"API rate limit exceeded\"}", response);

  assert.equal(error.status, 403);
  assert.match(error.message, /rate limit/);
  assert.doesNotMatch(error.message, /API rate limit exceeded/);
});

test("GitHubApiError explains missing public releases", () => {
  const response = {
    statusText: "Not Found",
    headers: {
      get: () => ""
    }
  };
  const error = new GitHubApiError(404, "{\"message\":\"Not Found\"}", response);

  assert.equal(error.status, 404);
  assert.match(error.message, /No public GitHub release/);
});
