#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# File: fix-wifi.sh (v80 - FORENSIC ORCHESTRATOR + AUTO-FIX + VERBATIM)
# -----------------------------------------------------------------------------

# NUCLEAR: Absolute transparency from the first line
set -x
set -E
set -T

# -------------------------
# DATABASE ENGINE (SQLite)
# -------------------------
# REQUIREMENT: Use cutting edge best practices database tools for recoverability
init_db() {
    local db_path="$1"
    [[ -z "$db_path" ]] && return
    sqlite3 "$db_path" <<EOF
CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    name TEXT,
    details TEXT
);
CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    command TEXT,
    exit_code INTEGER,
    output_preview TEXT
);
CREATE TABLE IF NOT EXISTS network_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    interface TEXT,
    state TEXT,
    signal_strength INTEGER
);
EOF
}

db_log_milestone() {
    local name="$1"
    local details="$2"
    [[ -z "$MANIFEST_DB" ]] && return
    sqlite3 "$MANIFEST_DB" "INSERT INTO milestones (name, details) VALUES ('$name', '$details');" 2>/dev/null || true
}

db_log_command() {
    local cmd="$1"
    local code="$2"
    local output="$3"
    [[ -z "$MANIFEST_DB" ]] && return
    # Escape single quotes for SQL
    local safe_cmd="${cmd//\'/\'\'}"
    local safe_output="${output//\'/\'\'}"
    sqlite3 "$MANIFEST_DB" "INSERT INTO commands (command, exit_code, output_preview) VALUES ('$safe_cmd', $code, '$safe_output');" 2>/dev/null || true
}

# -------------------------
# TRANSPARENCY ENGINE (Kali-Inspired)
# -------------------------
# REQUIREMENT: Absolute visibility into the execution stack
dump_stack() {
    local i=0
    {
        echo "--- STACK TRACE ---"
        while frame=$(caller $i); do
            echo "  at $frame"
            ((i++))
        done
        echo "-------------------"
    } | tee -a "$TRACE_LOG" 2>/dev/null || true
}

# REQUIREMENT: Log every command before execution with its context
# We use a DEBUG trap for this. It logs to the file to avoid terminal flooding,
# but run_verbatim ensures the user sees the actual execution.
trap_debug() {
    local cmd="$BASH_COMMAND"
    local line="$1"
    [[ "$cmd" == "trap_debug"* ]] && return
    [[ "$cmd" == "dump_stack"* ]] && return
    echo "[EXEC @ Line $line]: $cmd" >> "$TRACE_LOG" 2>/dev/null || true
}

# REQUIREMENT: Background monitors for network events (Kali-style sniffing)
start_monitors() {
    echo "DEBUG: Starting background monitors..." | tee -a "$TRACE_LOG" 2>/dev/null || true
    
    # Monitor NetworkManager events
    (
        echo "=== NM MONITOR START $(date) ==="
        nmcli monitor
    ) >> "$TRACE_LOG" 2>&1 &
    NM_MON_PID=$!
    
    # Monitor IP address changes
    (
        echo "=== IP MONITOR START $(date) ==="
        ip monitor all
    ) >> "$TRACE_LOG" 2>&1 &
    IP_MON_PID=$!
    
    # Monitor Kernel messages (sniffing for driver issues)
    (
        echo "=== KERNEL MONITOR START $(date) ==="
        journalctl -f -k -t kernel --no-pager
    ) >> "$TRACE_LOG" 2>&1 &
    K_MON_PID=$!

    # Handshake Heartbeat
    (
        echo "=== HANDSHAKE HEARTBEAT START $(date) ==="
        while true; do
            echo "[HEARTBEAT @ $(date)]: $(nmcli -t -f DEVICE,STATE device | grep connected || echo 'disconnected')"
            sleep 30
        done
    ) >> "$TRACE_LOG" 2>&1 &
    HB_MON_PID=$!
    
    echo "DEBUG: Monitors started (PIDs: $NM_MON_PID $IP_MON_PID $K_MON_PID $HB_MON_PID)" | tee -a "$TRACE_LOG" 2>/dev/null || true
}

stop_monitors() {
    echo "DEBUG: Stopping background monitors..." | tee -a "$TRACE_LOG" 2>/dev/null || true
    [[ -n "${NM_MON_PID:-}" ]] && kill "$NM_MON_PID" 2>/dev/null || true
    [[ -n "${IP_MON_PID:-}" ]] && kill "$IP_MON_PID" 2>/dev/null || true
    [[ -n "${K_MON_PID:-}" ]] && kill "$K_MON_PID" 2>/dev/null || true
    [[ -n "${SNIFF_PID:-}" ]] && kill "$SNIFF_PID" 2>/dev/null || true
    [[ -n "${SIG_MON_PID:-}" ]] && kill "$SIG_MON_PID" 2>/dev/null || true
    [[ -n "${RES_MON_PID:-}" ]] && kill "$RES_MON_PID" 2>/dev/null || true
    [[ -n "${HB_MON_PID:-}" ]] && kill "$HB_MON_PID" 2>/dev/null || true
}

