#!/usr/bin/env bash
# File: cold-start.sh (v20 - FORENSIC RECOVERY ORCHESTRATOR)
# -----------------------------------------------------------------------------
# This script effects request compliance by abstracting all complexities
# into a single, atomic, verbatim execution sequence.

set -e
set -u
set -o pipefail

# REQUIREMENT: First line of output must be the log path
LOG_FILE="verbatim_handshake.log"
echo "LOG_PATH: $(pwd)/$LOG_FILE"

# 1. Nuclear Clear (Force-clear everything before starting)
echo "🛰️ Step 1: Nuclear Clear (Port 3000/24678)..."
sudo fuser -k -9 3000/tcp 24678/tcp 2>/dev/null || true

# 2. Setup (Installs v80 Transparency Engine)
echo "🛰️ Step 2: System Setup & Dependency Injection..."
# We ensure dependencies are installed here too for zero-state resilience
sudo dnf install -y sqlite tcpdump mtr traceroute bind-utils NetworkManager iw haveged chrony iputils 2>/dev/null || true
npm run setup

# 3. Start Server (Background)
echo "🛰️ Step 3: Starting Dev Server in Background..."
PROJECT_ROOT=$(pwd) npm run dev > server.log 2>&1 &
DEV_SERVER_PID=$!

# 4. Wait for Server to Boot
echo "🛰️ Step 4: Waiting for Server Boot (10s)..."
sleep 10

# 5. Recovery (With Kali-style Sniffing and Stack Tracing)
echo "🛰️ Step 5: Initiating Forensic Recovery (v80)..."
# We pass PROJECT_ROOT to ensure the script knows where it is
sudo PROJECT_ROOT=$(pwd) /usr/local/bin/fix-wifi --workspace $(pwd) --force

# 6. Audit the Forensic Evidence
echo "🛰️ Step 6: Auditing Forensic Evidence..."
if [[ -f "recovery_state.db" ]]; then
    echo "--- DATABASE MILESTONES ---"
    sqlite3 recovery_state.db "SELECT timestamp, name FROM milestones ORDER BY timestamp ASC;"
    echo "---------------------------"
fi

if [[ -f "$LOG_FILE" ]]; then
    echo "--- HANDSHAKE VERIFICATION ---"
    grep "HANDSHAKE" "$LOG_FILE" | tail -n 5
    echo "------------------------------"
fi

echo "✅ Forensic Recovery Sequence Complete!"
