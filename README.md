# Broadcom BCM4331 Wi-Fi Recovery Kit (v36)

## Overview
This kit provides a deterministic, non-blocking recovery and diagnostic system for Broadcom (b43) wireless hardware, specifically optimized for Fedora 43+ environments.

## Key Features
- **Autonomous Recovery**: Automatically detects degraded states (e.g., networking disabled, unmanaged interfaces) and applies repairs.
- **Deterministic Execution**: Hard timeouts on all system calls to prevent indefinite hangs.
- **Non-Recursive Cleanup**: Hardened signal handling to ensure clean exits without segmentation faults.
- **Full Observability**: Comprehensive milestone logging and real-time diagnostic snapshots.

## Architecture
- `fix-wifi.sh`: Primary execution entrypoint with autonomous recovery logic.
- `manifest.db`: Hardware-to-driver mapping database.
- `prepare-bundle.sh`: Script to fetch firmware and tools for offline use.
- `verbatim_handshake.log`: Detailed execution and system log.

## Usage
1. **Prepare**: Run `./prepare-bundle.sh` to fetch required blobs.
2. **Execute**: Run `sudo ./fix-wifi.sh`.
3. **Audit**: Review `verbatim_handshake.log` for detailed diagnostics.

## Behavior Guarantees
- ❌ Never hangs indefinitely.
- ❌ Never requires manual interruption (Ctrl-C).
- ✅ Recovers from "Enable Networking" being unchecked.
- ✅ Injects firmware and reloads drivers only when necessary.