# -------------------------
# ROOT ESCALATION
# -------------------------
# REQUIREMENT: Explicitly pass PROJECT_ROOT through sudo to prevent environment stripping
echo "DEBUG: Checking root status (UID: $UID)"
if [[ $EUID -ne 0 ]]; then 
    echo "DEBUG: Not root, escalating via sudo..."
    exec sudo PROJECT_ROOT="${PROJECT_ROOT:-}" "$0" "$@"
fi
echo "DEBUG: Running as root"

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
    echo "DEBUG: Entering lock_paths (ws: $ws)" | tee -a "$TRACE_LOG" 2>/dev/null || true
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
    MANIFEST_DB="$WORKSPACE_DIR/recovery_state.db"
    BUNDLE_DIR="$WORKSPACE_DIR/offline_bundle"
    DISABLE_FLAG="$WORKSPACE_DIR/.fix-wifi.disabled"
    
    # Initialize Database
    init_db "$MANIFEST_DB"
    
    # REQUIREMENT: First line of output must be the log path
    # We only print this once we are sure we are in the final root process
    echo "LOG_PATH: $TRACE_LOG"
    echo "DEBUG: Exiting lock_paths (TRACE_LOG: $TRACE_LOG)" | tee -a "$TRACE_LOG" 2>/dev/null || true
}

# -------------------------
# ARGUMENT PARSING (EARLY)
# -------------------------
# We parse arguments BEFORE the mandatory check to allow --workspace to satisfy the requirement
echo "DEBUG: Parsing arguments (Args: $*)"
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
echo "DEBUG: Finalizing paths with workspace: $TEMP_WORKSPACE"
lock_paths "$TEMP_WORKSPACE"

# Initialize Transparency Engine
trap 'trap_debug $LINENO' DEBUG
trap 'dump_stack' ERR

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
# NUCLEAR RESILIENCE: Explicitly disable all exit-on-error and unbound-variable behaviors
set +e
set +o pipefail
set +u 

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
    echo "DEBUG: Entering run_verbatim (cmd: $cmd)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    # REQUIREMENT: Print absolute path of log as first line (already done in lock_paths)
    # REQUIREMENT: tee display verbatim all relevant normally hidden messages
    echo "→ EXECUTING: $cmd" | tee -a "$TRACE_LOG" 2>/dev/null || echo "→ EXECUTING: $cmd"
    # Execute and capture both stdout and stderr, teeing to log and terminal
    # Use eval to handle quotes in commands correctly
    local output
    output=$(eval "$cmd" 2>&1 | tee -a "$TRACE_LOG" 2>/dev/null || eval "$cmd")
    local exit_code=${PIPESTATUS[0]}
    
    # Log to Database
    db_log_command "$cmd" "$exit_code" "${output:0:500}"
    
    if [[ $exit_code -ne 0 ]]; then
        echo "  ❌ COMMAND FAILED (exit $exit_code)" | tee -a "$TRACE_LOG" 2>/dev/null || true
        dump_stack
    else
        echo "  ✅ COMMAND SUCCESS" | tee -a "$TRACE_LOG" 2>/dev/null || true
    fi
    sync 2>/dev/null || true
    echo "DEBUG: Exiting run_verbatim" | tee -a "$TRACE_LOG" 2>/dev/null || true
    return $exit_code
}

log_milestone() {
    local msg="$1"
    echo "DEBUG: Entering log_milestone (msg: $msg)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    # REQUIREMENT: tee display verbatim milestones to terminal and log
    echo "→ MILESTONE: $msg" | tee -a "$TRACE_LOG" || true
    
    # Log to Database
    db_log_milestone "$msg" "System snapshot triggered"

    if [[ -f "$TRACE_LOG" ]]; then
        {
            echo "[SYSTEM SNAPSHOT @ $(date)]"
            echo "HEARTBEAT: Script is active at $(date)"
            journalctl -n 10 --no-pager -u NetworkManager -t kernel 2>/dev/null | grep -E "wlp|b43|wl0|NetworkManager|tg3|enp|eth" || true
            echo "------------------------------------"
        } >> "$TRACE_LOG" 2>/dev/null || true
    fi
    echo "DEBUG: Exiting log_milestone" | tee -a "$TRACE_LOG" 2>/dev/null || true
}

