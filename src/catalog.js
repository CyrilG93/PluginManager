const fs = require("node:fs/promises");
const path = require("node:path");

const CATALOG_PATH = path.join(__dirname, "..", "data", "products.json");

// Loads the local product catalog used by the manager UI and install planner.
async function loadProducts() {
  const rawCatalog = await fs.readFile(CATALOG_PATH, "utf8");
  return JSON.parse(rawCatalog);
}

// Finds one product from the local catalog by its stable internal id.
async function getProductById(productId) {
  const products = await loadProducts();
  return products.find((product) => product.id === productId) || null;
}

module.exports = {
  getProductById,
  loadProducts
};
