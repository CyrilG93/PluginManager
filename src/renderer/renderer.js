const state = {
  products: [],
  releases: new Map(),
  selectedId: null,
  filter: "all",
  query: "",
  admin: {
    configured: false,
    enabled: false
  },
  busyProductIds: new Set(),
  refreshingProductIds: new Set()
};

const productList = document.getElementById("productList");
const searchInput = document.getElementById("searchInput");
const refreshAllButton = document.getElementById("refreshAllButton");
const adminButton = document.getElementById("adminButton");
const adminModal = document.getElementById("adminModal");
const adminForm = document.getElementById("adminForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminCancelButton = document.getElementById("adminCancelButton");
const primaryAction = document.getElementById("primaryAction");
const betaAction = document.getElementById("betaAction");
const releaseButton = document.getElementById("releaseButton");
const detailLogo = document.getElementById("detailLogo");
const detailHost = document.getElementById("detailHost");
const detailName = document.getElementById("detailName");
const detailVersion = document.getElementById("detailVersion");
const detailKind = document.getElementById("detailKind");
const detailCompatibility = document.getElementById("detailCompatibility");
const installedState = document.getElementById("installedState");
const assetState = document.getElementById("assetState");
const betaLine = document.getElementById("betaLine");
const betaState = document.getElementById("betaState");
const statusMessage = document.getElementById("statusMessage");

// Formats release tags and missing values for compact table cells.
function formatValue(value) {
  return value || "-";
}

// Returns the product currently selected in the list.
function getSelectedProduct() {
  return state.products.find((product) => product.id === state.selectedId) || null;
}

// Converts a version string to numeric parts for update comparisons.
function versionParts(version) {
  return String(version || "")
    .replace(/^v/i, "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number(part));
}

// Compares simple dotted versions without pulling a semver dependency into the UI.
function compareVersions(leftVersion, rightVersion) {
  const leftParts = versionParts(leftVersion);
  const rightParts = versionParts(rightVersion);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const left = leftParts[index] || 0;
    const right = rightParts[index] || 0;

    if (left > right) {
      return 1;
    }

    if (left < right) {
      return -1;
    }
  }

  return 0;
}

// Checks whether the stable release is newer than the detected installed version.
function hasStableUpdate(product) {
  const release = state.releases.get(product.id);
  const installedVersion = product.installed?.installedVersion;

  return Boolean(installedVersion && release?.version && compareVersions(installedVersion, release.version) < 0);
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
    const isRefreshing = state.refreshingProductIds.has(product.id);
    const updateAvailable = hasStableUpdate(product);
    const row = document.createElement("button");
    row.type = "button";
    row.className = [
      "product-row",
      product.id === state.selectedId ? "active" : "",
      updateAvailable ? "update-available" : ""
    ].filter(Boolean).join(" ");
    row.dataset.productId = product.id;

    const icon = product.installMode === "script" ? "↑" : "↓";
    const latestLabel = isRefreshing ? "..." : formatValue(release?.version);
    const updateBadge = updateAvailable ? "<span class=\"update-pill\">Update</span>" : "";
    row.innerHTML = `
      <span class="product-title">
        <span class="mode-dot">${icon}</span>
        <span class="product-name">${product.name}</span>
        ${updateBadge}
      </span>
      <span class="version-cell">${formatValue(installedVersion)}</span>
      <span class="version-cell latest">${latestLabel}</span>
    `;

    row.addEventListener("click", () => {
      state.selectedId = product.id;
      render();
      if (!state.releases.has(product.id)) {
        refreshProduct(product.id);
      }
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
  const updateAvailable = hasStableUpdate(product);

  detailLogo.textContent = getInitials(product);
  detailHost.textContent = product.host.includes("After") ? "Ae" : "Pr";
  detailName.textContent = product.name;
  detailVersion.textContent = release?.version ? `v. ${release.version}` : "-";
  detailKind.textContent = product.kind;
  detailCompatibility.textContent = product.host;
  installedState.textContent = updateAvailable
    ? `${installedVersion} -> update available`
    : installedVersion || (product.installed?.installed ? "Detected" : "Not detected");
  assetState.textContent = release?.selectedAssetName || "-";
  betaState.textContent = release?.beta?.version ? `v. ${release.beta.version}` : "-";
  betaLine.hidden = !state.admin.enabled;

  primaryAction.textContent = product.installMode === "script" ? "Install" : "Download";
  primaryAction.disabled = isBusy;
  betaAction.hidden = !state.admin.enabled;
  betaAction.disabled = isBusy || !release?.beta;
  betaAction.textContent = product.installMode === "script" ? "Install Beta" : "Download Beta";
  releaseButton.hidden = !state.admin.enabled;
  releaseButton.disabled = !state.admin.enabled || !release?.htmlUrl;
  adminButton.classList.toggle("enabled", state.admin.enabled);
  adminButton.title = state.admin.enabled ? "Admin enabled" : "Enable admin";

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
async function refreshProduct(productId, options = {}) {
  const product = state.products.find((entry) => entry.id === productId);
  state.refreshingProductIds.add(productId);
  render();

  try {
    if (!options.silent && productId === state.selectedId) {
      statusMessage.textContent = "Checking latest release...";
    }

    const release = await window.pluginManager.refreshProduct(productId, {
      includeBeta: state.admin.enabled
    });
    state.releases.set(productId, release);

    if (!options.silent && productId === state.selectedId) {
      statusMessage.textContent = "Ready.";
    }
  } catch (error) {
    if (!options.silent || productId === state.selectedId) {
      statusMessage.textContent = `${product?.name || "Product"}: ${error.message}`;
    }
  } finally {
    state.refreshingProductIds.delete(productId);
    render();
  }
}

// Refreshes products one by one to keep the UI responsive.
async function refreshAllProducts(options = {}) {
  await Promise.allSettled(state.products.map((product) => refreshProduct(product.id, options)));
}

// Installs or downloads the selected product release.
async function installSelectedProduct(channel = "stable") {
  const product = getSelectedProduct();
  if (!product) {
    return;
  }

  state.busyProductIds.add(product.id);
  const channelLabel = channel === "beta" ? "beta " : "";
  statusMessage.textContent = product.installMode === "script"
    ? `Preparing ${channelLabel}installer...`
    : `Preparing ${channelLabel}download...`;
  render();

  try {
    const result = await window.pluginManager.installProduct(product.id, channel);
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

  betaAction.addEventListener("click", () => {
    installSelectedProduct("beta");
  });

  releaseButton.addEventListener("click", () => {
    const release = state.releases.get(state.selectedId);
    if (release?.htmlUrl) {
      window.pluginManager.openRelease(release.htmlUrl);
    }
  });

  adminButton.addEventListener("click", () => {
    openAdminModal();
  });

  adminCancelButton.addEventListener("click", () => {
    closeAdminModal();
  });

  adminModal.addEventListener("click", (event) => {
    if (event.target === adminModal) {
      closeAdminModal();
    }
  });

  adminForm.addEventListener("submit", (event) => {
    event.preventDefault();
    enableAdminMode(adminPasswordInput.value);
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

// Opens the local admin unlock modal.
function openAdminModal() {
  if (state.admin.enabled) {
    statusMessage.textContent = "Admin mode is already enabled.";
    return;
  }

  adminPasswordInput.value = "";
  adminModal.hidden = false;
  adminPasswordInput.focus();
}

// Closes the local admin unlock modal.
function closeAdminModal() {
  adminModal.hidden = true;
  adminPasswordInput.value = "";
}

// Enables admin mode with the fixed local password and keeps it enabled afterwards.
async function enableAdminMode(password) {
  try {
    state.admin = await window.pluginManager.enableAdmin(password);
    closeAdminModal();
    statusMessage.textContent = "Admin mode enabled.";
    await refreshAllProducts({ silent: true });
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    render();
  }
}

// Loads initial product state and starts release checks for the selected item.
async function bootstrap() {
  bindEvents();
  state.admin = await window.pluginManager.getAdminState();
  state.products = await window.pluginManager.listProducts();
  state.selectedId = state.products[0]?.id || null;
  render();

  if (state.selectedId) {
    await refreshAllProducts({ silent: true });
  }
}

bootstrap().catch((error) => {
  statusMessage.textContent = error.message;
});
