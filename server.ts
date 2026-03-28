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
const WORKSPACE_DIR = process.cwd();
const DISABLE_FLAG = path.join(WORKSPACE_DIR, ".fix-wifi.disabled");
const LOG_FILE = path.join(WORKSPACE_DIR, "verbatim_handshake.log");
const FIX_SCRIPT = fs.existsSync("/usr/local/bin/fix-wifi") 
  ? "/usr/local/bin/fix-wifi" 
  : path.join(WORKSPACE_DIR, "fix-wifi.sh");

app.use(express.json());

let isFixing = false;
let lastFixError: string | null = null;
let sudoPromptDetected = false;
let needsSystemSetup = false;

// Check if we have passwordless sudo for the fix script
const checkSudoPermissions = async () => {
  try {
    // -n means non-interactive (fail if password required)
    await execAsync(`sudo -n "${FIX_SCRIPT}" --force --check-only`, 1000);
    needsSystemSetup = false;
  } catch (e) {
    needsSystemSetup = true;
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
    
    const [connectivity, kernel, powerSave, networkingState, wifiState] = await Promise.all([
      execAsync("nmcli networking connectivity").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("uname -r").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("iw dev $(ls /sys/class/net | grep -E '^wl' | head -n1) get power_save 2>/dev/null").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("nmcli networking").then(r => r.stdout.trim()).catch(() => "unknown"),
      execAsync("nmcli radio wifi").then(r => r.stdout.trim()).catch(() => "unknown")
    ]);

    const isHealthy = connectivity === "full" || connectivity === "limited";
    
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
      needsSystemSetup,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Setup System Integration
app.post("/api/setup-system", (req, res) => {
  const username = process.env.USER || "owner";
  const sudoersPath = "/etc/sudoers.d/broadcom-control";
  
  // 1. Copy script to /usr/local/bin
  // 2. Set permissions
  // 3. Create sudoers.d entry
  // 4. Restore SELinux context
  const setupCmd = `
    sudo cp "${path.join(WORKSPACE_DIR, "fix-wifi.sh")}" /usr/local/bin/fix-wifi && \
    sudo chmod +x /usr/local/bin/fix-wifi && \
    echo "${username} ALL=(ALL) NOPASSWD: /usr/local/bin/fix-wifi" | sudo tee ${sudoersPath} && \
    sudo chmod 440 ${sudoersPath} && \
    (sudo restorecon -v /usr/local/bin/fix-wifi || true)
  `.trim().replace(/\n/g, " ");

  exec(setupCmd, (error, stdout, stderr) => {
    if (error) {
      console.error("Setup failed:", stderr);
      res.status(500).json({ error: stderr || error.message });
    } else {
      console.log("Setup successful:", stdout);
      checkSudoPermissions(); // Re-check
      res.json({ success: true, message: "System integration successful" });
    }
  });
});

// API: Manual Fix
app.post("/api/fix", (req, res) => {
  if (isFixing) return res.status(429).json({ error: "Fix already in progress" });
  
  isFixing = true;
  lastFixError = null;
  sudoPromptDetected = false;

  // Use sh -c to ensure environment variables are correctly passed through sudo
  const command = `FIX_WIFI_WORKSPACE="${WORKSPACE_DIR}" "${FIX_SCRIPT}" --force`;
  const child = spawn("sudo", ["sh", "-c", command]);

  child.stdout.on("data", (data) => {
    const output = data.toString();
    // Log to server console for debugging
    process.stdout.write(`[FIX STDOUT] ${output}`);
  });

  child.stderr.on("data", (data) => {
    const output = data.toString();
    process.stderr.write(`[FIX STDERR] ${output}`);
    
    // Detect sudo password prompt
    if (output.toLowerCase().includes("password for") || output.includes("[sudo]")) {
      sudoPromptDetected = true;
    }
  });

  child.on("close", (code) => {
    isFixing = false;
    if (code !== 0) {
      lastFixError = `Exit code ${code}`;
    } else {
      lastFixError = null;
      sudoPromptDetected = false;
    }
    console.log(`Manual fix process exited with code ${code}`);
  });

  res.json({ message: "Recovery initiated" });
});

// API: Get Logs
app.get("/api/logs", async (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      console.log(`[${new Date().toISOString()}] LOGS: Path=${LOG_FILE} | Status=NotFound`);
      return res.json({ logs: "No logs found yet." });
    }
    
    const stats = fs.statSync(LOG_FILE);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    // Efficiently get last 100 lines with timeout
    const { stdout } = await execAsync(`tail -n 100 ${LOG_FILE}`, 2000);
    const lineCount = stdout.split("\n").filter(l => l.trim()).length;
    
    console.log(`[${new Date().toISOString()}] LOGS: Path=${LOG_FILE} | Size=${fileSizeKB}KB | Lines=${lineCount}`);
    res.json({ logs: stdout });
  } catch (error) {
    console.error("Error in /api/logs:", error);
    res.status(500).json({ error: String(error) });
  }
});

async function startServer() {
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
