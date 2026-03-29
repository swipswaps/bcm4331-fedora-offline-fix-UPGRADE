#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# File: fix-wifi.sh (v46 - AUTH-AWARE + DETERMINISTIC RECOVERY + NM-CONSISTENT)
# -----------------------------------------------------------------------------

set -euo pipefail

# -------------------------
# ROOT ESCALATION
# -------------------------
if [[ $EUID -ne 0 ]]; then exec sudo "$0" "$@"; fi

# -------------------------
# SAFE PATH RESOLUTION
# -------------------------
WORKSPACE_DIR="${FIX_WIFI_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
TRACE_LOG="$WORKSPACE_DIR/verbatim_handshake.log"
MANIFEST_DB="$WORKSPACE_DIR/manifest.db"
BUNDLE_DIR="$WORKSPACE_DIR/offline_bundle"
DISABLE_FLAG="$WORKSPACE_DIR/.fix-wifi.disabled"

# -------------------------
# USER INTENT CHECK
# -------------------------
if [[ -f "$DISABLE_FLAG" ]] && [[ "${1:-}" != "--force" ]]; then
    echo "→ MILESTONE: USER_DISABLED_BYPASS"
    echo "→ MILESTONE: USER_DISABLED_BYPASS" >> "$TRACE_LOG"
    exit 0
fi

# -------------------------
# GLOBAL STATE
# -------------------------
TRACE_PID=""
CLEANUP_DONE=0
CMD_TIMEOUT_SHORT=1
CMD_TIMEOUT_LONG=2

# -------------------------
# LOGGING
# -------------------------
log_milestone() {
    local msg="$1"
    echo "→ MILESTONE: $msg"
    echo "→ MILESTONE: $msg" >> "$TRACE_LOG"
    
    if [[ -f "$TRACE_LOG" ]]; then
        echo "[SYSTEM SNAPSHOT @ $(date +%H:%M:%S)]" >> "$TRACE_LOG"
        journalctl -n 5 --no-pager -u NetworkManager -t kernel | grep -E "wlp|b43|wl0|NetworkManager" >> "$TRACE_LOG" 2>/dev/null || true
        echo "------------------------------------" >> "$TRACE_LOG"
    fi
}

# -------------------------
# CLEANUP
# -------------------------
cleanup() {
    if [[ "$CLEANUP_DONE" -eq 1 ]]; then return 0; fi
    CLEANUP_DONE=1
    log_milestone "CLEANUP_START"
    [[ -n "${TRACE_PID:-}" ]] && { kill "$TRACE_PID" 2>/dev/null || true; wait "$TRACE_PID" 2>/dev/null || true; }
    log_milestone "CLEANUP_END"
}
trap cleanup EXIT INT TERM

# -------------------------
# HEALTH CHECK
# -------------------------
system_is_healthy() {
    local net_state
    net_state=$(timeout "$CMD_TIMEOUT_SHORT" nmcli networking connectivity 2>/dev/null || echo "unknown")
    [[ "$net_state" != "none" ]] || return 1

    local status
    status="$(timeout "$CMD_TIMEOUT_SHORT" nmcli -t -f DEVICE,STATE device 2>/dev/null || true)"
    echo "$status" | awk -F: '$2 ~ /connected/ && $1 != "lo" {found=1} END{exit !found}'
}

# -------------------------
# NM HELPERS
# -------------------------
wifi_rescan() {
    local iface="$1"
    ip link set "$iface" up 2>/dev/null || true
    nmcli dev wifi rescan ifname "$iface" 2>/dev/null || true
    sleep 1
}

get_wifi_profiles_sorted() {
    # Returns priority:name
    nmcli -t -f NAME,TYPE,connection.autoconnect-priority connection show 2>/dev/null \
        | awk -F: '$2=="wifi" {prio=$3; if(prio=="") prio=0; print prio ":" $1}' \
        | sort -t: -k1,1nr
}

profile_matches_iface() {
    local conn="$1"
    local iface="$2"
    local bound_iface
    bound_iface=$(nmcli -g connection.interface-name connection show "$conn" 2>/dev/null || true)
    [[ -z "$bound_iface" ]] || [[ "$bound_iface" == "$iface" ]]
}

