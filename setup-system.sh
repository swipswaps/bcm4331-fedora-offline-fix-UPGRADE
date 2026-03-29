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
# We add !requiretty because Fedora often requires a TTY for sudo, which breaks background execution
# We also allow any arguments for the fix-wifi script
{
    echo "Defaults:$USERNAME !requiretty"
    echo "Defaults!$FIX_SCRIPT_DEST !requiretty"
    echo "$USERNAME ALL=(ALL) NOPASSWD: $FIX_SCRIPT_DEST"
} | sudo tee "$SUDOERS_FILE" > /dev/null
sudo chmod 440 "$SUDOERS_FILE"
ls -l "$SUDOERS_FILE"

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
