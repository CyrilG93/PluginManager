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
  // Locks the public slugs published on the Cyril Plugin website.
  const expectedReadmeUrls = new Map([
    ["premiere-audio-separator", "https://www.cyrilplugin.com/audio-separator/readme"],
    ["premiere-beat-detector", "https://www.cyrilplugin.com/beat-detector/readme"],
    ["premiere-database", "https://www.cyrilplugin.com/data-base/readme"],
    ["premiere-export-button", "https://www.cyrilplugin.com/export-button/readme"],
    ["premiere-file-manager", "https://www.cyrilplugin.com/file-manager/readme"],
    ["premiere-grid-maker", "https://www.cyrilplugin.com/grid-maker/readme"],
    ["premiere-sequence-renamer", "https://www.cyrilplugin.com/sequence-renamer/readme"],
    ["premiere-sub-creator", "https://www.cyrilplugin.com/sub-creator/readme"],
    ["premiere-time-tracker", "https://www.cyrilplugin.com/time-tracker/readme"],
    ["premiere-toolbar", "https://www.cyrilplugin.com/tool-bar/readme"],
    ["premiere-youtube-downloader", "https://www.cyrilplugin.com/youtube-downloader/readme"]
  ]);

  assert.deepEqual(
    new Map(products.map((product) => [product.id, product.readmeUrl])),
    expectedReadmeUrls
  );
});

test("Audio Separator exposes its test banner asset", async () => {
  const products = await loadLocalProducts();
  const audioSeparator = products.find((product) => product.id === "premiere-audio-separator");

  assert.equal(audioSeparator.bannerImage, "AudioSeparatorBanner.jpg");
});
