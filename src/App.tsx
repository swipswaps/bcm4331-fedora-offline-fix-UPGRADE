import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Wifi, 
  WifiOff, 
  ShieldCheck, 
  ShieldAlert, 
  Power, 
  Terminal, 
  RefreshCw,
  Settings,
  Activity,
  Zap,
  ZapOff,
  ChevronRight,
  ChevronDown,
  Circle,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Copy,
  ExternalLink,
  Check,
  Download,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SystemStatus {
  isHealthy: boolean;
  networkingEnabled: boolean;
  wifiEnabled: boolean;
  recoveryEnabled: boolean;
  bundleReady: boolean;
  kernel: string;
  powerSave: string;
  isFixing: boolean;
  lastFixError: string | null;
  sudoPromptDetected: boolean;
  timestamp: string;
}

interface LogLine {
  id: string;
  timestamp: string;
  level: 'info' | 'error' | 'success' | 'warn' | 'system';
  message: string;
  raw: string;
}

const TerminalDashboard = ({ logs, autoRefresh, onToggleRefresh, onClear }: { logs: string, autoRefresh: boolean, onToggleRefresh: () => void, onClear?: () => void }) => {
  const [filter, setFilter] = useState("");
  const [isLive, setIsLive] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse logs into structured lines
  const parsedLines: LogLine[] = logs.split('\n').filter(l => l.trim()).map((line, idx) => {
    let level: LogLine['level'] = 'info';
    let message = line;
    let timestamp = "";

    // Try to extract timestamp (e.g., Mar 28 08:43:41)
    const tsMatch = line.match(/^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})/);
    if (tsMatch) {
      timestamp = tsMatch[1];
      message = line.replace(tsMatch[0], "").trim();
    }

    if (line.toLowerCase().includes("error") || line.toLowerCase().includes("fail") || line.toLowerCase().includes("denied")) level = 'error';
    else if (line.toLowerCase().includes("success") || line.toLowerCase().includes("completed") || line.toLowerCase().includes("connected")) level = 'success';
    else if (line.toLowerCase().includes("warning") || line.toLowerCase().includes("retry")) level = 'warn';
    else if (line.startsWith("[") && line.includes("]")) level = 'system';

    return { id: `${idx}-${line.substring(0, 10)}`, timestamp, level, message, raw: line };
  });

  const filteredLines = parsedLines.filter(l => 
    l.raw.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    if (isLive) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isLive]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `broadcom-telemetry-${new Date().toISOString()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level: LogLine['level']) => {
    switch (level) {
      case 'error': return 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]';
      case 'success': return 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]';
      case 'warn': return 'text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]';
      case 'system': return 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]';
      default: return 'text-blue-200/60';
    }
  };

  return (
    <div className={`flex flex-col bg-[#050505] rounded-3xl border border-white/10 overflow-hidden shadow-2xl relative group/term transition-all duration-500 ${isFullscreen ? 'fixed inset-4 z-[100]' : 'h-full w-full'}`}>
      {/* CRT Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
      
      {/* Terminal Header */}
      <div className="px-6 py-3 bg-white/[0.03] border-b border-white/5 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[10px] font-mono font-bold tracking-widest opacity-60 uppercase">Live Telemetry</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex gap-3 text-[9px] font-mono opacity-40 uppercase">
            <span>Lines: {parsedLines.length}</span>
            <span>Errors: {parsedLines.filter(l => l.level === 'error').length}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="FILTER..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 transition-all focus:w-48 placeholder:opacity-20"
            />
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={copyToClipboard}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 opacity-40 hover:opacity-100 transition-all"
              title="Copy Logs"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <button 
              onClick={downloadLogs}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 opacity-40 hover:opacity-100 transition-all"
              title="Download Logs"
            >
              <Download className="w-3 h-3" />
            </button>
            <button 
              onClick={() => setIsLive(!isLive)}
              className={`p-1.5 rounded-lg border transition-all ${isLive ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/10 opacity-40'}`}
              title={isLive ? "Auto-scroll enabled" : "Auto-scroll paused"}
            >
              <RefreshCw className={`w-3 h-3 ${isLive && autoRefresh ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 opacity-40 hover:opacity-100 transition-all"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
            {onClear && (
              <button 
                onClick={onClear}
                className="p-1.5 rounded-lg border border-white/10 bg-white/5 opacity-40 hover:opacity-100 transition-all"
                title="Clear Logs"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Body */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent z-0"
      >
        {filteredLines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-2">
            <Terminal className="w-8 h-8" />
            <p className="text-[10px] uppercase tracking-widest">No matching events</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLines.map((line) => (
              <div key={line.id} className="group flex gap-4 hover:bg-white/[0.02] -mx-2 px-2 rounded transition-colors">
                {line.timestamp && (
                  <span className="opacity-20 shrink-0 select-none">{line.timestamp}</span>
                )}
                <span className={`${getLevelColor(line.level)} break-all`}>
                  {line.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Terminal Footer */}
      <div className="px-6 py-2 bg-black/40 border-t border-white/5 flex items-center justify-between text-[9px] font-mono opacity-30 z-20">
        <div className="flex gap-4">
          <span>UTF-8</span>
          <span>BASH</span>
          <span>ROOT@FEDORA</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
          <span>ENCRYPTED LINK ACTIVE</span>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [preparingBundle, setPreparingBundle] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isCompact, setIsCompact] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const logEndRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/status?t=${Date.now()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
      }
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch status", e);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?t=${Date.now()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
      }
      const data = await res.json();
      setLogs(data.logs);
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
  }, []);

  const toggleRecovery = async () => {
    if (!status) return;
    setLoading(true);
    try {
      const res = await fetch("/api/toggle-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !status.recoveryEnabled })
      });
      if (res.ok) await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const togglePowerSave = async () => {
    if (!status) return;
    setLoading(true);
    try {
      const isCurrentlyOn = status.powerSave.includes("on");
      const res = await fetch("/api/toggle-power-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !isCurrentlyOn })
      });
      if (res.ok) await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const triggerFix = async () => {
    setLoading(true);
    try {
      await fetch("/api/fix", { method: "POST" });
      // We don't clear loading here immediately, we let the status poll handle it
      // but we do a quick refresh to show the "Fixing" state
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error("Failed to trigger fix", e);
    } finally {
      setLoading(false);
    }
  };

  const prepareBundle = async () => {
    setPreparingBundle(true);
    try {
      await fetch("/api/prepare-bundle", { method: "POST" });
      setTimeout(() => {
        fetchStatus();
        fetchLogs();
        setPreparingBundle(false);
      }, 5000);
    } catch (e) {
      setPreparingBundle(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    // Faster polling (1s) if fixing or degraded, slower (8s) if healthy
    const intervalTime = (status?.isFixing || !status?.isHealthy) ? 1000 : 8000;
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [autoRefresh, status?.isHealthy, status?.isFixing, fetchStatus, fetchLogs]);

  useEffect(() => {
    // Auto-scroll to bottom when logs update
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const clearLogs = async () => {
    try {
      await fetch("/api/clear-logs", { method: "POST" });
      setLogs("");
    } catch (e) {
      console.error("Failed to clear logs", e);
    }
  };

  const CompactView = () => (
    <div className="w-[320px] bg-[#151619] rounded-xl overflow-hidden shadow-2xl border border-white/10 select-text" role="complementary" aria-label="Compact status view">
      {/* Header */}
      <div className="p-4 bg-black/40 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status?.isHealthy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} aria-hidden="true" />
          <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Broadcom Kit</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCompact(false)} 
            aria-label="Expand to full dashboard"
            className="p-1 hover:bg-white/5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <Maximize2 className="w-3 h-3 opacity-40" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="p-4 space-y-4">
        {/* Dynamic Slot for Banners - Collapses when empty but animates to prevent jumping */}
        <motion.div 
          initial={false}
          animate={{ height: (status?.sudoPromptDetected || ((!status?.networkingEnabled || !status?.wifiEnabled) && status?.networkingEnabled !== undefined && !status?.isFixing)) ? "auto" : 0 }}
          className="overflow-hidden"
        >
          <div className="pb-4 space-y-3">
            {/* Sudo Warning */}
            {status?.sudoPromptDetected && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-start gap-3"
                role="alert"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <span className="text-[10px] font-bold text-red-200 uppercase tracking-tight">Sudo Password Required</span>
                  <p className="text-[9px] text-red-200/70 leading-relaxed">
                    Waiting for password in terminal.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Enable Now Banner */}
            {(!status?.networkingEnabled || !status?.wifiEnabled) && status?.networkingEnabled !== undefined && !status?.isFixing && !status?.sudoPromptDetected && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center justify-between gap-3"
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span className="text-[10px] font-medium text-amber-200 uppercase">
                    {!status.networkingEnabled ? 'Networking Disabled' : 'Wi-Fi Radio Disabled'}
                  </span>
                </div>
                <button 
                  onClick={triggerFix}
                  className="px-2 py-1 bg-amber-500 text-black text-[9px] font-bold rounded uppercase hover:bg-amber-400 transition-colors"
                >
                  Enable
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Network Health Card */}
        <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${status?.isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`} aria-hidden="true">
              {status?.isHealthy ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-xs font-medium">{status?.isHealthy ? 'Network Healthy' : 'Network Degraded'}</h3>
              <p className="text-[9px] font-mono opacity-40 uppercase">{status?.kernel || 'Detecting...'}</p>
            </div>
          </div>
          <button 
            onClick={triggerFix}
            disabled={loading || status?.isFixing}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95 disabled:opacity-30"
          >
            <RefreshCw className={`w-4 h-4 ${loading || status?.isFixing ? 'animate-spin' : 'opacity-60'}`} />
          </button>
        </div>

        {/* Progress Bar Slot */}
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          {status?.isFixing && (
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="h-full w-1/3 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            />
          )}
        </div>

        {/* Toggles */}
        <div className="space-y-1">
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <Power className={`w-3 h-3 ${status?.recoveryEnabled ? 'text-blue-400' : 'opacity-30'}`} aria-hidden="true" />
              <span className="text-[11px] opacity-70">Autonomous Recovery</span>
            </div>
            <button 
              onClick={toggleRecovery} 
              aria-pressed={status?.recoveryEnabled}
              aria-label="Toggle autonomous recovery"
              className={`w-8 h-4 rounded-full relative transition-colors focus:ring-2 focus:ring-blue-500 outline-none ${status?.recoveryEnabled ? 'bg-blue-600' : 'bg-white/10'}`}
            >
              <motion.div animate={{ x: status?.recoveryEnabled ? 18 : 2 }} className="absolute top-0.5 w-3 h-3 bg-white rounded-full" />
            </button>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <Zap className={`w-3 h-3 ${!status?.powerSave?.includes("on") ? 'text-emerald-400' : 'opacity-30'}`} aria-hidden="true" />
              <span className="text-[11px] opacity-70">Performance Mode</span>
            </div>
            <button 
              onClick={togglePowerSave} 
              aria-pressed={!status?.powerSave?.includes("on")}
              aria-label="Toggle performance mode"
              className={`w-8 h-4 rounded-full relative transition-colors focus:ring-2 focus:ring-emerald-500 outline-none ${!status?.powerSave?.includes("on") ? 'bg-emerald-600' : 'bg-white/10'}`}
            >
              <motion.div animate={{ x: !status?.powerSave?.includes("on") ? 18 : 2 }} className="absolute top-0.5 w-3 h-3 bg-white rounded-full" />
            </button>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-3 h-3 ${status?.bundleReady ? 'text-emerald-400' : 'text-amber-400'}`} aria-hidden="true" />
              <span className="text-[11px] opacity-70">Offline Bundle</span>
            </div>
            {!status?.bundleReady ? (
              <button 
                onClick={prepareBundle} 
                disabled={preparingBundle} 
                className="text-[9px] font-mono text-blue-400 hover:underline focus:outline-none focus:text-blue-300"
              >
                {preparingBundle ? 'PREPARING...' : 'PREPARE'}
              </button>
            ) : (
              <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Mini Log Toggle */}
        <div className="pt-2 border-t border-white/5">
          <button 
            onClick={() => setShowLogs(!showLogs)}
            aria-expanded={showLogs}
            aria-controls="compact-telemetry"
            className="w-full flex items-center justify-between text-[10px] font-mono opacity-40 hover:opacity-100 transition-opacity focus:outline-none focus:opacity-100"
          >
            <span>HANDSHAKE TELEMETRY</span>
            {showLogs ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
          </button>
          
          <AnimatePresence>
            {showLogs && (
              <motion.div 
                id="compact-telemetry"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 200, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2"
              >
                <TerminalDashboard 
                  logs={logs} 
                  autoRefresh={autoRefresh} 
                  onToggleRefresh={() => setAutoRefresh(!autoRefresh)} 
                  onClear={clearLogs}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex justify-between items-center">
        <span className="text-[8px] font-mono opacity-20 uppercase tracking-tighter">Broadcom Specialist Tool v38.6</span>
        <div className="flex gap-1" aria-hidden="true">
          <div className="w-1 h-1 rounded-full bg-white/10" />
          <div className="w-1 h-1 rounded-full bg-white/10" />
          <div className="w-1 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans select-text flex items-center justify-center p-4">
      {isCompact ? (
        <CompactView />
      ) : (
        <div className="max-w-5xl w-full space-y-8" role="main">
          {/* Header */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/20">
                <Wifi className="w-7 h-7 text-white" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Broadcom Control Center</h1>
                <p className="text-xs font-mono opacity-40 uppercase tracking-[0.2em]">Hardware Recovery Suite v38.6</p>
              </div>
            </div>
            <button 
              onClick={() => setIsCompact(true)}
              aria-label="Switch to compact view"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <LayoutGrid className="w-4 h-4 opacity-60" aria-hidden="true" />
              <span className="text-xs font-medium">Compact Mode</span>
            </button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Toggles & Stats */}
            <div className="lg:col-span-5 space-y-6">
               {/* Reusing existing cards but with refined styling */}
               <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/10 space-y-8">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-mono opacity-30 uppercase tracking-widest mb-2">Hardware Status</p>
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${status?.isHealthy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} aria-hidden="true" />
                        <span className="text-2xl font-medium" aria-live="polite">{status?.isHealthy ? 'Operational' : 'Degraded'}</span>
                      </div>
                    </div>
                    <Activity className="w-6 h-6 opacity-20" aria-hidden="true" />
                  </div>

                  {/* Sudo Warning (Full View) */}
                  {status?.sudoPromptDetected && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-start gap-4"
                    >
                      <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-red-200 uppercase tracking-wider">Sudo Password Required</h4>
                        <p className="text-xs text-red-200/60 leading-relaxed">
                          The recovery process is paused. Please switch to your terminal and enter your password to allow the script to proceed.
                        </p>
                        <p className="text-[10px] font-mono text-red-400/80 pt-2">
                          TIP: To avoid this, see the README section on "Passwordless Sudo".
                        </p>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                      <p className="text-[9px] font-mono opacity-30 uppercase mb-2">Power Save</p>
                      <button 
                        onClick={togglePowerSave} 
                        aria-label={`Toggle power save mode. Currently ${status?.powerSave || 'unknown'}`}
                        className="flex items-center gap-2 group focus:outline-none focus:text-white"
                      >
                        {status?.powerSave?.includes("on") ? <Zap className="w-4 h-4 text-amber-400" /> : <ZapOff className="w-4 h-4 text-emerald-400" />}
                        <span className="text-sm font-mono group-hover:underline">{status?.powerSave?.toUpperCase() || 'UNKNOWN'}</span>
                      </button>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                      <p className="text-[9px] font-mono opacity-30 uppercase mb-2">Radio Status</p>
                      <div className="flex items-center gap-2">
                        <Circle className={`w-2 h-2 fill-current ${status?.wifiEnabled ? 'text-emerald-500' : 'text-amber-500'}`} aria-hidden="true" />
                        <span className="text-sm font-mono uppercase">{status?.wifiEnabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={toggleRecovery} 
                      aria-pressed={status?.recoveryEnabled}
                      aria-label="Toggle autonomous recovery"
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <div className="flex items-center gap-3">
                        <Power className={`w-5 h-5 ${status?.recoveryEnabled ? 'text-blue-400' : 'opacity-20'}`} aria-hidden="true" />
                        <span className="text-sm font-medium">Autonomous Recovery</span>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${status?.recoveryEnabled ? 'bg-blue-600' : 'bg-white/10'}`} aria-hidden="true">
                        <motion.div animate={{ x: status?.recoveryEnabled ? 22 : 2 }} className="absolute top-1 w-3 h-3 bg-white rounded-full" />
                      </div>
                    </button>

                    <button 
                      onClick={triggerFix} 
                      disabled={loading || status?.isFixing} 
                      aria-busy={loading || status?.isFixing}
                      className="w-full p-6 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-white/5 focus:ring-4 focus:ring-white/20 outline-none"
                    >
                      {loading || status?.isFixing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wifi className="w-5 h-5" aria-hidden="true" />}
                      {status?.isFixing ? 'RECOVERY IN PROGRESS' : 'TRIGGER FORCED RECOVERY'}
                    </button>
                  </div>
               </div>
            </div>

            {/* Right: Logs */}
            <div className="lg:col-span-7 flex flex-col h-[600px]">
              <TerminalDashboard 
                logs={logs} 
                autoRefresh={autoRefresh} 
                onToggleRefresh={() => setAutoRefresh(!autoRefresh)} 
                onClear={clearLogs}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
