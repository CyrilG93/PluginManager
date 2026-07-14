#!/bin/bash

# Launches Cyril Plugin Manager from Finder without typing commands.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Installs Node dependencies only when they are missing.
if [ ! -d "node_modules" ]; then
  npm install || exit 1
fi

# Starts the Electron app through the project launcher.
npm start
