#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# File: fix-wifi.sh (v38 - USER INTENT AWARE + AUTONOMOUS RECOVERY)
# -----------------------------------------------------------------------------

set -euo pipefail

# -------------------------
# ROOT ESCALATION
# -------------------------
if [[ $EUID -ne 0 ]]; then exec sudo "$0" "$@"; fi

# -------------------------
# SAFE PATH RESOLUTION
# -------------------------
# If FIX_WIFI_WORKSPACE is provided (e.g. from server.ts), use it.
# Otherwise, default to the script's own directory.
WORKSPACE_DIR="${FIX_WIFI_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
TRACE_LOG="$WORKSPACE_DIR/verbatim_handshake.log"
MANIFEST_DB="$WORKSPACE_DIR/manifest.db"
BUNDLE_DIR="$WORKSPACE_DIR/offline_bundle"
DISABLE_FLAG="$WORKSPACE_DIR/.fix-wifi.disabled"

# -------------------------
# USER INTENT CHECK (CRITICAL UX FIX)
# -------------------------
if [[ -f "$DISABLE_FLAG" ]] && [[ "${1:-}" != "--force" ]]; then
    echo "→ MILESTONE: USER_DISABLED_BYPASS"
    echo "→ MILESTONE: USER_DISABLED_BYPASS" >> "$TRACE_LOG"
    echo "Autonomous recovery is disabled by user. Exiting."
    exit 0
fi

# -------------------------
# GLOBAL STATE
# -------------------------
TRACE_PID=""
CLEANUP_DONE=0

# -------------------------
# TIMEOUTS
# -------------------------
CMD_TIMEOUT_SHORT=2
CMD_TIMEOUT_LONG=5

# -------------------------
# LOGGING
# -------------------------
log_milestone() {
    local msg="$1"
    echo "→ MILESTONE: $msg"
    echo "→ MILESTONE: $msg" >> "$TRACE_LOG"
    
    # Capture a snapshot of system logs at each milestone
    if [[ -f "$TRACE_LOG" ]]; then
        echo "[SYSTEM SNAPSHOT @ $(date +%H:%M:%S)]" >> "$TRACE_LOG"
        journalctl -n 5 --no-pager -u NetworkManager -t kernel | grep -E "wlp|b43|wl0|NetworkManager" >> "$TRACE_LOG" 2>/dev/null || true
        echo "------------------------------------" >> "$TRACE_LOG"
    fi
}

# -------------------------
# CLEANUP (SAFE, NON-RECURSIVE)
# -------------------------
cleanup() {
    if [[ "$CLEANUP_DONE" -eq 1 ]]; then
        return 0
    fi
    CLEANUP_DONE=1

    log_milestone "CLEANUP_START"

    if [[ -n "${TRACE_PID:-}" ]]; then
        if kill -0 "$TRACE_PID" 2>/dev/null; then
            kill "$TRACE_PID" 2>/dev/null || true
            wait "$TRACE_PID" 2>/dev/null || true
        fi
    fi

    log_milestone "CLEANUP_END"
}

trap cleanup EXIT INT TERM

# -------------------------
# TRACE STREAM
# -------------------------
start_trace_stream() {
    # Clear log file at start
    echo "=== TRACE START $(date) ===" > "$TRACE_LOG"
    
    {
        timeout "$CMD_TIMEOUT_SHORT" journalctl -n 50 --no-pager 2>/dev/null || echo "journal unavailable"
        echo ""
        timeout "$CMD_TIMEOUT_SHORT" dmesg | tail -n 50 2>/dev/null || true
        echo "=== INITIAL SNAPSHOT END ==="
    } >> "$TRACE_LOG" &

    TRACE_PID=$!
}

