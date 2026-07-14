const { spawn } = require("node:child_process");
const path = require("node:path");

// Starts Electron with a clean environment even when the shell runs Electron as Node.
const electronBin = path.join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
const env = { ...process.env };

// This variable is useful for Electron internals but breaks normal app startup here.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ["."], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
  windowsHide: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
