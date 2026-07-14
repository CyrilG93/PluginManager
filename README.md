# Cyril Plugin Manager

Cyril Plugin Manager is a desktop app for installing Cyril Plugin releases from one place.

It reads the latest GitHub release for each product, then:

- runs the matching `.sh` or `.bat` installer for simple plugins
- downloads `.pkg`, `.exe`, `.ccx` or `.zxp` installers into `Downloads/Cyril Plugin Manager` for manual installation
- detects installed CEP/UXP extensions when they are found in common Adobe extension folders
- highlights products when a newer stable version is available

## Requirements

- macOS or Windows
- Node.js 20 or newer for development
- public GitHub releases for end users

Private release testing can use a token through `CYRIL_PLUGIN_MANAGER_GITHUB_TOKEN` or `GITHUB_TOKEN`.

## Launch

You can start the app by double-clicking:

- macOS: `Launch Cyril Plugin Manager.command`
- Windows: `Launch Cyril Plugin Manager.bat`

These launchers install missing Node dependencies before opening the app.

## Admin Mode

Admin mode unlocks beta builds and GitHub release page shortcuts.

The first activation creates the admin password for the current computer. After that, admin mode stays enabled locally and does not ask for the password again.

## Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Run checks:

```bash
npm run check
```

## Product Catalog

Products are configured in `data/products.json`.

Use `installMode: "script"` for simple releases that contain a platform installer script.
Use `installMode: "manual"` for products that should download a package such as `.pkg`, `.exe` or `.ccx`.

## Changelog

### 0.1.1 - 2026-07-14

- Added double-click launchers for macOS and Windows.
- Added automatic latest-version refresh and update highlights.
- Added local admin mode for beta builds and release shortcuts.
- Removed the macOS traffic-light decoration from the app sidebar.

### 0.1.0 - 2026-07-14

- Added the first desktop version of Cyril Plugin Manager.
- Added GitHub release lookup, installer download, script launch and local install detection.
