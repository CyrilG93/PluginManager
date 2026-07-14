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

Use the admin password to activate it on the current computer. After that, admin mode stays enabled locally and does not ask for the password again.

## Beta Releases

Beta builds must be published as GitHub Releases marked `Set as a pre-release`.

The manager does not build extensions from repository source files. It downloads release assets only, just like stable installs. This keeps beta installation consistent with normal releases and avoids accidental installs from incomplete development files.

Recommended beta workflow:

- publish a GitHub pre-release such as `v1.2.3-beta.1`
- attach the same kind of install asset as stable releases: `.zip`, `.pkg`, `.exe`, `.ccx` or `.zxp`
- keep draft releases private until the install asset is ready
- promote the same packaged build to a normal release when it is validated

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

### 0.1.4 - 2026-07-14

- Added an Admin-only Beta version column.
- Changed beta detection to use only GitHub releases marked as pre-releases.
- Documented the recommended beta release workflow.

### 0.1.3 - 2026-07-14

- Fixed the admin password window so it only opens from the Admin button and closes after unlock.

### 0.1.2 - 2026-07-14

- Fixed installed-version detection when old and new copies exist in different Adobe folders.
- Replaced the admin prompt with an in-app unlock window.
- Set the admin password to the shared admin password.

### 0.1.1 - 2026-07-14

- Added double-click launchers for macOS and Windows.
- Added automatic latest-version refresh and update highlights.
- Added local admin mode for beta builds and release shortcuts.
- Removed the macOS traffic-light decoration from the app sidebar.

### 0.1.0 - 2026-07-14

- Added the first desktop version of Cyril Plugin Manager.
- Added GitHub release lookup, installer download, script launch and local install detection.
