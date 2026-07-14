const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const HASH_ITERATIONS = 120000;
const HASH_LENGTH = 32;
const HASH_DIGEST = "sha256";

// Builds the admin settings path inside Electron userData.
function getAdminStatePath(userDataPath) {
  return path.join(userDataPath, "admin-state.json");
}

// Hashes the password with a local salt before writing it to disk.
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_LENGTH, HASH_DIGEST).toString("hex");
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
    configured: Boolean(state?.passwordHash),
    enabled: Boolean(state?.enabled)
  };
}

// Creates or verifies the admin password and keeps admin mode enabled afterwards.
async function enableAdminMode(userDataPath, password) {
  if (!password || String(password).length < 4) {
    throw new Error("Admin password must contain at least 4 characters.");
  }

  const existingState = await readAdminFile(userDataPath);

  if (!existingState?.passwordHash) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    await writeAdminFile(userDataPath, {
      salt,
      passwordHash,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    return getAdminState(userDataPath);
  }

  const expectedHash = hashPassword(password, existingState.salt);
  const expectedBuffer = Buffer.from(existingState.passwordHash, "hex");
  const actualBuffer = Buffer.from(expectedHash, "hex");

  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Incorrect admin password.");
  }

  await writeAdminFile(userDataPath, {
    ...existingState,
    enabled: true,
    enabledAt: new Date().toISOString()
  });

  return getAdminState(userDataPath);
}

module.exports = {
  enableAdminMode,
  getAdminState
};
