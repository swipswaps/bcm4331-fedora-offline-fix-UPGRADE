import express from "express";
import { createServer as createViteServer } from "vite";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;
const WORKSPACE_DIR = process.cwd();
const DISABLE_FLAG = path.join(WORKSPACE_DIR, ".fix-wifi.disabled");
const LOG_FILE = path.join(WORKSPACE_DIR, "verbatim_handshake.log");
const FIX_SCRIPT = fs.existsSync("/usr/local/bin/fix-wifi") 
  ? "/usr/local/bin/fix-wifi" 
  : path.join(WORKSPACE_DIR, "fix-wifi.sh");

app.use(express.json());

// API: Get System Status
app.get("/api/status", async (req, res) => {
  try {
    // Check if recovery is disabled by user
    const recoveryEnabled = !fs.existsSync(DISABLE_FLAG);
    
    // Check network health
    let isHealthy = false;
    try {
      const { stdout } = await execAsync("nmcli networking connectivity");
      isHealthy = stdout.trim() === "full" || stdout.trim() === "limited";
    } catch (e) {
      isHealthy = false;
    }

    res.json({
      recoveryEnabled,
      isHealthy,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
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

// API: Manual Fix
app.post("/api/fix", (req, res) => {
  // Run script in background with --force to bypass user-intent check
  exec(`sudo ${FIX_SCRIPT} --force`, (error, stdout, stderr) => {
    console.log("Manual fix triggered", { error, stdout, stderr });
  });
  res.json({ message: "Recovery initiated" });
});

// API: Get Logs
app.get("/api/logs", async (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ logs: "No logs found yet." });
    }
    const { stdout } = await execAsync(`tail -n 100 ${LOG_FILE}`);
    res.json({ logs: stdout });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// API: Get Kernel Version
app.get("/api/kernel", async (req, res) => {
  try {
    const { stdout } = await execAsync("uname -r");
    res.json({ kernel: stdout.trim() });
  } catch (error) {
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
  });
}

startServer();
