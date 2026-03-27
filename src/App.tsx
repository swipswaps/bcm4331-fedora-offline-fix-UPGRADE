import { useState, useEffect, useCallback } from "react";
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
  ZapOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SystemStatus {
  isHealthy: boolean;
  recoveryEnabled: boolean;
  bundleReady: boolean;
  kernel: string;
  powerSave: string;
  isFixing: boolean;
  timestamp: string;
}

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [preparingBundle, setPreparingBundle] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch status", e);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs");
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

  const triggerFix = async () => {
    setLoading(true);
    try {
      await fetch("/api/fix", { method: "POST" });
      // Adaptive feedback
      setTimeout(() => {
        fetchStatus();
        fetchLogs();
        setLoading(false);
      }, 2000);
    } catch (e) {
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

  // Initial Load
  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  // Adaptive Polling
  useEffect(() => {
    if (!autoRefresh) return;
    
    // Faster polling during recovery or degradation
    const intervalTime = (status?.isFixing || !status?.isHealthy) ? 2000 : 8000;
    
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, intervalTime);
    
    return () => clearInterval(interval);
  }, [autoRefresh, status?.isHealthy, status?.isFixing, fetchStatus, fetchLogs]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-blue-500/30">
      {/* Header / Rail */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight uppercase opacity-90">Broadcom Control Center</h1>
              <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">v38.2.0-verified</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <div className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
              <span className="text-[9px] font-mono opacity-50 uppercase tracking-wider">
                {status?.isFixing ? 'RECOVERY IN PROGRESS' : autoRefresh ? 'LIVE MONITORING' : 'PAUSED'}
              </span>
            </div>
            <button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              title={autoRefresh ? "Pause Monitoring" : "Resume Monitoring"}
            >
              <RefreshCw className={`w-4 h-4 opacity-40 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
            </button>
            <div className="h-4 w-[1px] bg-white/10" />
            <Settings className="w-4 h-4 opacity-30 hover:opacity-100 cursor-pointer transition-opacity" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Status & Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Main Status Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 shadow-2xl"
          >
            <div className="flex items-start justify-between mb-8">
              <div>
                <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest block mb-1">System Health</span>
                <div className="flex items-center gap-2">
                  {status?.isHealthy ? (
                    <div className="flex items-center gap-2 text-emerald-400">
                      <ShieldCheck className="w-5 h-5" />
                      <span className="text-xl font-medium tracking-tight">Healthy</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-400">
                      <ShieldAlert className="w-5 h-5" />
                      <span className="text-xl font-medium tracking-tight">Degraded</span>
                    </div>
                  )}
                </div>
              </div>
              <Activity className={`w-5 h-5 ${status?.isHealthy ? 'text-emerald-500/50' : 'text-amber-500/50'} ${!status?.isHealthy ? 'animate-pulse' : ''}`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-[9px] font-mono opacity-30 uppercase block mb-2 text-center">Power Save</span>
                <div className="flex items-center justify-center gap-2">
                  {status?.powerSave?.includes("on") ? (
                    <Zap className="w-3 h-3 text-amber-400" />
                  ) : (
                    <ZapOff className="w-3 h-3 text-emerald-400" />
                  )}
                  <span className="font-mono text-[10px] uppercase opacity-80">
                    {status?.powerSave || "Unknown"}
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-[9px] font-mono opacity-30 uppercase block mb-2 text-center">Kernel</span>
                <div className="text-center font-mono text-[10px] opacity-80 truncate" title={status?.kernel}>
                  {status?.kernel || "Detecting..."}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Autonomous Recovery Toggle */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl bg-white/[0.02] border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${status?.recoveryEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/20'}`}>
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-medium">Autonomous Recovery</h3>
                  <p className="text-[11px] opacity-40">Self-heal network on failure</p>
                </div>
              </div>
              <button 
                onClick={toggleRecovery}
                disabled={loading}
                className={`relative w-12 h-6 rounded-full transition-colors ${status?.recoveryEnabled ? 'bg-blue-600' : 'bg-white/10'}`}
              >
                <motion.div 
                  animate={{ x: status?.recoveryEnabled ? 26 : 4 }}
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                />
              </button>
            </div>
            
            {!status?.recoveryEnabled && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-200/60 leading-relaxed">
                Warning: Automatic repairs are disabled. The system will not attempt to fix Wi-Fi drops without manual intervention.
              </div>
            )}
          </motion.div>

          {/* Offline Bundle Status */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-6 rounded-2xl bg-white/[0.02] border border-white/10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${status?.bundleReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-medium">Offline Bundle</h3>
                  <p className="text-[11px] opacity-40">{status?.bundleReady ? 'Firmware cached locally' : 'No local firmware cache'}</p>
                </div>
              </div>
              <button 
                onClick={prepareBundle}
                disabled={preparingBundle}
                className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-all ${preparingBundle ? 'border-white/10 text-white/20' : 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10'}`}
              >
                {preparingBundle ? 'PREPARING...' : 'PREPARE NOW'}
              </button>
            </div>
            {!status?.bundleReady && !preparingBundle && (
              <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[11px] text-blue-200/60 leading-relaxed">
                Tip: Prepare the offline bundle while you have internet. This ensures recovery works even without a connection.
              </div>
            )}
          </motion.div>

          {/* Manual Action */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2"
          >
            <button
              onClick={triggerFix}
              disabled={loading || status?.isFixing}
              className="w-full p-4 rounded-2xl bg-white text-black font-medium text-sm flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading || status?.isFixing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              {status?.isFixing ? 'Recovery in Progress...' : 'Trigger Forced Recovery'}
            </button>
            <p className="text-[10px] text-center opacity-30 font-mono uppercase tracking-tighter">
              Bypasses user-intent flag to re-initialize b43 stack
            </p>
          </motion.div>

        </div>

        {/* Right Column: Logs */}
        <div className="lg:col-span-7 flex flex-col h-[calc(100vh-10rem)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 opacity-50">
              <Terminal className="w-4 h-4" />
              <span className="text-[10px] font-mono uppercase tracking-widest">Verbatim Handshake Log</span>
            </div>
            <button 
              onClick={fetchLogs}
              className="text-[10px] font-mono opacity-30 hover:opacity-100 transition-opacity"
            >
              REFRESH LOGS
            </button>
          </div>
          
          <div className="flex-1 rounded-2xl bg-black border border-white/10 overflow-hidden flex flex-col shadow-inner">
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-blue-200/70 scrollbar-thin scrollbar-thumb-white/10">
              <AnimatePresence mode="wait">
                <motion.pre 
                  key={logs}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="whitespace-pre-wrap"
                >
                  {logs || "Waiting for system events..."}
                </motion.pre>
              </AnimatePresence>
            </div>
            <div className="p-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex gap-2">
                <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
                <span className="text-[9px] font-mono opacity-30 uppercase">Telemetry {autoRefresh ? 'Active' : 'Paused'}</span>
              </div>
              <span className="text-[9px] font-mono opacity-30 uppercase">Last Entry: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
