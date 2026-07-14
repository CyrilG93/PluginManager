const state = {
  products: [],
  releases: new Map(),
  selectedId: null,
  filter: "all",
  query: "",
  busyProductIds: new Set()
};

const productList = document.getElementById("productList");
const searchInput = document.getElementById("searchInput");
const refreshAllButton = document.getElementById("refreshAllButton");
const primaryAction = document.getElementById("primaryAction");
const releaseButton = document.getElementById("releaseButton");
const detailLogo = document.getElementById("detailLogo");
const detailHost = document.getElementById("detailHost");
const detailName = document.getElementById("detailName");
const detailVersion = document.getElementById("detailVersion");
const detailKind = document.getElementById("detailKind");
const detailCompatibility = document.getElementById("detailCompatibility");
const installedState = document.getElementById("installedState");
const assetState = document.getElementById("assetState");
const statusMessage = document.getElementById("statusMessage");

// Formats release tags and missing values for compact table cells.
function formatValue(value) {
  return value || "-";
}

// Returns the product currently selected in the list.
function getSelectedProduct() {
  return state.products.find((product) => product.id === state.selectedId) || null;
}

// Builds a short visual mark from the product name.
function getInitials(product) {
  return product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// Filters the visible product list by tab and search query.
function getVisibleProducts() {
  const query = state.query.trim().toLowerCase();

  return state.products.filter((product) => {
    const filterMatches = state.filter === "all" || product.installMode === state.filter;
    const queryMatches = !query || [product.name, product.host, product.kind].join(" ").toLowerCase().includes(query);
    return filterMatches && queryMatches;
  });
}

// Renders the product table rows.
function renderProductList() {
  const visibleProducts = getVisibleProducts();
  productList.innerHTML = "";

  for (const product of visibleProducts) {
    const release = state.releases.get(product.id);
    const installedVersion = product.installed?.installedVersion;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `product-row${product.id === state.selectedId ? " active" : ""}`;
    row.dataset.productId = product.id;

    const icon = product.installMode === "script" ? "↑" : "↓";
    row.innerHTML = `
      <span class="product-title">
        <span class="mode-dot">${icon}</span>
        <span class="product-name">${product.name}</span>
      </span>
      <span class="version-cell">${formatValue(installedVersion)}</span>
      <span class="version-cell">${formatValue(release?.version)}</span>
    `;

    row.addEventListener("click", () => {
      state.selectedId = product.id;
      render();
      refreshProduct(product.id);
    });

    productList.appendChild(row);
  }
}

// Renders the detail panel for the current selection.
function renderDetails() {
  const product = getSelectedProduct();

  if (!product) {
    primaryAction.disabled = true;
    releaseButton.disabled = true;
    return;
  }

  const release = state.releases.get(product.id);
  const isBusy = state.busyProductIds.has(product.id);
  const installedVersion = product.installed?.installedVersion;

  detailLogo.textContent = getInitials(product);
  detailHost.textContent = product.host.includes("After") ? "Ae" : "Pr";
  detailName.textContent = product.name;
  detailVersion.textContent = release?.version ? `v. ${release.version}` : "-";
  detailKind.textContent = product.kind;
  detailCompatibility.textContent = product.host;
  installedState.textContent = installedVersion || (product.installed?.installed ? "Detected" : "Not detected");
  assetState.textContent = release?.selectedAssetName || "-";

  primaryAction.textContent = product.installMode === "script" ? "Install" : "Download";
  primaryAction.disabled = isBusy;
  releaseButton.disabled = !release?.htmlUrl;

  if (!isBusy && !statusMessage.textContent) {
    statusMessage.textContent = "Ready.";
  }
}

// Renders the complete UI from the current state.
function render() {
  renderProductList();
  renderDetails();
}

// Updates one product with latest GitHub release metadata.
async function refreshProduct(productId) {
  try {
    statusMessage.textContent = "Checking latest release...";
    const release = await window.pluginManager.refreshProduct(productId);
    state.releases.set(productId, release);
    statusMessage.textContent = "Ready.";
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    render();
  }
}

// Refreshes products one by one to keep the UI responsive.
async function refreshAllProducts() {
  for (const product of state.products) {
    await refreshProduct(product.id);
  }
}

// Installs or downloads the selected product release.
async function installSelectedProduct() {
  const product = getSelectedProduct();
  if (!product) {
    return;
  }

  state.busyProductIds.add(product.id);
  statusMessage.textContent = product.installMode === "script" ? "Preparing installer..." : "Preparing download...";
  render();

  try {
    const result = await window.pluginManager.installProduct(product.id);
    product.installed = result.installed;
    state.releases.set(product.id, result.release);
    statusMessage.textContent = result.message;
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    state.busyProductIds.delete(product.id);
    render();
  }
}

// Initializes tab, search and action handlers.
function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      render();
    });
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    render();
  });

  refreshAllButton.addEventListener("click", () => {
    refreshAllProducts();
  });

  primaryAction.addEventListener("click", () => {
    installSelectedProduct();
  });

  releaseButton.addEventListener("click", () => {
    const release = state.releases.get(state.selectedId);
    if (release?.htmlUrl) {
      window.pluginManager.openRelease(release.htmlUrl);
    }
  });

  window.pluginManager.onProductProgress((payload) => {
    if (payload.productId === state.selectedId) {
      const progress = payload.progress;
      if (progress?.total) {
        const percent = Math.round((progress.downloaded / progress.total) * 100);
        statusMessage.textContent = `${payload.message} (${percent}%)`;
      } else {
        statusMessage.textContent = payload.message;
      }
    }
  });
}

// Loads initial product state and starts release checks for the selected item.
async function bootstrap() {
  bindEvents();
  state.products = await window.pluginManager.listProducts();
  state.selectedId = state.products[0]?.id || null;
  render();

  if (state.selectedId) {
    refreshProduct(state.selectedId);
  }
}

bootstrap().catch((error) => {
  statusMessage.textContent = error.message;
});
