const state = {
  products: [],
  releases: new Map(),
  selectedId: null,
  filter: "all",
  query: "",
  detailTab: "compatibility",
  admin: {
    configured: false,
    enabled: false
  },
  busyProductIds: new Set(),
  refreshingProductIds: new Set(),
  productLogs: new Map()
};

const MAX_LOG_LINES = 300;

const productList = document.getElementById("productList");
const productTableHead = document.getElementById("productTableHead");
const searchInput = document.getElementById("searchInput");
const refreshAllButton = document.getElementById("refreshAllButton");
const adminButton = document.getElementById("adminButton");
const adminModal = document.getElementById("adminModal");
const adminForm = document.getElementById("adminForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminCancelButton = document.getElementById("adminCancelButton");
const primaryAction = document.getElementById("primaryAction");
const uninstallAction = document.getElementById("uninstallAction");
const betaAction = document.getElementById("betaAction");
const compatibilityPanel = document.getElementById("compatibilityPanel");
const statusPanel = document.getElementById("statusPanel");
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
const installLog = document.getElementById("installLog");
const clearLogsButton = document.getElementById("clearLogsButton");

// Waits between release checks so startup does not burst GitHub API requests.
function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

// Formats release tags and missing values for compact table cells.
function formatValue(value) {
  return value || "-";
}

// Returns the product currently selected in the list.
function getSelectedProduct() {
  return state.products.find((product) => product.id === state.selectedId) || null;
}

// Adds a timestamped line to one product's bounded local installation log.
function appendProductLog(productId, message, stream = "stdout") {
  if (!message) {
    return;
  }

  const logs = state.productLogs.get(productId) || [];
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const prefix = stream === "stderr" ? "!" : ">";
  const newLines = String(message).split(/\r?\n/).filter(Boolean);
  newLines.forEach((line) => logs.push(`[${timestamp}] ${prefix} ${line}`));
  state.productLogs.set(productId, logs.slice(-MAX_LOG_LINES));
}

// Displays the selected product's logs and follows the newest output line.
function renderProductLogs(productId) {
  const logs = state.productLogs.get(productId) || [];
  installLog.textContent = logs.length > 0 ? logs.join("\n") : "No installation logs yet.";
  installLog.scrollTop = installLog.scrollHeight;
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

// Chooses the primary action label from the detected install and release state.
function getPrimaryActionLabel(product) {
  if (hasStableUpdate(product)) {
    return "Update";
  }

  if (product.installed?.installed) {
    return "Reinstall";
  }

  return "Install";
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
  productTableHead.classList.toggle("admin", state.admin.enabled);

  for (const product of visibleProducts) {
    const release = state.releases.get(product.id);
    const installedVersion = product.installed?.installedVersion;
    const isRefreshing = state.refreshingProductIds.has(product.id);
    const updateAvailable = hasStableUpdate(product);
    const row = document.createElement("button");
    row.type = "button";
    row.className = [
      "product-row",
      state.admin.enabled ? "admin" : "",
      product.id === state.selectedId ? "active" : "",
      updateAvailable ? "update-available" : "",
      release?.beta ? "has-beta" : ""
    ].filter(Boolean).join(" ");
    row.dataset.productId = product.id;

    const icon = product.installMode === "script" ? "↑" : "↓";
    const latestLabel = isRefreshing ? "..." : formatValue(release?.version);
    const betaLabel = isRefreshing ? "..." : formatValue(release?.beta?.version);
    const updateBadge = updateAvailable ? "<span class=\"update-pill\">Update</span>" : "";
    row.innerHTML = `
      <span class="product-title">
        <span class="mode-dot">${icon}</span>
        <span class="product-name">${product.name}</span>
        ${updateBadge}
      </span>
      <span class="version-cell">${formatValue(installedVersion)}</span>
      <span class="version-cell latest">${latestLabel}</span>
      <span class="version-cell beta beta-column">${betaLabel}</span>
    `;

    row.addEventListener("click", () => {
      state.selectedId = product.id;
      render();
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      state.selectedId = product.id;
      refreshProduct(product.id, { force: true });
    });

    productList.appendChild(row);
  }
}

// Renders the detail panel for the current selection.
function renderDetails() {
  const product = getSelectedProduct();

  if (!product) {
    primaryAction.disabled = true;
    uninstallAction.disabled = true;
    compatibilityPanel.hidden = true;
    statusPanel.hidden = true;
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

  primaryAction.textContent = getPrimaryActionLabel(product);
  primaryAction.disabled = isBusy;
  uninstallAction.disabled = isBusy || !product.installed?.installed || !product.installed?.installedPath;
  betaAction.hidden = !state.admin.enabled;
  betaAction.disabled = isBusy || !release?.beta;
  betaAction.textContent = "Install Beta";
  adminButton.classList.toggle("enabled", state.admin.enabled);
  adminButton.title = state.admin.enabled ? "Disable admin" : "Enable admin";
  compatibilityPanel.hidden = state.detailTab !== "compatibility";
  statusPanel.hidden = state.detailTab !== "status";
  document.querySelectorAll(".section-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.detailTab === state.detailTab);
  });
  renderProductLogs(product.id);

  if (!isBusy && !statusMessage.textContent) {
    statusMessage.textContent = "Ready.";
  }
}

// Renders the complete UI from the current state.
function render() {
  renderProductList();
  renderDetails();
}

// Updates one product with both GitHub release metadata and its current installed version.
async function refreshProduct(productId, options = {}) {
  const product = state.products.find((entry) => entry.id === productId);
  state.refreshingProductIds.add(productId);
  render();

  try {
    if (!options.silent && productId === state.selectedId) {
      state.detailTab = "status";
      statusMessage.textContent = "Checking latest release and installed version...";
    }

    const refreshed = await window.pluginManager.refreshProduct(productId, {
      includeBeta: state.admin.enabled,
      force: Boolean(options.force)
    });
    state.releases.set(productId, refreshed.release);
    product.installed = refreshed.installed;

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

// Refreshes products one by one to avoid unnecessary concurrent GitHub calls.
async function refreshAllProducts(options = {}) {
  for (const product of state.products) {
    await refreshProduct(product.id, options);
    await delay(120);
  }
}

// Removes the selected installed plugin from detected Adobe extension folders.
async function uninstallSelectedProduct() {
  const product = getSelectedProduct();
  if (!product || !product.installed?.installed) {
    return;
  }

  if (!window.confirm(`Uninstall ${product.name}?`)) {
    return;
  }

  state.busyProductIds.add(product.id);
  state.detailTab = "status";
  statusMessage.textContent = "Uninstalling plugin...";
  render();

  try {
    const result = await window.pluginManager.uninstallProduct(product.id);
    product.installed = result.installed;
    statusMessage.textContent = result.message;
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    state.busyProductIds.delete(product.id);
    render();
  }
}

// Installs or downloads the selected product release.
async function installSelectedProduct(channel = "stable") {
  const product = getSelectedProduct();
  if (!product) {
    return;
  }

  state.busyProductIds.add(product.id);
  state.detailTab = "status";
  const channelLabel = channel === "beta" ? "beta " : "";
  statusMessage.textContent = `Preparing ${channelLabel}installer...`;
  appendProductLog(product.id, `Starting ${channelLabel || "stable "}installation for ${product.name}.`);
  render();

  try {
    const result = await window.pluginManager.installProduct(product.id, channel);
    product.installed = result.installed;
    state.releases.set(product.id, result.release);
    statusMessage.textContent = result.message;
    appendProductLog(product.id, result.message);
  } catch (error) {
    statusMessage.textContent = error.message;
    appendProductLog(product.id, error.message, "stderr");
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

  document.querySelectorAll(".section-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailTab = button.dataset.detailTab;
      render();
    });
  });

  refreshAllButton.addEventListener("click", () => {
    refreshAllProducts({ force: true });
  });

  primaryAction.addEventListener("click", () => {
    installSelectedProduct();
  });

  uninstallAction.addEventListener("click", () => {
    uninstallSelectedProduct();
  });

  betaAction.addEventListener("click", () => {
    installSelectedProduct("beta");
  });

  clearLogsButton.addEventListener("click", () => {
    const product = getSelectedProduct();
    if (product) {
      state.productLogs.delete(product.id);
      renderProductLogs(product.id);
    }
  });

  adminButton.addEventListener("click", () => {
    if (state.admin.enabled) {
      disableAdminMode();
      return;
    }

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
    if (payload.log) {
      appendProductLog(payload.productId, payload.log, payload.stream);
    }

    if (payload.productId === state.selectedId) {
      const progress = payload.progress;
      if (progress?.total) {
        const percent = Math.round((progress.downloaded / progress.total) * 100);
        statusMessage.textContent = `${payload.message} (${percent}%)`;
      } else {
        statusMessage.textContent = payload.message;
      }
      renderProductLogs(payload.productId);
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

// Disables admin mode locally and hides beta-only release data from the UI.
async function disableAdminMode() {
  try {
    state.admin = await window.pluginManager.disableAdmin();
    for (const release of state.releases.values()) {
      if (release) {
        release.beta = null;
      }
    }
    statusMessage.textContent = "Admin mode disabled.";
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
