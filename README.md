# Cyril Plugin Manager

Cyril Plugin Manager is a desktop app for installing Cyril Plugin releases from one place.

It reads the latest GitHub release for each product, then:

- runs the matching `.sh` or `.bat` installer in the background for automatic products, including Tool Bar UXP
- displays background installer output inside the Status / Logs panel instead of opening a Terminal window
- downloads `.pkg`, `.exe`, `.ccx` or `.zxp` installers into `Downloads/Cyril Plugin Manager`, then opens them automatically with the system installer
- detects installed CEP/UXP extensions from common Adobe folders, with Adobe UPIA as a fallback for managed UXP installs
- highlights products when a newer stable version is available
- installs the stable GitHub release when the Install, Update or Reinstall action is used for an automatic product
- checks for a newer Plugin Manager release at startup and displays an update banner
- uninstalls detected CEP/UXP extension folders

GitHub is checked at startup, when using the global refresh button, when refreshing one product with right-click, and when an install needs release data that is not already cached. Every product refresh also rescans the installed version, so a right-click immediately corrects stale local status.

## Requirements

- macOS or Windows
- public GitHub releases for end users

Node.js is only required for development or local packaging.

Private release testing can use a token through `CYRIL_PLUGIN_MANAGER_GITHUB_TOKEN` or `GITHUB_TOKEN`.

## Installation

Download the installer for your operating system from the GitHub release:

- macOS Apple Silicon: open the ARM64 `.dmg`, then drag `Cyril Plugin Manager` into `Applications`
- Windows x64: run the `.exe` installer

The macOS release is ARM64-only for Apple Silicon. Intel Macs are not supported by this build; the Windows installer remains x64.

The installers include the app runtime. Users do not need Node.js, npm, GitHub CLI or Terminal commands.

When a newer Plugin Manager release is available, the app displays a banner, downloads the matching DMG or EXE, then opens it automatically. Because current builds are unsigned, the final replacement or installer confirmation remains manual.

Package installers can still display their normal Adobe Creative Cloud, macOS Installer, Windows installer or administrator confirmation window. Complete that window, then right-click the product in Cyril Plugin Manager to refresh its installed version.

Unsigned development builds may show a macOS Gatekeeper or Windows SmartScreen warning until the app is signed.

## Development Launch

You can start the app by double-clicking:

- macOS: `Launch Cyril Plugin Manager.command`
- Windows: `Launch Cyril Plugin Manager.bat`

These launchers install missing Node dependencies before opening the app.

## Admin Mode

Admin mode unlocks beta builds.

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
Use `installMode: "manual"` for products that should download and open a package such as `.pkg`, `.exe` or `.ccx`.
For UXP products, `upiaNames` can list the display names returned by Adobe UPIA when they differ from the catalog product name.

## Changelog

### 0.1.16 - 2026-07-15

- Added a startup banner when a newer Plugin Manager version is available.
- Added automatic download and opening of the matching macOS or Windows installer.
- Added an integrity check before opening downloaded application updates.

### 0.1.15 - 2026-07-15

- Added the CPT application icon on macOS and Windows.
- Improved refreshes so installed versions, including Tool Bar UXP, are detected again.
- Moved automatic installer output into the app and opened downloaded package installers automatically.
- Added installation and update actions from GitHub releases.
- Limited the macOS release installer to ARM64 while keeping Windows x64.

### 0.1.10 - 2026-07-14

- Simplified product action buttons so they fit inside the detail panel.
- Changed the main action label to Install, Update or Reinstall depending on product state.
- Removed the per-product refresh button and Release button.
- Made Compatibility and Status tabs switch the visible detail panel.

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
