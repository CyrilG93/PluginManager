const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLocalProducts } = require("../src/catalog");

test("local catalog does not include Effect Analyzer", async () => {
  const products = await loadLocalProducts();

  assert.equal(products.some((product) => product.id === "premiere-effect-analyzer"), false);
});