# Helper for debug logging that always goes to the log
log_debug() {
    local msg="$1"
    echo "DEBUG: Entering log_debug (msg: $msg)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    # Print to console for real-time tracking during debugging
    echo "DEBUG: $msg" | tee -a "$TRACE_LOG" 2>/dev/null || echo "DEBUG: $msg"
    sync 2>/dev/null || true
    echo "DEBUG: Exiting log_debug" | tee -a "$TRACE_LOG" 2>/dev/null || true
}

# -------------------------
# CLEANUP
# -------------------------
cleanup() {
    local exit_code=$?
    if [[ "$CLEANUP_DONE" -eq 1 ]]; then return 0; fi
    CLEANUP_DONE=1
    # NUCLEAR: Log why we are cleaning up
    echo "DEBUG: Cleanup triggered (Exit Code: $exit_code)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    log_milestone "CLEANUP_START"
    stop_monitors
    [[ -n "${TRACE_PID:-}" ]] && { kill "$TRACE_PID" 2>/dev/null || true; wait "$TRACE_PID" 2>/dev/null || true; }
    sync 2>/dev/null || true
    log_milestone "CLEANUP_END"
}
trap cleanup EXIT INT TERM

# -------------------------
# HEALTH CHECK
# -------------------------
log_system_snapshot() {
    local label="$1"
    {
        echo "=== SYSTEM SNAPSHOT: $label @ $(date) ==="
        echo "--- INTERFACES ---"
        ip -br addr show || true
        echo "--- NM DEVICES ---"
        nmcli device status || true
        echo "--- DRIVERS ---"
        lsmod | grep -E "b43|wl|tg3|enp|eth" || true
        echo "--- RFKILL ---"
        rfkill list || true
        echo "------------------------------------"
    } >> "$TRACE_LOG" 2>/dev/null || true
}

check_dependencies() {
    echo "DEBUG: Checking dependencies..." | tee -a "$TRACE_LOG" 2>/dev/null || true
    local deps=("nmcli" "ip" "journalctl" "timeout" "awk" "sort" "cut" "grep" "lsmod" "modprobe" "rfkill" "systemctl" "iw" "sqlite3" "arping" "chronyc")
    local missing=()
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            echo "  ⚠️ WARNING: Dependency '$dep' is missing!" | tee -a "$TRACE_LOG" 2>/dev/null || true
            missing+=("$dep")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "🛰️ Attempting automated dependency installation (dnf)..." | tee -a "$TRACE_LOG" 2>/dev/null || true
        local pkgs=()
        for m in "${missing[@]}"; do
            case $m in
                sqlite3) pkgs+=("sqlite") ;;
                arping) pkgs+=("iputils") ;;
                chronyc) pkgs+=("chrony") ;;
                *) pkgs+=("$m") ;;
            esac
        done
        run_verbatim "dnf install -y ${pkgs[*]}" || echo "❌ Automated install failed. Please install manually: ${pkgs[*]}"
    fi

    local optional_deps=("tcpdump" "mtr" "traceroute" "bind-utils" "haveged")
    for dep in "${optional_deps[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            echo "  ℹ️ INFO: Optional dependency '$dep' is missing. Attempting install..." | tee -a "$TRACE_LOG" 2>/dev/null || true
            run_verbatim "dnf install -y $dep" || true
        fi
    done
}

# -------------------------
# FORENSIC AUDIT TOOLS
# -------------------------
forensic_entropy_audit() {
    log_milestone "ENTROPY_AUDIT_START"
    local entropy
    entropy=$(cat /proc/sys/kernel/random/entropy_avail 2>/dev/null || echo "0")
    echo "→ Available Entropy: $entropy" | tee -a "$TRACE_LOG"
    if [[ "$entropy" -lt 1000 ]]; then
        echo "⚠️ Low entropy detected. Boosting..." | tee -a "$TRACE_LOG"
        run_verbatim "systemctl start haveged" || true
    fi
}

forensic_time_audit() {
    log_milestone "TIME_AUDIT_START"
    echo "→ System Time: $(date)" | tee -a "$TRACE_LOG"
    if command -v chronyc &>/dev/null; then
        run_verbatim "chronyc tracking" || true
        run_verbatim "chronyc -a makestep" || true
    fi
}

forensic_arp_audit() {
    local iface="$1"
    [[ -z "$iface" ]] && return
    log_milestone "ARP_AUDIT_START"
    echo "→ Scanning local neighbors..." | tee -a "$TRACE_LOG"
    run_verbatim "ip neighbor show" || true
}

