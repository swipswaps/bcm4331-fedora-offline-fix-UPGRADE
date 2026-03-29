#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# File: fix-wifi.sh (v46 - AUTH-AWARE + DETERMINISTIC RECOVERY + NM-CONSISTENT)
# -----------------------------------------------------------------------------

set -uo pipefail

# -------------------------
# ROOT ESCALATION
# -------------------------
# REQUIREMENT: Explicitly pass PROJECT_ROOT through sudo to prevent environment stripping
if [[ $EUID -ne 0 ]]; then 
    exec sudo PROJECT_ROOT="${PROJECT_ROOT:-}" "$0" "$@"
fi

# -------------------------
# SAFE PATH RESOLUTION
# -------------------------
WORKSPACE_DIR=""
TRACE_LOG=""
MANIFEST_DB=""
BUNDLE_DIR=""
DISABLE_FLAG=""

# Helper to lock paths once workspace is known
lock_paths() {
    local ws="$1"
    # REQUIREMENT: Do not allow 'silent' path resolution. 
    if [[ -z "$ws" ]]; then
        echo "ERROR: No workspace provided (via PROJECT_ROOT or --workspace)." >&2
        exit 1
    fi
    if [[ "$ws" != /* ]]; then
        echo "ERROR: Workspace path must be absolute. Got: $ws" >&2
        exit 1
    fi
    WORKSPACE_DIR="$ws"
    TRACE_LOG="$WORKSPACE_DIR/verbatim_handshake.log"
    MANIFEST_DB="$WORKSPACE_DIR/manifest.db"
    BUNDLE_DIR="$WORKSPACE_DIR/offline_bundle"
    DISABLE_FLAG="$WORKSPACE_DIR/.fix-wifi.disabled"
    
    # REQUIREMENT: First line of output must be the log path
    # We only print this once we are sure we are in the final root process
    echo "LOG_PATH: $TRACE_LOG"
}

# -------------------------
# ARGUMENT PARSING (EARLY)
# -------------------------
# We parse arguments BEFORE the mandatory check to allow --workspace to satisfy the requirement
TEMP_WORKSPACE="${PROJECT_ROOT:-}"
FORCE_RUN=0
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
    case $1 in
        --workspace) TEMP_WORKSPACE="$2"; shift 2 ;;
        --force) FORCE_RUN=1; shift ;;
        --check-only) CHECK_ONLY=1; shift ;;
        *) shift ;;
    esac
done

# REQUIREMENT: Fail if no workspace can be determined
lock_paths "$TEMP_WORKSPACE"

if [[ "$CHECK_ONLY" -eq 1 ]]; then exit 0; fi

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
# REMOVED set -e to prevent silent crashes on non-fatal command failures
set -uo pipefail 

TRACE_PID=""
CLEANUP_DONE=0
CMD_TIMEOUT_SHORT=1
CMD_TIMEOUT_LONG=2

# -------------------------
# VERBATIM LOGGING
# -------------------------
# Helper to run commands and tee output verbatim
run_verbatim() {
    local cmd="$*"
    # REQUIREMENT: Print absolute path of log as first line (already done in lock_paths)
    # REQUIREMENT: tee display verbatim all relevant normally hidden messages
    echo "→ EXECUTING: $cmd" | tee -a "$TRACE_LOG"
    # Execute and capture both stdout and stderr, teeing to log and terminal
    # Use eval to handle quotes in commands correctly
    eval "$cmd" 2>&1 | tee -a "$TRACE_LOG"
    local exit_code=${PIPESTATUS[0]}
    if [[ $exit_code -ne 0 ]]; then
        echo "  ❌ COMMAND FAILED (exit $exit_code)" | tee -a "$TRACE_LOG"
    else
        echo "  ✅ COMMAND SUCCESS" | tee -a "$TRACE_LOG"
    fi
    return $exit_code
}

log_milestone() {
    local msg="$1"
    # REQUIREMENT: tee display verbatim milestones to terminal and log
    echo "→ MILESTONE: $msg" | tee -a "$TRACE_LOG"
    
    if [[ -f "$TRACE_LOG" ]]; then
        echo "[SYSTEM SNAPSHOT @ $(date)]" >> "$TRACE_LOG"
        journalctl -n 10 --no-pager -u NetworkManager -t kernel | grep -E "wlp|b43|wl0|NetworkManager|tg3|enp|eth" >> "$TRACE_LOG" 2>/dev/null || true
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
    run_verbatim "ip link set $iface up"
    run_verbatim "nmcli dev wifi rescan ifname $iface"
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

    # 1. Force Networking ON
    echo "→ Restoring global networking states..."
    run_verbatim "rfkill unblock all" || true
    run_verbatim "nmcli networking on" || true
    run_verbatim "nmcli radio all on" || true

    # 1b. Quarantine Ethernet
    local ETH_IFACE
    ETH_IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^en|^eth' | head -n1 || echo "")
    if [[ -n "$ETH_IFACE" ]]; then
        log_milestone "QUARANTINE_ETHERNET_START:$ETH_IFACE"
        echo "→ Quarantining Ethernet ($ETH_IFACE) to stabilize Wi-Fi..."
        run_verbatim "nmcli device set \"$ETH_IFACE\" managed no" || true
        run_verbatim "ip link set \"$ETH_IFACE\" down" || true
        log_milestone "QUARANTINE_ETHERNET_SUCCESS"
    fi

    # 2. Ensure NetworkManager is running
    run_verbatim "systemctl start NetworkManager"

    # 3. Interface Setup
    local IFACE
    IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
    if [[ -n "$IFACE" ]]; then
        run_verbatim "nmcli device set \"$IFACE\" managed yes"
        run_verbatim "ip link set \"$IFACE\" up"
        run_verbatim "iw dev \"$IFACE\" set power_save off"
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
                log_milestone "NM_CONNECT_ATTEMPT:$conn"
                # RESILIENT: Don't let a failed 'down' kill the script
                run_verbatim "nmcli connection down \"$conn\"" || true
                sleep 0.5
                # Added timeout to prevent hanging, with verbatim output
                if timeout 15 run_verbatim "nmcli connection up \"$conn\" ifname \"$IFACE\""; then
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
    for i in {1..15}; do
        if system_is_healthy; then
            log_milestone "RECOVERY_SUCCESS"
            # We do NOT restore Ethernet here. We keep it quarantined until the user
            # manually re-enables it or reboots, to prevent flapping from killing the link again.
            echo "→ Wi-Fi stable. Ethernet ($ETH_IFACE) remains quarantined for stability."
            log_milestone "ETHERNET_REMAINS_QUARANTINED"
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
    if [[ "$FORCE_RUN" -eq 1 ]]; then
        # Truncate log on force run to ensure we see fresh data
        echo "=== TRACE START $(date) ===" > "$TRACE_LOG"
    fi

    log_milestone "DIAGNOSTIC_START"
    
    # If force is NOT passed, check health and exit if okay
    if [[ "$FORCE_RUN" -eq 0 ]]; then
        if system_is_healthy; then
            log_milestone "network=connected"
            return 0
        fi
        log_milestone "network=degraded"
    else
        log_milestone "FORCE_RECOVERY_REQUESTED"
    fi

    perform_recovery
}

main
exit $?