# -------------------------
# HEALTH CHECK
# -------------------------
system_is_healthy() {
    # 1. Check global networking state (Fixes "Enable Networking" unchecked)
    local net_state
    net_state=$(timeout "$CMD_TIMEOUT_SHORT" nmcli networking connectivity 2>/dev/null || echo "unknown")
    if [[ "$net_state" == "none" ]]; then
        return 1
    fi

    # 2. Check for any connected device that isn't loopback
    local status
    status="$(timeout "$CMD_TIMEOUT_SHORT" nmcli -t -f DEVICE,STATE device 2>/dev/null || true)"
    echo "$status" | awk -F: '$2 ~ /connected/ && $1 != "lo" {found=1} END{exit !found}'
}

# -------------------------
# REPORT
# -------------------------
format_report() {
    echo ""
    echo "======================================"
    echo "      NETWORK HEALTH REPORT"
    echo "======================================"

    timeout "$CMD_TIMEOUT_SHORT" nmcli device status 2>/dev/null || echo "nmcli device status unavailable"
    timeout "$CMD_TIMEOUT_SHORT" nmcli connection show --active 2>/dev/null || echo "nmcli connections unavailable"
    timeout "$CMD_TIMEOUT_SHORT" ip route 2>/dev/null || echo "ip route unavailable"
    timeout "$CMD_TIMEOUT_SHORT" iw dev 2>/dev/null || echo "iw unavailable"

    lsmod | grep -E "b43|cfg80211|mac80211|ssb|bcma" || true
    ls -lh /usr/lib/firmware/b43 2>/dev/null || true
    uname -r
    timeout "$CMD_TIMEOUT_SHORT" nmcli dev show 2>/dev/null | grep DNS || true

    echo "======================================"
}

