const fs = require("node:fs/promises");
const path = require("node:path");
const ADMIN_PASSWORD = "Extron";

// Builds the admin settings path inside Electron userData.
function getAdminStatePath(userDataPath) {
  return path.join(userDataPath, "admin-state.json");
}

// Reads the admin settings file and returns null when it does not exist yet.
async function readAdminFile(userDataPath) {
  try {
    const rawState = await fs.readFile(getAdminStatePath(userDataPath), "utf8");
    return JSON.parse(rawState);
  } catch (_error) {
    return null;
  }
}

// Writes the admin settings atomically enough for this small local state file.
async function writeAdminFile(userDataPath, state) {
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(getAdminStatePath(userDataPath), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// Returns the public admin state without exposing password hash material.
async function getAdminState(userDataPath) {
  const state = await readAdminFile(userDataPath);

  return {
    configured: true,
    enabled: Boolean(state?.enabled)
  };
}

// Verifies the fixed admin password and keeps admin mode enabled afterwards.
async function enableAdminMode(userDataPath, password) {
  if (password !== ADMIN_PASSWORD) {
    throw new Error("Incorrect admin password.");
  }

  const existingState = await readAdminFile(userDataPath);
  await writeAdminFile(userDataPath, {
    ...existingState,
    enabled: true,
    passwordMode: "fixed",
    enabledAt: new Date().toISOString()
  });

  return getAdminState(userDataPath);
}

// Disables local admin mode without deleting the saved state file.
async function disableAdminMode(userDataPath) {
  const existingState = await readAdminFile(userDataPath);
  await writeAdminFile(userDataPath, {
    ...existingState,
    enabled: false,
    disabledAt: new Date().toISOString()
  });

  return getAdminState(userDataPath);
}

module.exports = {
  ADMIN_PASSWORD,
  disableAdminMode,
  enableAdminMode,
  getAdminState
};
