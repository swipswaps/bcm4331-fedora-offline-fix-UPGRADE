import express from "express";
import { createServer as createViteServer } from "vite";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = (cmd: string, timeout = 3000) => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(cmd, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

const app = express();
const PORT = 3000;
const PROJECT_ROOT = process.env.PROJECT_ROOT;
if (!PROJECT_ROOT) {
  console.error("ERROR: PROJECT_ROOT environment variable must be provided.");
  process.exit(1);
}

const WORKSPACE_DIR = PROJECT_ROOT;
const DISABLE_FLAG = path.join(WORKSPACE_DIR, ".fix-wifi.disabled");
const LOG_FILE = path.join(WORKSPACE_DIR, "verbatim_handshake.log");

// REQUIREMENT: First line of output must be the log path
console.log(`LOG_PATH: ${LOG_FILE}`);

const FIX_SCRIPT = fs.existsSync("/usr/local/bin/fix-wifi") 
  ? "/usr/local/bin/fix-wifi" 
  : path.join(WORKSPACE_DIR, "fix-wifi.sh");

app.use(express.json());

let isFixing = false;
let lastFixError: string | null = null;
let sudoPromptDetected = false;
let logBuffer: string[] = [];
let metricsHistory: { timestamp: string; signal: number; rx: number; tx: number }[] = [];

// Helper to parse signal strength from iw output
const parseSignal = (linkOutput: string): number => {
  const match = linkOutput.match(/signal:\s+(-?\d+)\s+dBm/);
  return match ? parseInt(match[1]) : 0;
};

// Helper to parse RX/TX bytes from iw output
const parseTraffic = (linkOutput: string): { rx: number; tx: number } => {
  const rxMatch = linkOutput.match(/RX:\s+(\d+)\s+bytes/);
  const txMatch = linkOutput.match(/TX:\s+(\d+)\s+bytes/);
  return {
    rx: rxMatch ? parseInt(rxMatch[1]) : 0,
    tx: txMatch ? parseInt(txMatch[1]) : 0
  };
};

// Check if we have passwordless sudo for the fix script
const checkSudoPermissions = async () => {
  try {
    // Check if script exists first
    if (!fs.existsSync(FIX_SCRIPT)) {
      console.warn(`⚠️ System integration missing: ${FIX_SCRIPT} not found.`);
      sudoPromptDetected = true;
      return;
    }

    // Check if executable
    try {
      fs.accessSync(FIX_SCRIPT, fs.constants.X_OK);
    } catch (err) {
      console.warn(`⚠️ System integration error: ${FIX_SCRIPT} is not executable. Attempting to fix...`);
      try {
        fs.chmodSync(FIX_SCRIPT, 0o755);
        console.log(`✅ Fixed permissions for ${FIX_SCRIPT}`);
      } catch (chmodErr) {
        console.error(`❌ Could not fix permissions for ${FIX_SCRIPT}:`, chmodErr);
        sudoPromptDetected = true;
        return;
      }
    }
    
    // Check if sudoers file exists (using sudo to avoid permission issues)
    const sudoersFile = "/etc/sudoers.d/broadcom-control";
    try {
      await execAsync(`sudo -n ls "${sudoersFile}"`, 1000);
      console.log(`ℹ️ Sudoers file ${sudoersFile} found.`);
    } catch (err) {
      console.warn(`ℹ️ Sudoers file ${sudoersFile} missing or inaccessible.`);
    }

    // Diagnostic: Check if any sudo works without password
    try {
      await execAsync("sudo -n true", 1000);
      console.log("ℹ️ Basic passwordless sudo is functional.");
    } catch (err) {
      console.warn("⚠️ Basic passwordless sudo failed. This indicates a global policy issue.");
    }

    // -n means non-interactive (fail if password required)
    // We use a short timeout and capture output for diagnostics
    const { stdout, stderr } = await execAsync(`sudo -n "${FIX_SCRIPT}" --workspace "${WORKSPACE_DIR}" --check-only`, 3000);
    sudoPromptDetected = false;
    console.log("✅ System integration verified: Passwordless sudo active.");
  } catch (e: any) {
    sudoPromptDetected = true;
    console.warn("ℹ️ System integration pending: Sudo requires password or script missing.");
    console.log(`   Diagnostic Error: ${e.message}`);
    if (e.stderr) console.log(`   Sudo Stderr: ${e.stderr}`);
    console.log("   This is normal if you haven't run 'npm run setup' yet or if your sudoers policy is strict.");
  }
};

// Initial check
checkSudoPermissions();

// API: Get Unified System Status
app.get("/api/status", async (req, res) => {
  try {
    const recoveryEnabled = !fs.existsSync(DISABLE_FLAG);
    const BUNDLE_DIR = path.join(WORKSPACE_DIR, "offline_bundle");
    const bundleReady = fs.existsSync(BUNDLE_DIR) && fs.readdirSync(BUNDLE_DIR).some(f => f.endsWith(".fw"));
    
    const [connectivity, kernel, powerSave, networkingState, wifiState, nmLogs, kernelLogs, sockets, ipAddr, wifiLink, nearbyAPs, arpTable] = await Promise.all([
      execAsync("nmcli networking connectivity").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("uname -r").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("iw dev $(ls /sys/class/net | grep -E '^wl' | head -n1) get power_save 2>/dev/null").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("nmcli networking").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("nmcli radio wifi").then(r => r.stdout.trim()).catch(() => "unknown"),
      // Verbatim System Events
      execAsync("journalctl -u NetworkManager -n 5 --no-pager").then(r => r.stdout.trim()).catch(() => ""),
      execAsync("dmesg | grep -iE 'b43|wl|brcm|mac80211' | tail -n 5").then(r => r.stdout.trim()).catch(() => ""),
      execAsync("ss -tunp | head -n 8").then(r => r.stdout.trim()).catch(() => ""),
      // Real-time Network Telemetry
      execAsync("ip -4 -brief addr").then(r => r.stdout.trim()).catch(() => ""),
      execAsync("iw dev $(ls /sys/class/net | grep -E '^wl' | head -n1) link").then(r => r.stdout.trim()).catch(() => ""),
      execAsync("nmcli -t -f SSID,SIGNAL,BARS device wifi list | head -n 5").then(r => r.stdout.trim()).catch(() => ""),
      execAsync("arp -a | head -n 10").then(r => r.stdout.trim()).catch(() => "")
    ]);

    const isHealthy = connectivity === "full" || connectivity === "limited";
    const currentTimestamp = new Date().toISOString();

    // Track metrics
    const signal = parseSignal(wifiLink);
    const traffic = parseTraffic(wifiLink);
    metricsHistory.push({
      timestamp: currentTimestamp,
      signal,
      rx: traffic.rx,
      tx: traffic.tx
    });
    if (metricsHistory.length > 30) metricsHistory = metricsHistory.slice(-30);
    
    // Verbatim Terminal Logging for System Transparency
    const healthIcon = isHealthy ? "✅" : "⚠️";
    const wifiIcon = wifiState === "enabled" ? "📶" : "❌";
    const netIcon = networkingState === "enabled" ? "🌐" : "🚫";
    const bundleIcon = bundleReady ? "📦" : "❓";
    
    console.log(`\n[${new Date().toLocaleTimeString()}] 🛰️  SYSTEM STATUS:`);
    console.log(`    Health: ${healthIcon} (${connectivity}) | Wi-Fi: ${wifiIcon} | Net: ${netIcon} | Sudo: ${sudoPromptDetected ? "🔓" : "🔒"}`);
    console.log(`    Kernel: ${kernel} | PowerSave: ${powerSave} | Bundle: ${bundleIcon} ${bundleReady ? "Ready" : "Missing"}`);

    if (ipAddr) {
      console.log(`    📡 NETWORK INTERFACES (VERBATIM):`);
      ipAddr.split('\n').forEach(line => console.log(`       ${line}`));
    }

    if (wifiLink && wifiLink.includes("Connected")) {
      console.log(`    📶 WI-FI LINK (VERBATIM):`);
      wifiLink.split('\n').forEach(line => console.log(`       ${line.trim()}`));
    }

    if (nmLogs) {
      console.log(`    📡 NETWORK MANAGER (VERBATIM):`);
      nmLogs.split('\n').forEach(line => console.log(`       ${line.substring(0, 120)}`));
    }
    if (kernelLogs) {
      console.log(`    🐧 KERNEL/DRIVER (VERBATIM):`);
      kernelLogs.split('\n').forEach(line => console.log(`       ${line.substring(0, 120)}`));
    }
    if (sockets) {
      console.log(`    🔌 ACTIVE SOCKETS (VERBATIM):`);
      sockets.split('\n').forEach(line => console.log(`       ${line.substring(0, 120)}`));
    }
    if (nearbyAPs) {
      console.log(`    📡 NEARBY ACCESS POINTS:`);
      nearbyAPs.split('\n').forEach(line => console.log(`       ${line}`));
    }

    res.json({
      recoveryEnabled,
      isHealthy,
      networkingEnabled: networkingState === "enabled",
      wifiEnabled: wifiState === "enabled",
      bundleReady,
      kernel,
      powerSave,
      isFixing,
      lastFixError,
      sudoPromptDetected,
      metricsHistory,
      verbatim: {
        nmLogs,
        kernelLogs,
        sockets,
        ipAddr,
        wifiLink,
        nearbyAPs,
        arpTable
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Run System Setup
app.post("/api/run-setup", async (req, res) => {
  try {
    const SETUP_SCRIPT = path.join(WORKSPACE_DIR, "setup-system.sh");
    if (!fs.existsSync(SETUP_SCRIPT)) {
      return res.status(404).json({ error: "setup-system.sh not found" });
    }
    
    // We run this and expect the user to provide password in the terminal
    // We don't wait for it to finish because it might hang on sudo prompt
    const { exec } = await import("child_process");
    exec(`bash "${SETUP_SCRIPT}"`, (error, stdout, stderr) => {
      if (error) console.error(`Setup error: ${error.message}`);
      console.log(`Setup output: ${stdout}`);
      if (stderr) console.error(`Setup stderr: ${stderr}`);
      checkSudoPermissions(); // Re-check after it finishes
    });
    
    res.json({ message: "Setup started. Please check your terminal for sudo prompt." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API: Re-check Sudo Permissions
app.post("/api/recheck-sudo", async (req, res) => {
  await checkSudoPermissions();
  res.json({ sudoPromptDetected });
});

// API: Prepare Bundle
app.post("/api/prepare-bundle", (req, res) => {
  const BUNDLE_SCRIPT = path.join(WORKSPACE_DIR, "prepare-bundle.sh");
  exec(`bash "${BUNDLE_SCRIPT}"`, (error, stdout, stderr) => {
    console.log("Bundle preparation completed", { error, stdout, stderr });
  });
  res.json({ message: "Bundle preparation initiated" });
});

// API: Toggle Recovery
app.post("/api/toggle-recovery", (req, res) => {
  const { enabled } = req.body;
  try {
    if (enabled) {
      if (fs.existsSync(DISABLE_FLAG)) fs.unlinkSync(DISABLE_FLAG);
    } else {
      if (!fs.existsSync(DISABLE_FLAG)) fs.writeFileSync(DISABLE_FLAG, "disabled");
    }
    res.json({ success: true, recoveryEnabled: enabled });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Toggle Power Save
app.post("/api/toggle-power-save", (req, res) => {
  const { enabled } = req.body;
  const flag = enabled ? "--power-save-on" : "--power-save-off";
  // Use direct sudo call with --workspace argument
  exec(`sudo "${FIX_SCRIPT}" --workspace "${WORKSPACE_DIR}" ${flag}`, (error, stdout, stderr) => {
    console.log("Power save toggle completed", { error, stdout, stderr });
  });
  res.json({ success: true, powerSave: enabled ? "on" : "off" });
});

// API: Manual Fix
app.post("/api/fix", (req, res) => {
  if (isFixing) return res.status(429).json({ error: "Fix already in progress" });
  
  isFixing = true;
  lastFixError = null;
  sudoPromptDetected = false;
  logBuffer = []; // Clear buffer for new run
  logBuffer.push(`[${new Date().toISOString()}] 🛰️ Recovery sequence initiated...`);
  console.log(`[${new Date().toLocaleTimeString()}] 🛰️  RECOVERY INITIATED: Running ${FIX_SCRIPT} --force`);

  // Call the script directly with sudo, passing the workspace as an argument
  // We also set the environment variable as a fallback
  const child = spawn("sudo", [FIX_SCRIPT, "--workspace", WORKSPACE_DIR, "--force"], {
    env: { ...process.env, PROJECT_ROOT: WORKSPACE_DIR }
  });

  child.stdout.on("data", (data) => {
    const output = data.toString();
    // REQUIREMENT: Detect and log the confirmed log path
    if (output.includes("LOG_PATH:")) {
      const confirmedPath = output.split("LOG_PATH:")[1].trim();
      console.log(`[HANDSHAKE] Recovery script confirmed log path: ${confirmedPath}`);
    }
    process.stdout.write(`[FIX STDOUT] ${output}`);
    logBuffer.push(...output.split("\n").filter(l => l.trim()));
    if (logBuffer.length > 500) logBuffer = logBuffer.slice(-500);
  });

  child.stderr.on("data", (data) => {
    const output = data.toString();
    process.stderr.write(`[FIX STDERR] ${output}`);
    logBuffer.push(`[ERROR] ${output}`);
    if (logBuffer.length > 500) logBuffer = logBuffer.slice(-500);
    
    // Detect sudo password prompt
    if (output.toLowerCase().includes("password for") || output.includes("[sudo]")) {
      sudoPromptDetected = true;
    }
  });

  child.on("close", (code) => {
    isFixing = false;
    if (code !== 0) {
      lastFixError = `Exit code ${code}`;
      logBuffer.push(`[FATAL] Process exited with code ${code}`);
    } else {
      lastFixError = null;
      sudoPromptDetected = false;
      logBuffer.push(`[SUCCESS] Recovery completed successfully.`);
    }
    console.log(`Manual fix process exited with code ${code}`);
  });

  res.json({ message: "Recovery initiated" });
});

// API: Get Logs
app.get("/api/logs", async (req, res) => {
  try {
    // If we are actively fixing, serve from the live memory buffer
    if (isFixing && logBuffer.length > 0) {
      return res.json({ logs: logBuffer.join("\n") });
    }

    // Otherwise, fall back to the persistent log file
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ logs: "Waiting for telemetry..." });
    }
    
    const { stdout } = await execAsync(`tail -n 100 ${LOG_FILE}`, 2000);
    
    // Enhanced polling visibility with log tail summary
    const stats = fs.statSync(LOG_FILE);
    const lastLine = stdout.trim().split('\n').pop() || "Empty";
    console.log(`[${new Date().toLocaleTimeString()}] 📝 POLLING: ${path.basename(LOG_FILE)} (${(stats.size / 1024).toFixed(1)}KB)`);
    console.log(`    Last Entry: ${lastLine.substring(0, 80)}${lastLine.length > 80 ? "..." : ""}`);
    
    res.json({ logs: stdout });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Clear Logs
app.post("/api/clear-logs", (req, res) => {
  try {
    logBuffer = [];
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "");
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

async function startServer() {
  // SELF-HEALING: Aggressively clear ports 3000 and 24678 before starting
  try {
    console.log("🧹 Self-healing: Aggressively clearing ports 3000 and 24678...");
    // Kill processes on port 3000 (Express) and 24678 (Vite HMR)
    await execAsync("sudo fuser -k -9 3000/tcp || true");
    await execAsync("sudo fuser -k -9 24678/tcp || true");
    // Wait for OS to release ports
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (e) {
    console.warn("⚠️ Could not clear ports, attempting to bind anyway...");
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Broadcom Control Center running on http://localhost:${PORT}`);
    console.log(`WORKSPACE: ${WORKSPACE_DIR}`);
    console.log(`FIX_SCRIPT: ${FIX_SCRIPT}`);
    console.log(`LOG_FILE: ${LOG_FILE}`);
  });
}

startServer();