# -------------------------
# RECOVERY ACTIONS
# -------------------------
perform_recovery() {
    log_milestone "RECOVERY_EXECUTION_START"

# 1. Force Networking ON (Fixes "Enable Networking" unchecked)
    echo "→ Restoring global networking states..."
    
    # Unblock all radios FIRST
    echo "→ Unblocking all radios..."
    timeout "$CMD_TIMEOUT_LONG" rfkill unblock all 2>/dev/null || true

    # Enable global networking with retries
    local net_restored=0
    for i in {1..3}; do
        echo "→ Attempt $i: Enabling global networking..."
        if timeout "$CMD_TIMEOUT_LONG" nmcli networking on 2>/dev/null; then
            log_milestone "NM_NETWORKING_ON_SUCCESS"
            net_restored=1
            break
        fi
        sleep 1
    done
    [[ $net_restored -eq 0 ]] && log_milestone "NM_NETWORKING_ON_FAILED"

    # Force a connectivity check
    echo "→ Forcing connectivity check..."
    timeout "$CMD_TIMEOUT_LONG" nmcli networking connectivity check 2>/dev/null || true

    # Enable all radios
    echo "→ Enabling all radios..."
    timeout "$CMD_TIMEOUT_LONG" nmcli radio all on 2>/dev/null || true
    
    # Enable Wi-Fi radio specifically
    if timeout "$CMD_TIMEOUT_LONG" nmcli radio wifi on 2>/dev/null; then
        log_milestone "NM_RADIO_WIFI_ON_SUCCESS"
    else
        log_milestone "NM_RADIO_WIFI_ON_FAILED"
    fi

    # 3. Ensure NetworkManager is running
    if ! systemctl is-active --quiet NetworkManager; then
        echo "→ Starting NetworkManager..."
        systemctl start NetworkManager
    fi

    # 4. Ensure interface is MANAGED and UP
    IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
    if [[ -n "$IFACE" ]]; then
        echo "→ Ensuring $IFACE is managed by NetworkManager..."
        timeout "$CMD_TIMEOUT_SHORT" nmcli device set "$IFACE" managed yes 2>/dev/null || true
        
        echo "→ Bringing interface $IFACE up..."
        ip link set "$IFACE" up 2>/dev/null || true
        
        echo "→ Disabling Wi-Fi power management..."
        timeout "$CMD_TIMEOUT_SHORT" iw dev "$IFACE" set power_save off 2>/dev/null || true
        log_milestone "INTERFACE_MANAGED_AND_UP"
    fi

    # 5. Firmware Injection (CRITICAL FOR OFFLINE)
    if [[ ! -d "/usr/lib/firmware/b43" ]] || [[ -z "$(ls -A /usr/lib/firmware/b43 2>/dev/null)" ]]; then
        echo "→ Firmware missing. Checking offline bundle..."
        if [[ -d "$BUNDLE_DIR" ]] && [[ -n "$(ls -A "$BUNDLE_DIR"/*.fw 2>/dev/null)" ]]; then
            echo "→ Injecting firmware from bundle..."
            mkdir -p /usr/lib/firmware/b43
            cp "$BUNDLE_DIR"/*.fw /usr/lib/firmware/b43/
            log_milestone "FIRMWARE_INJECTED"
        else
            echo "→ WARNING: No firmware found in bundle. Recovery may fail."
            log_milestone "FIRMWARE_MISSING_NO_BUNDLE"
        fi
    fi

    # 6. Driver Strategy (from manifest if exists)
    if [[ -f "$MANIFEST_DB" ]]; then
        # Look for the specific PCI ID in the manifest
        DB_ENTRY=$(grep -i "14e4:4331" "$MANIFEST_DB" | head -n1 || echo "")
        if [[ -n "$DB_ENTRY" ]]; then
            # Format: PCI_ID:NAME:DRIVER
            STRATEGY=$(echo "$DB_ENTRY" | awk -F: '{print $3}')
            echo "→ Applying strategy: $STRATEGY"
            if ! lsmod | grep -q "$STRATEGY"; then
                modprobe "$STRATEGY" allhwsupport=1 || true
            fi
        fi
    fi

    # 7. Wait for interface and bring UP
    echo "→ Waiting for interface..."
    IFACE=""
    for i in {1..10}; do
        IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
        [[ -n "$IFACE" ]] && break
        sleep 1
    done

    if [[ -n "$IFACE" ]]; then
        echo "→ Bringing interface $IFACE up..."
        ip link set "$IFACE" up 2>/dev/null || true
    fi

    # 8. Final verification
    sleep 2
    if system_is_healthy; then
        log_milestone "RECOVERY_SUCCESS"
        return 0
    else
        log_milestone "RECOVERY_FAILED"
        return 1
    fi
}

# -------------------------
# MAIN
# -------------------------
main() {
    # Argument Parsing
    for arg in "$@"; do
        if [[ "$arg" == "--check-only" ]]; then
            exit 0
        fi
    done

    if [[ "${1:-}" == "--power-save-on" ]]; then
        IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
        [[ -n "$IFACE" ]] && iw dev "$IFACE" set power_save on 2>/dev/null
        log_milestone "MANUAL_POWER_SAVE_ON"
        exit 0
    elif [[ "${1:-}" == "--power-save-off" ]]; then
        IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
        [[ -n "$IFACE" ]] && iw dev "$IFACE" set power_save off 2>/dev/null
        log_milestone "MANUAL_POWER_SAVE_OFF"
        exit 0
    fi

    log_milestone "DIAGNOSTIC_START"

    start_trace_stream

    STATUS="$(timeout "$CMD_TIMEOUT_SHORT" nmcli -t -f DEVICE,STATE device 2>/dev/null || echo "timeout")"

    log_milestone "DECISION_EVALUATION"

    echo "=== CURRENT STATUS ==="
    echo "$STATUS"

    if system_is_healthy; then
        log_milestone "network=connected"
        echo "SYSTEM STATUS: HEALTHY"
        format_report
        log_milestone "EXIT | CONNECTED (REPORT COMPLETE)"
        return 0
    else
        log_milestone "network=degraded"
        log_milestone "RECOVERY_INIT"
        echo "→ Decision: RECOVERY"
        
        if perform_recovery; then
            echo "SYSTEM STATUS: RECOVERED"
            format_report
            return 0
        else
            echo "SYSTEM STATUS: STILL DEGRADED"
            format_report
            return 1
        fi
    fi
}

main
exit $?