forensic_wpa_audit() {
    log_milestone "WPA_AUDIT_START"
    echo "→ Inspecting wpa_supplicant state..." | tee -a "$TRACE_LOG"
    run_verbatim "systemctl status wpa_supplicant" || true
    run_verbatim "journalctl -n 50 -u wpa_supplicant --no-pager" || true
}

verify_handshake() {
    echo "DEBUG: Verifying forensic handshake..." | tee -a "$TRACE_LOG" 2>/dev/null || true
    log_milestone "FORENSIC_HANDSHAKE_START"
    
    # Audit environment before testing
    forensic_entropy_audit
    forensic_time_audit
    
    local success=0
    
    # 1. ICMP Handshake
    if run_verbatim "ping -c 3 8.8.8.8"; then
        ((success++))
    fi
    
    # 2. DNS Handshake (IP)
    if run_verbatim "dig +short google.com @8.8.8.8"; then
        ((success++))
    fi
    
    # 3. DNS Handshake (System)
    if run_verbatim "dig +short google.com"; then
        ((success++))
    fi
    
    # 4. Path Forensic (Traceroute)
    run_verbatim "traceroute -m 10 8.8.8.8" || true
    
    # 5. Network Quality (MTR)
    run_verbatim "mtr -r -c 1 8.8.8.8" || true
    
    # 6. ARP Forensic
    local IFACE
    IFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -n1 || echo "")
    forensic_arp_audit "$IFACE"

    if [[ $success -ge 2 ]]; then
        echo "  ✅ FORENSIC HANDSHAKE VERIFIED ($success/3 tests passed)" | tee -a "$TRACE_LOG" 2>/dev/null || true
        log_milestone "FORENSIC_HANDSHAKE_SUCCESS"
        return 0
    fi
    
    echo "  ❌ FORENSIC HANDSHAKE FAILED ($success/3 tests passed)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    log_milestone "FORENSIC_HANDSHAKE_FAILED"
    return 1
}

system_is_healthy() {
    echo "DEBUG: Entering system_is_healthy" | tee -a "$TRACE_LOG" 2>/dev/null || true
    local net_state
    net_state=$(timeout "$CMD_TIMEOUT_SHORT" nmcli networking connectivity 2>/dev/null || echo "unknown")
    if [[ "$net_state" == "none" ]]; then
        echo "DEBUG: system_is_healthy returning 1 (connectivity: none)" | tee -a "$TRACE_LOG" 2>/dev/null || true
        return 1
    fi

    local status
    status="$(timeout "$CMD_TIMEOUT_SHORT" nmcli -t -f DEVICE,STATE device 2>/dev/null || true)"
    if echo "$status" | awk -F: '$2 ~ /connected/ && $1 != "lo" {found=1} END{exit !found}'; then
        echo "DEBUG: system_is_healthy returning 0" | tee -a "$TRACE_LOG" 2>/dev/null || true
        return 0
    fi
    echo "DEBUG: system_is_healthy returning 1 (no connected device)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    return 1
}

# -------------------------
# NM HELPERS
# -------------------------
wifi_rescan() {
    local iface="$1"
    echo "DEBUG: Entering wifi_rescan (iface: $iface)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    run_verbatim "ip link set $iface up"
    run_verbatim "nmcli dev wifi rescan ifname $iface"
    sleep 1
    echo "DEBUG: Exiting wifi_rescan" | tee -a "$TRACE_LOG" 2>/dev/null || true
}

get_wifi_profiles_sorted() {
    echo "DEBUG: Entering get_wifi_profiles_sorted" | tee -a "$TRACE_LOG" 2>/dev/null || true
    # Returns priority:name
    local res
    res=$(nmcli -t -f NAME,TYPE,connection.autoconnect-priority connection show 2>/dev/null \
        | awk -F: '$2=="wifi" {prio=$3; if(prio=="") prio=0; print prio ":" $1}' \
        | sort -t: -k1,1nr)
    echo "DEBUG: get_wifi_profiles_sorted returning: $res" | tee -a "$TRACE_LOG" 2>/dev/null || true
    echo "$res"
}

profile_matches_iface() {
    local conn="$1"
    local iface="$2"
    echo "DEBUG: Entering profile_matches_iface (conn: $conn, iface: $iface)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    local bound_iface
    bound_iface=$(nmcli -g connection.interface-name connection show "$conn" 2>/dev/null || true)
    if [[ -z "$bound_iface" ]] || [[ "$bound_iface" == "$iface" ]]; then
        echo "DEBUG: profile_matches_iface returning 0" | tee -a "$TRACE_LOG" 2>/dev/null || true
        return 0
    fi
    echo "DEBUG: profile_matches_iface returning 1" | tee -a "$TRACE_LOG" 2>/dev/null || true
    return 1
}

