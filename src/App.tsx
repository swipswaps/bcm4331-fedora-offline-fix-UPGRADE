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
  Maximize2
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
  const [isCompact, setIsCompact] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  
  const logEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalTime = (status?.isFixing || !status?.isHealthy) ? 2000 : 8000;
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [autoRefresh, status?.isHealthy, status?.isFixing, fetchStatus, fetchLogs]);

  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showLogs]);

  const CompactView = () => (
    <div className="w-[320px] bg-[#151619] rounded-xl overflow-hidden shadow-2xl border border-white/10">
      {/* Header */}
      <div className="p-4 bg-black/40 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status?.isHealthy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
          <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Broadcom Kit</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsCompact(false)} className="p-1 hover:bg-white/5 rounded transition-colors">
            <Maximize2 className="w-3 h-3 opacity-40" />
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${status?.isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
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
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading || status?.isFixing ? 'animate-spin' : 'opacity-60'}`} />
          </button>
        </div>

        {/* Toggles */}
        <div className="space-y-1">
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <Power className={`w-3 h-3 ${status?.recoveryEnabled ? 'text-blue-400' : 'opacity-30'}`} />
              <span className="text-[11px] opacity-70">Autonomous Recovery</span>
            </div>
            <button onClick={toggleRecovery} className={`w-8 h-4 rounded-full relative transition-colors ${status?.recoveryEnabled ? 'bg-blue-600' : 'bg-white/10'}`}>
              <motion.div animate={{ x: status?.recoveryEnabled ? 18 : 2 }} className="absolute top-0.5 w-3 h-3 bg-white rounded-full" />
            </button>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <Zap className={`w-3 h-3 ${!status?.powerSave?.includes("on") ? 'text-emerald-400' : 'opacity-30'}`} />
              <span className="text-[11px] opacity-70">Performance Mode</span>
            </div>
            <button onClick={togglePowerSave} className={`w-8 h-4 rounded-full relative transition-colors ${!status?.powerSave?.includes("on") ? 'bg-emerald-600' : 'bg-white/10'}`}>
              <motion.div animate={{ x: !status?.powerSave?.includes("on") ? 18 : 2 }} className="absolute top-0.5 w-3 h-3 bg-white rounded-full" />
            </button>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-3 h-3 ${status?.bundleReady ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="text-[11px] opacity-70">Offline Bundle</span>
            </div>
            {!status?.bundleReady ? (
              <button onClick={prepareBundle} disabled={preparingBundle} className="text-[9px] font-mono text-blue-400 hover:underline">
                {preparingBundle ? 'PREPARING...' : 'PREPARE'}
              </button>
            ) : (
              <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
            )}
          </div>
        </div>

        {/* Mini Log Toggle */}
        <div className="pt-2 border-t border-white/5">
          <button 
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between text-[10px] font-mono opacity-40 hover:opacity-100 transition-opacity"
          >
            <span>HANDSHAKE TELEMETRY</span>
            {showLogs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          
          <AnimatePresence>
            {showLogs && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 120, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 bg-black/40 rounded border border-white/5 overflow-y-auto p-2 font-mono text-[9px] text-blue-200/50"
              >
                <pre className="whitespace-pre-wrap">{logs || 'Waiting for events...'}</pre>
                <div ref={logEndRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex justify-between items-center">
        <span className="text-[8px] font-mono opacity-20 uppercase tracking-tighter">Broadcom Specialist Tool v38.2</span>
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-white/10" />
          <div className="w-1 h-1 rounded-full bg-white/10" />
          <div className="w-1 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-blue-500/30 flex items-center justify-center p-4">
      {isCompact ? (
        <CompactView />
      ) : (
        <div className="max-w-5xl w-full space-y-8">
          {/* Header */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/20">
                <Wifi className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Broadcom Control Center</h1>
                <p className="text-xs font-mono opacity-40 uppercase tracking-[0.2em]">Hardware Recovery Suite v38.2</p>
              </div>
            </div>
            <button 
              onClick={() => setIsCompact(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <LayoutGrid className="w-4 h-4 opacity-60" />
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
                        <div className={`w-3 h-3 rounded-full ${status?.isHealthy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
                        <span className="text-2xl font-medium">{status?.isHealthy ? 'Operational' : 'Degraded'}</span>
                      </div>
                    </div>
                    <Activity className="w-6 h-6 opacity-20" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                      <p className="text-[9px] font-mono opacity-30 uppercase mb-2">Power Save</p>
                      <button onClick={togglePowerSave} className="flex items-center gap-2 group">
                        {status?.powerSave?.includes("on") ? <Zap className="w-4 h-4 text-amber-400" /> : <ZapOff className="w-4 h-4 text-emerald-400" />}
                        <span className="text-sm font-mono group-hover:underline">{status?.powerSave?.toUpperCase() || 'UNKNOWN'}</span>
                      </button>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                      <p className="text-[9px] font-mono opacity-30 uppercase mb-2">Kernel</p>
                      <p className="text-sm font-mono truncate">{status?.kernel || '...'}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button onClick={toggleRecovery} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                      <div className="flex items-center gap-3">
                        <Power className={`w-5 h-5 ${status?.recoveryEnabled ? 'text-blue-400' : 'opacity-20'}`} />
                        <span className="text-sm font-medium">Autonomous Recovery</span>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${status?.recoveryEnabled ? 'bg-blue-600' : 'bg-white/10'}`}>
                        <motion.div animate={{ x: status?.recoveryEnabled ? 22 : 2 }} className="absolute top-1 w-3 h-3 bg-white rounded-full" />
                      </div>
                    </button>

                    <button onClick={triggerFix} disabled={loading || status?.isFixing} className="w-full p-6 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-white/5">
                      {loading || status?.isFixing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wifi className="w-5 h-5" />}
                      {status?.isFixing ? 'RECOVERY IN PROGRESS' : 'TRIGGER FORCED RECOVERY'}
                    </button>
                  </div>
               </div>
            </div>

            {/* Right: Logs */}
            <div className="lg:col-span-7 flex flex-col h-[600px]">
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2 opacity-40">
                  <Terminal className="w-4 h-4" />
                  <span className="text-[10px] font-mono uppercase tracking-widest">Verbatim Handshake Log</span>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => setAutoRefresh(!autoRefresh)} className="text-[10px] font-mono opacity-30 hover:opacity-100 transition-opacity">
                    {autoRefresh ? 'PAUSE MONITORING' : 'RESUME MONITORING'}
                  </button>
                  <button onClick={fetchLogs} className="text-[10px] font-mono opacity-30 hover:opacity-100 transition-opacity">REFRESH</button>
                </div>
              </div>
              <div className="flex-1 rounded-3xl bg-black border border-white/10 p-6 font-mono text-xs text-blue-200/60 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                <pre className="whitespace-pre-wrap">{logs || 'Initializing telemetry stream...'}</pre>
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
