# 🛰️ Broadcom Recovery Kit v38.2

A specialized hardware management and recovery suite for Broadcom Wi-Fi chipsets on Linux (Fedora/X11/GNOME). This tool provides a deterministic way to handle firmware handshake failures, PCIe power management issues, and radio locks.

## 🚀 Features

- **Compact Applet UI**: A native-feeling 320px dropdown menu for quick hardware toggles.
- **Autonomous Recovery**: Background monitoring that detects Wi-Fi drops and triggers a self-heal sequence.
- **Performance Mode**: Granular control over PCIe ASPM (Active State Power Management) to prevent "sleep-to-death" hardware locks.
- **Verbatim Telemetry**: Real-time streaming of kernel events and handshake logs.
- **Offline Bundle**: One-click preparation of firmware and driver packages for air-gapped recovery.

## 🛠️ Prerequisites

This tool interacts with system-level networking components. Ensure your Linux host has the following installed:

- **Node.js** (v18+) & **npm**
- **NetworkManager** (`nmcli`)
- **Wireless Tools** (`iw`, `rfkill`)
- **Sudo Access**: The recovery scripts require root privileges to reload kernel modules and toggle radio states.

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd broadcom-recovery-kit
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set script permissions**:
   ```bash
   chmod +x fix-wifi.sh prepare-bundle.sh
   ```

4. **Configure Sudo (Optional but Recommended)**:
   To allow the web app to trigger fixes without a password prompt, add this to your `/etc/sudoers` (replace `youruser` with your actual username):
   ```text
   youruser ALL=(ALL) NOPASSWD: /path/to/fix-wifi.sh
   ```

## 🏃 Running the Application

### 1. Start the Control Center
```bash
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

### 2. Start the System Tray Applet (X11)
Requires Python 3 and `pystray`:
```bash
# Install python dependencies
pip install pystray pillow requests

# Run the tray bridge
python3 tray_applet.py &
```

## 📂 Project Structure

- `server.ts`: Express backend that bridges the UI to the Linux system bus.
- `src/App.tsx`: React frontend featuring the "Compact Applet" and "Full Dashboard" views.
- `fix-wifi.sh`: The core recovery engine (handles `modprobe`, `nmcli`, and `rfkill`).
- `prepare-bundle.sh`: Logic for creating the offline firmware recovery package.
- `verbatim_handshake.log`: The unified telemetry stream for hardware events.

## ⚠️ Important Notes

- **Cloud vs. Local**: When running in the AI Studio preview, hardware commands are simulated or timed out. For full functionality, run this on a physical Linux host with a Broadcom card.
- **X11 Support**: The Python tray applet is designed for X11 environments. For Wayland, you may need a compatibility layer like `libappindicator`.

---
*Developed for high-reliability hardware management.*