# -------------------------
# RECOVERY ACTIONS
# -------------------------
perform_recovery() {
    echo "DEBUG: Entering perform_recovery" | tee -a "$TRACE_LOG" 2>/dev/null || true
    log_milestone "RECOVERY_EXECUTION_START"
    log_system_snapshot "RECOVERY_START"
    check_system_integrity
    start_monitors
    
    # Start resource monitor
    (
        echo "=== RESOURCE MONITOR START $(date) ==="
        while true; do
            echo "[RES @ $(date)]: $(uptime) | $(free -h | grep Mem)"
            sleep 10
        done
    ) >> "$TRACE_LOG" 2>&1 &
    RES_MON_PID=$!

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

        # Start packet sniffing for transparency (Kali-style)
        if command -v tcpdump &>/dev/null; then
            (
                echo "=== PACKET SNIFFER START $(date) ==="
                tcpdump -i "$IFACE" -n -l port 67 or port 68 or port 53
            ) >> "$TRACE_LOG" 2>&1 &
            SNIFF_PID=$!
            echo "DEBUG: Packet sniffer started (PID: $SNIFF_PID)" | tee -a "$TRACE_LOG" 2>/dev/null || true
        fi

        # Start signal monitor
        (
            echo "=== SIGNAL MONITOR START $(date) ==="
            while true; do
                nmcli -f IN-USE,SSID,BARS,SIGNAL dev wifi list ifname "$IFACE" | grep "*" || true
                sleep 5
            done
        ) >> "$TRACE_LOG" 2>&1 &
        SIG_MON_PID=$!
        echo "DEBUG: Signal monitor started (PID: $SIG_MON_PID)" | tee -a "$TRACE_LOG" 2>/dev/null || true
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
    log_debug "Step 6a: Starting wifi_rescan..."
    wifi_rescan "$IFACE" || true
    log_debug "Step 6b: wifi_rescan finished."

    local entries
    log_debug "Step 6c: Gathering profiles..."
    # NUCLEAR: Ensure the subshell itself doesn't return error status
    entries=$( (nmcli -t -f NAME,TYPE,connection.autoconnect-priority connection show | grep ":wifi:" | sort -t: -k3,3nr | cut -d: -f1,3) || echo "" )
    log_debug "Step 6d: Profiles gathered: ${entries:-EMPTY}"
    
    if [[ -n "$entries" ]]; then
        log_debug "Step 6e: Entering profile loop..."
        while IFS=: read -r conn prio; do
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
        if system_is_healthy && verify_handshake; then
            log_milestone "RECOVERY_SUCCESS"
            log_system_snapshot "RECOVERY_SUCCESS"
            # We do NOT restore Ethernet here. We keep it quarantined until the user
            # manually re-enables it or reboots, to prevent flapping from killing the link again.
            echo "→ Wi-Fi stable. Ethernet ($ETH_IFACE) remains quarantined for stability."
            log_milestone "ETHERNET_REMAINS_QUARANTINED"
            echo "DEBUG: Exiting perform_recovery (SUCCESS)" | tee -a "$TRACE_LOG" 2>/dev/null || true
            return 0
        fi
        sleep 1
    done

    log_milestone "RECOVERY_FAILED"
    log_system_snapshot "RECOVERY_FAILED"
    echo "DEBUG: Exiting perform_recovery (FAILED)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    return 1
}

# -------------------------
# MAIN
# -------------------------
main() {
    echo "DEBUG: Starting main (Shell: $BASH_VERSION)" | tee -a "$TRACE_LOG" 2>/dev/null || true
    check_dependencies
    if [[ "$FORCE_RUN" -eq 1 ]]; then
        # Truncate log on force run to ensure we see fresh data
        echo "=== TRACE START $(date) ===" > "$TRACE_LOG"
    fi
    echo "DEBUG: TRACE_LOG is $TRACE_LOG" | tee -a "$TRACE_LOG" 2>/dev/null || true

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

    echo "DEBUG: Calling perform_recovery" | tee -a "$TRACE_LOG" 2>/dev/null || true
    perform_recovery
    local res=$?
    echo "DEBUG: perform_recovery returned $res" | tee -a "$TRACE_LOG" 2>/dev/null || true
    return $res
}

# -------------------------
# EXECUTION
# -------------------------
echo "DEBUG: Calling main" | tee -a "$TRACE_LOG" 2>/dev/null || true
main
exit $?
