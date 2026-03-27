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
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
    {
        echo "=== TRACE START $(date) ==="
        timeout "$CMD_TIMEOUT_SHORT" journalctl -n 50 --no-pager 2>/dev/null || echo "journal unavailable"
        echo ""
        timeout "$CMD_TIMEOUT_SHORT" dmesg | tail -n 50 2>/dev/null || true
        echo "=== TRACE END $(date) ==="
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
    echo "→ Enabling networking..."
    timeout "$CMD_TIMEOUT_SHORT" nmcli networking on 2>/dev/null || true

    # 2. Unblock RFKill
    echo "→ Unblocking Wi-Fi..."
    timeout "$CMD_TIMEOUT_SHORT" rfkill unblock wifi 2>/dev/null || true

    # 3. Ensure NetworkManager is running
    if ! systemctl is-active --quiet NetworkManager; then
        echo "→ Starting NetworkManager..."
        systemctl start NetworkManager
    fi

    # 4. Driver Strategy (from manifest if exists)
    if [[ -f "$MANIFEST_DB" ]]; then
        K_VER="$(uname -r | cut -d. -f1,2)"
        DB_ENTRY=$(grep -E "^14e4:4331" "$MANIFEST_DB" | head -n1 || echo "")
        if [[ -n "$DB_ENTRY" ]]; then
            STRATEGY=$(echo "$DB_ENTRY" | cut -d: -f3)
            echo "→ Applying strategy: $STRATEGY"
            if ! lsmod | grep -q "$STRATEGY"; then
                modprobe "$STRATEGY" allhwsupport=1 || true
            fi
        fi
    fi

    # 5. Wait for interface and bring UP
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

    # 6. Final verification
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
