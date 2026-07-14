# Cyril Plugin Manager

Cyril Plugin Manager is a desktop app for installing Cyril Plugin releases from one place.

It reads the latest GitHub release for each product, then:

- runs the matching `.sh` or `.bat` installer for simple plugins
- downloads `.pkg`, `.exe`, `.ccx` or `.zxp` installers into `Downloads/Cyril Plugin Manager` for manual installation
- detects installed CEP/UXP extensions when they are found in common Adobe extension folders
- highlights products when a newer stable version is available
- uninstalls detected CEP/UXP extension folders

GitHub is checked at startup, when using the refresh button, and when an install needs release data that is not already cached.

## Requirements

- macOS or Windows
- public GitHub releases for end users

Node.js is only required for development or local packaging.

Private release testing can use a token through `CYRIL_PLUGIN_MANAGER_GITHUB_TOKEN` or `GITHUB_TOKEN`.

## Installation

Download the installer for your operating system from the GitHub release:

- macOS: open the `.dmg`, then drag `Cyril Plugin Manager` into `Applications`
- Windows: run the `.exe` installer

The installers include the app runtime. Users do not need Node.js, npm, GitHub CLI or Terminal commands.

Unsigned development builds may show a macOS Gatekeeper or Windows SmartScreen warning until the app is signed.

## Development Launch

You can start the app by double-clicking:

- macOS: `Launch Cyril Plugin Manager.command`
- Windows: `Launch Cyril Plugin Manager.bat`

These launchers install missing Node dependencies before opening the app.

## Admin Mode

Admin mode unlocks beta builds and GitHub release page shortcuts.

Use the admin password to activate it on the current computer. After that, admin mode stays enabled locally and does not ask for the password again.

Click the Admin button again to disable Admin mode on the current computer.

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

Build a macOS installer locally:

```bash
npm run dist:mac
```

Build the Windows installer from a Windows machine or GitHub Actions:

```bash
npm run dist:win
```

GitHub Actions builds macOS `.dmg` and Windows `.exe` artifacts. Pushing a tag like `v0.1.6` also creates a GitHub release with those installers.

## Product Catalog

Products are configured in `data/products.json`.

Installed apps try to load the product catalog from the GitHub `main` branch first, then fall back to the bundled catalog if the computer is offline. This lets the product list change without asking users to reinstall Cyril Plugin Manager.

Use `installMode: "script"` for simple releases that contain a platform installer script.
Use `installMode: "manual"` for products that should download a package such as `.pkg`, `.exe` or `.ccx`.

## Changelog

### 0.1.9 - 2026-07-14

- Added uninstall for detected plugins.
- Added single-product refresh from the selected product and product list right-click.
- Allowed Admin mode to be disabled from the Admin button.
- Moved the product list to a remote catalog with local fallback.
- Removed Premiere Effect Analyzer from the product list.

### 0.1.8 - 2026-07-14

- Updated the installed version display after automatic script installs.
- Confirmed manual beta downloads select the right installer for macOS and Windows.

### 0.1.7 - 2026-07-14

- Reduced GitHub API calls by caching release checks and avoiding refreshes on product selection.
- Replaced raw GitHub 404/403 messages with clear user-facing status messages.
- Hid beta-only details unless Admin mode is enabled.

### 0.1.6 - 2026-07-14

- Limited macOS release artifacts to the user-facing `.dmg` installer.

### 0.1.5 - 2026-07-14

- Added Electron Builder packaging for macOS `.dmg` and Windows `.exe` installers.
- Added a GitHub Actions workflow to build and publish installer artifacts.
- Updated user documentation for installer-based setup.

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
