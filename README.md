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

4. **Configure Sudo (Recommended for Seamless UI)**:
   By default, the server will prompt for your sudo password in the terminal when a fix is triggered. To allow the web app to trigger fixes silently from the browser, add this to your `/etc/sudoers` (run `sudo visudo` to edit):
   ```text
   # Replace $(whoami) with your actual username (e.g., owner)
   $(whoami) ALL=(ALL) NOPASSWD: /usr/local/bin/fix-wifi, /usr/bin/iw, /usr/bin/nmcli, /usr/bin/rfkill
   ```
   *Note: If you prefer to type your password once, simply run `npm run dev` and the first time you click "Fix" in the UI, you can enter the password in the terminal where the server is running. Sudo will cache this for several minutes.*

5. **Install System-Wide (Optional)**:
   To make the recovery script available globally and ensure it survives updates:
   ```bash
   sudo cp fix-wifi.sh /usr/local/bin/fix-wifi
   sudo restorecon -v /usr/local/bin/fix-wifi
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

### 3. Setup Autonomous Watchdog (Systemd)
To ensure the system fixes itself even if the dashboard isn't open:
```bash
# Create the service
sudo tee /etc/systemd/system/fix-wifi.service << 'EOF'
[Unit]
Description=Broadcom Wi-Fi Recovery Task

[Service]
Type=oneshot
ExecStart=/usr/local/bin/fix-wifi --force
EOF

# Create the timer (runs every 5 minutes)
sudo tee /etc/systemd/system/fix-wifi.timer << 'EOF'
[Unit]
Description=Run Wi-Fi Recovery every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fix-wifi.timer
```

### 4. Install Desktop Entry (Optional)
To make the Control Center launchable from your application menu (GNOME/XFCE/KDE):
```bash
sudo cp broadcom-control.desktop /usr/share/applications/
update-desktop-database ~/.local/share/applications
```
Now you can search for "Broadcom Control Center" in your app menu.

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
