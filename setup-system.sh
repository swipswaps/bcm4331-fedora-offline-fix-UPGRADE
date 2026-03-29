#!/bin/bash

# Broadcom Recovery Kit - System Setup Script
# This script installs the recovery helper and configures passwordless sudo.

WORKSPACE_DIR=$(pwd)
FIX_SCRIPT_SRC="$WORKSPACE_DIR/fix-wifi.sh"
FIX_SCRIPT_DEST="/usr/local/bin/fix-wifi"
SUDOERS_FILE="/etc/sudoers.d/broadcom-control"
USERNAME=$(whoami)

echo "🛰️ Starting Broadcom Recovery Kit System Integration..."

# 1. Check if script exists
if [[ ! -f "$FIX_SCRIPT_SRC" ]]; then
    echo "❌ Error: fix-wifi.sh not found in current directory."
    exit 1
fi

# 2. Copy script to /usr/local/bin
echo "📦 Installing recovery script to $FIX_SCRIPT_DEST..."
sudo cp "$FIX_SCRIPT_SRC" "$FIX_SCRIPT_DEST"
sudo chmod +x "$FIX_SCRIPT_DEST"

# 3. Configure Sudoers
echo "🛡️ Configuring passwordless sudo for $USERNAME..."
# Fedora specific: ensure the directory exists and has correct permissions
sudo mkdir -p /etc/sudoers.d
sudo chmod 750 /etc/sudoers.d

# Create the rule
# We use a more permissive format for the command to avoid path/arg issues
{
    echo "Defaults:$USERNAME !requiretty"
    echo "Defaults!$FIX_SCRIPT_DEST !requiretty"
    echo "$USERNAME ALL=(ALL) NOPASSWD: $FIX_SCRIPT_DEST"
} | sudo tee "$SUDOERS_FILE" > /dev/null

# Set strict permissions required by sudo
sudo chmod 0440 "$SUDOERS_FILE"
sudo chown root:root "$SUDOERS_FILE"

# Verify with sudo to avoid the "Permission denied" error
sudo ls -l "$SUDOERS_FILE"

# Validate sudoers syntax
if ! sudo visudo -c -f "$SUDOERS_FILE" &> /dev/null; then
    echo "❌ Error: Sudoers configuration is invalid."
    sudo rm "$SUDOERS_FILE"
    exit 1
fi

# 4. Restore SELinux context (Fedora)
if command -v restorecon &> /dev/null; then
    echo "🔍 Restoring SELinux contexts..."
    sudo restorecon -v "$FIX_SCRIPT_DEST" || true
fi

echo "✅ System integration complete!"
