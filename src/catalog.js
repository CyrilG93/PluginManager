const fs = require("node:fs/promises");
const path = require("node:path");
const { githubJsonWithFallback } = require("./github");

const CATALOG_PATH = path.join(__dirname, "..", "data", "products.json");
const DEFAULT_REMOTE_CATALOG_URL = "https://raw.githubusercontent.com/CyrilG93/PluginManager/main/data/products.json";
const GITHUB_CATALOG_ENDPOINT = "/repos/CyrilG93/PluginManager/contents/data/products.json?ref=main";
let productCache = null;

// Returns the remote catalog URL so future product list changes do not require app reinstall.
function getRemoteCatalogUrl() {
  return process.env.CYRIL_PLUGIN_MANAGER_CATALOG_URL || DEFAULT_REMOTE_CATALOG_URL;
}

// Checks only the minimum shape needed before trusting a remote catalog file.
function validateProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("Product catalog must be a non-empty array.");
  }

  for (const product of products) {
    if (!product.id || !product.name || !product.repository || !Array.isArray(product.bundleIds)) {
      throw new Error("Product catalog contains an invalid product entry.");
    }
  }

  return products;
}

// Loads the local product catalog used by the manager UI and install planner.
async function loadLocalProducts() {
  const rawCatalog = await fs.readFile(CATALOG_PATH, "utf8");
  return validateProducts(JSON.parse(rawCatalog));
}

// Loads the GitHub raw catalog without reusing a stale HTTP cache entry.
async function loadRemoteProducts() {
  const response = await fetch(getRemoteCatalogUrl(), {
    cache: "no-store",
    headers: {
      "Accept": "application/json",
      "User-Agent": "CyrilPluginManager/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Remote catalog ${response.status}`);
  }

  return validateProducts(await response.json());
}

// Uses the authenticated GitHub API fallback when the raw catalog fetch is blocked locally.
async function loadRemoteProductsWithGitHubFallback() {
  const remoteFile = await githubJsonWithFallback(GITHUB_CATALOG_ENDPOINT);
  if (remoteFile.encoding !== "base64" || !remoteFile.content) {
    throw new Error("GitHub catalog content is unavailable.");
  }

  const catalogText = Buffer.from(remoteFile.content, "base64").toString("utf8");
  return validateProducts(JSON.parse(catalogText));
}

// Loads the remote product catalog and falls back to the bundled catalog when offline.
async function loadProducts(options = {}) {
  if (productCache && !options.force) {
    return productCache;
  }

  try {
    productCache = await loadRemoteProducts();
    return productCache;
  } catch (_rawCatalogError) {
    try {
      productCache = await loadRemoteProductsWithGitHubFallback();
      return productCache;
    } catch (_githubCatalogError) {
      productCache = await loadLocalProducts();
      return productCache;
    }
  }
}

// Finds one product from the active catalog by its stable internal id.
async function getProductById(productId, options = {}) {
  const products = await loadProducts(options);
  return products.find((product) => product.id === productId) || null;
}

module.exports = {
  DEFAULT_REMOTE_CATALOG_URL,
  getProductById,
  loadLocalProducts,
  loadRemoteProducts,
  loadRemoteProductsWithGitHubFallback,
  loadProducts
};
