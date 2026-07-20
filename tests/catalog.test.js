const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLocalProducts } = require("../src/catalog");

test("local catalog does not include Effect Analyzer", async () => {
  const products = await loadLocalProducts();

  assert.equal(products.some((product) => product.id === "premiere-effect-analyzer"), false);
});

test("Tool Bar installs automatically and exposes its Adobe UPIA name", async () => {
  const products = await loadLocalProducts();
  const toolBar = products.find((product) => product.id === "premiere-toolbar");

  assert.equal(toolBar.installMode, "script");
  assert.deepEqual(toolBar.upiaNames, ["Tool Bar"]);
});

test("File Manager exposes its public Readme page", async () => {
  const products = await loadLocalProducts();
  const fileManager = products.find((product) => product.id === "premiere-file-manager");

  assert.equal(fileManager.readmeUrl, "https://www.cyrilplugin.com/file-manager/readme");
});
