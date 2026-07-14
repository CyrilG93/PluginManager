const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Readable } = require("node:stream");

const GITHUB_API_BASE = "https://api.github.com";
const USER_AGENT = "CyrilPluginManager/0.1";

// Returns the optional GitHub token used for private release testing.
function getGitHubToken() {
  return process.env.CYRIL_PLUGIN_MANAGER_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
}

// Builds the headers expected by GitHub API and private asset download routes.
function buildGitHubHeaders(extraHeaders = {}) {
  const token = getGitHubToken();
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extraHeaders
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

// Calls a local gh command and returns stdout for authenticated fallback access.
async function ghApi(endpoint, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["api", endpoint, ...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }

      reject(new Error(Buffer.concat(stderr).toString("utf8") || `gh api exited with ${code}`));
    });
  });
}

// Calls the GitHub REST API and falls back to gh when local TLS blocks fetch.
async function githubJson(endpoint) {
  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
    headers: buildGitHubHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body || response.statusText}`);
  }

  return response.json();
}

// Reads JSON through fetch first and gh CLI second for private/local dev repos.
async function githubJsonWithFallback(endpoint) {
  try {
    return await githubJson(endpoint);
  } catch (fetchError) {
    try {
      const rawJson = await ghApi(endpoint);
      return JSON.parse(rawJson);
    } catch (_ghError) {
      throw fetchError;
    }
  }
}

// Fetches the latest release metadata for a configured product repository.
async function getLatestRelease(product) {
  const release = await githubJsonWithFallback(`/repos/${product.repository}/releases/latest`);
  return {
    id: release.id,
    tagName: release.tag_name,
    name: release.name || release.tag_name,
    htmlUrl: release.html_url,
    publishedAt: release.published_at,
    assets: (release.assets || []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
      url: asset.url,
      browserDownloadUrl: asset.browser_download_url
    }))
  };
}

// Downloads an asset with gh when fetch cannot use the local TLS chain.
async function downloadAssetWithGh(asset, destinationPath) {
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  const endpoint = new URL(asset.url).pathname.replace(/^\/+/, "");

  await new Promise((resolve, reject) => {
    const child = spawn("gh", ["api", endpoint, "-H", "Accept: application/octet-stream"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const fileStream = fs.createWriteStream(destinationPath);
    const stderr = [];
    let childClosed = false;
    let fileFinished = false;

    const finishIfDone = () => {
      if (childClosed && fileFinished) {
        resolve();
      }
    };

    child.stdout.pipe(fileStream);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    fileStream.on("error", reject);
    fileStream.on("finish", () => {
      fileFinished = true;
      finishIfDone();
    });
    child.on("close", (code) => {
      if (code === 0) {
        childClosed = true;
        finishIfDone();
        return;
      }

      reject(new Error(Buffer.concat(stderr).toString("utf8") || `gh download exited with ${code}`));
    });
  });

  return destinationPath;
}

// Downloads a release asset while reporting progress to the provided callback.
async function downloadAssetWithFetch(asset, destinationPath, onProgress = () => {}) {
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

  const hasToken = Boolean(getGitHubToken());
  const url = hasToken ? asset.url : asset.browserDownloadUrl;
  const headers = hasToken
    ? buildGitHubHeaders({ "Accept": "application/octet-stream" })
    : { "User-Agent": USER_AGENT };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Download failed ${response.status}: ${body || response.statusText}`);
  }

  const total = Number(response.headers.get("content-length") || asset.size || 0);
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destinationPath);
    const bodyStream = typeof response.body.pipe === "function"
      ? response.body
      : Readable.fromWeb(response.body);

    bodyStream.on("data", (chunk) => {
      downloaded += chunk.length;
      onProgress({ downloaded, total });
    });

    bodyStream.on("error", reject);
    fileStream.on("error", reject);
    fileStream.on("finish", resolve);
    bodyStream.pipe(fileStream);
  });

  return destinationPath;
}

// Downloads through fetch first and gh CLI second for authenticated local repos.
async function downloadAsset(asset, destinationPath, onProgress = () => {}) {
  try {
    return await downloadAssetWithFetch(asset, destinationPath, onProgress);
  } catch (fetchError) {
    try {
      onProgress({ downloaded: 0, total: asset.size || 0, fallback: "gh" });
      return await downloadAssetWithGh(asset, destinationPath);
    } catch (_ghError) {
      throw fetchError;
    }
  }
}

module.exports = {
  downloadAsset,
  getGitHubToken,
  getLatestRelease
};