# -------------------------
# RECOVERY ACTIONS
# -------------------------
perform_recovery() {
    log_milestone "RECOVERY_EXECUTION_START"

    # 1. Force Networking ON (Fixes "Enable Networking" unchecked)
    echo "→ Restoring global networking states..."
    rfkill unblock all 2>/dev/null || true
    nmcli networking on 2>/dev/null || true
    nmcli radio all on 2>/dev/null || true

    # 1b. Quarantine Ethernet (Prevents 'Local Choice' deauth due to flapping tg3)
    local ETH_IFACE
    ETH_IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^en|^eth' | head -n1 || echo "")
    if [[ -n "$ETH_IFACE" ]]; then
        echo "→ Quarantining Ethernet ($ETH_IFACE) to stabilize Wi-Fi..."
        nmcli device set "$ETH_IFACE" managed no 2>/dev/null || true
        ip link set "$ETH_IFACE" down 2>/dev/null || true
    fi

    # 2. Ensure NetworkManager is running
    systemctl is-active --quiet NetworkManager || systemctl start NetworkManager

    # 3. Interface Setup
    local IFACE
    IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
    if [[ -n "$IFACE" ]]; then
        nmcli device set "$IFACE" managed yes 2>/dev/null || true
        ip link set "$IFACE" up 2>/dev/null || true
        iw dev "$IFACE" set power_save off 2>/dev/null || true
        log_milestone "INTERFACE_MANAGED_AND_UP"
    else
        log_milestone "NO_WIFI_INTERFACE_FOUND"
        return 1
    fi

    # 4. Firmware Injection
    if [[ ! -d "/usr/lib/firmware/b43" ]] || [[ -z "$(ls -A /usr/lib/firmware/b43 2>/dev/null)" ]]; then
        if [[ -d "$BUNDLE_DIR" ]] && [[ -n "$(ls -A "$BUNDLE_DIR"/*.fw 2>/dev/null)" ]]; then
            mkdir -p /usr/lib/firmware/b43
            cp "$BUNDLE_DIR"/*.fw /usr/lib/firmware/b43/
            log_milestone "FIRMWARE_INJECTED"
        fi
    fi

    # 5. Driver Strategy
    if [[ -f "$MANIFEST_DB" ]]; then
        STRATEGY=$(grep -i "14e4:4331" "$MANIFEST_DB" | awk -F: '{print $3}' | head -n1 || echo "")
        if [[ -n "$STRATEGY" ]] && ! lsmod | grep -q "$STRATEGY"; then
            modprobe "$STRATEGY" allhwsupport=1 || true
        fi
    fi

    # 6. Deterministic Reconnect (The Critical Fix)
    log_milestone "PROFILE_RECONNECT_START"
    wifi_rescan "$IFACE"

    local entries
    entries="$(get_wifi_profiles_sorted)"
    if [[ -n "$entries" ]]; then
        while IFS=: read -r prio conn; do
            [[ -z "$conn" ]] && continue
            if profile_matches_iface "$conn" "$IFACE"; then
                echo "→ Attempting profile: $conn (prio=$prio)"
                nmcli connection down "$conn" 2>/dev/null || true
                sleep 0.5
                if nmcli connection up "$conn" ifname "$IFACE" 2>/dev/null; then
                    log_milestone "NM_PROFILE_CONNECT_SUCCESS:$conn"
                    break
                fi
                sleep 1
            fi
        done <<< "$entries"
    else
        log_milestone "NO_SAVED_PROFILES_FOUND"
    fi

    # 7. Final verification loop
    for i in {1..10}; do
        if system_is_healthy; then
            # Restore Ethernet management after Wi-Fi is stable
            if [[ -n "${ETH_IFACE:-}" ]]; then
                nmcli device set "$ETH_IFACE" managed yes 2>/dev/null || true
            fi
            log_milestone "RECOVERY_SUCCESS"
            return 0
        fi
        sleep 1
    done

    log_milestone "RECOVERY_FAILED"
    return 1
}

# -------------------------
# MAIN
# -------------------------
main() {
    # Argument Parsing
    while [[ $# -gt 0 ]]; do
        case $1 in
            --workspace) WORKSPACE_DIR="$2"; shift 2 ;;
            --check-only) exit 0 ;;
            --power-save-on) 
                IFACE=$(ls /sys/class/net | grep -E '^wl' | head -n1 || true)
                [[ -n "$IFACE" ]] && iw dev "$IFACE" set power_save on 2>/dev/null
                exit 0 ;;
            --power-save-off)
                IFACE=$(ls /sys/class/net | grep -E '^wl' | head -n1 || true)
                [[ -n "$IFACE" ]] && iw dev "$IFACE" set power_save off 2>/dev/null
                exit 0 ;;
            *) shift ;;
        esac
    done

    log_milestone "DIAGNOSTIC_START"
    if system_is_healthy; then
        log_milestone "network=connected"
        return 0
    fi

    log_milestone "network=degraded"
    perform_recovery
}

main "$@"
exit $?
