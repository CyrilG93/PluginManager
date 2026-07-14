const fs = require("node:fs/promises");
const path = require("node:path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "products.json");
const DEFAULT_REMOTE_CATALOG_URL = "https://raw.githubusercontent.com/CyrilG93/PluginManager/main/data/products.json";
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

// Loads the remote product catalog and falls back to the bundled catalog when offline.
async function loadProducts(options = {}) {
  if (productCache && !options.force) {
    return productCache;
  }

  try {
    const response = await fetch(getRemoteCatalogUrl(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "CyrilPluginManager/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Remote catalog ${response.status}`);
    }

    productCache = validateProducts(await response.json());
    return productCache;
  } catch (_error) {
    productCache = await loadLocalProducts();
    return productCache;
  }
}

// Finds one product from the active catalog by its stable internal id.
async function getProductById(productId) {
  const products = await loadProducts();
  return products.find((product) => product.id === productId) || null;
}

module.exports = {
  DEFAULT_REMOTE_CATALOG_URL,
  getProductById,
  loadLocalProducts,
  loadProducts
};
