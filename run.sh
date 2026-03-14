#!/bin/bash

# Get the absolute path of the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Define paths
PORTABLE_NODE_BIN="$SCRIPT_DIR/riseup-cli-main/node-v22.14.0-darwin-arm64/bin"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

# Add portable node to PATH
export PATH="$PORTABLE_NODE_BIN:$PATH"

# Check if node exists
if ! command -v node &> /dev/null
then
    echo "Error: Portable Node.js not found at $PORTABLE_NODE_BIN"
    exit 1
fi

echo "Using Node: $(node -v)"
echo "Starting Financial Dashboard..."

# Navigate to dashboard and run
cd "$DASHBOARD_DIR"
npm run dev
