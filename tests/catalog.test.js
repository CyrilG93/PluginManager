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

test("every catalog product exposes its public Readme page", async () => {
  const products = await loadLocalProducts();

  assert.ok(products.every((product) => product.readmeUrl?.startsWith("https://www.cyrilplugin.com/")));
  assert.ok(products.every((product) => product.readmeUrl?.endsWith("/readme")));
});

test("Audio Separator exposes its test banner asset", async () => {
  const products = await loadLocalProducts();
  const audioSeparator = products.find((product) => product.id === "premiere-audio-separator");

  assert.equal(audioSeparator.bannerImage, "AudioSeparatorBanner.jpg");
});
