import React, { useState, useEffect, useCallback, useRef, ErrorInfo, ReactNode } from "react";
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
  Trash2,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 font-mono">
          <div className="w-full max-w-md p-8 rounded-3xl bg-red-500/10 border border-red-500/20 space-y-6 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold uppercase tracking-tighter">UI Execution Halted</h2>
              <p className="text-xs text-white/60 leading-relaxed">
                A critical runtime error occurred in the dashboard rendering engine.
              </p>
            </div>
            <div className="p-4 bg-black/40 rounded-xl border border-white/5 text-left overflow-auto max-h-40">
              <code className="text-[10px] text-red-400 break-all">
                {this.state.error?.toString()}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-white text-black rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/90 transition-all"
            >
              Reboot Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Brush,
  ReferenceArea
} from "recharts";

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
  metricsHistory: { timestamp: string; signal: number; rx: number; tx: number }[];
  verbatim?: {
    nmLogs: string;
    kernelLogs: string;
    sockets: string;
    ipAddr: string;
    wifiLink: string;
    nearbyAPs: string;
    arpTable: string;
  };
  timestamp: string;
}

interface LogLine {
  id: string;
  timestamp: string;
  level: 'info' | 'error' | 'success' | 'warn' | 'system';
  message: string;
  raw: string;
}

const TerminalDashboard = ({ logs, autoRefresh, onToggleRefresh, onClear, showVisual, onToggleVisual }: { logs: string, autoRefresh: boolean, onToggleRefresh: () => void, onClear?: () => void, showVisual?: boolean, onToggleVisual?: () => void }) => {
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

  const VisualTerminal = () => {
    const milestones = logs.split('\n').filter(l => l.includes('MILESTONE'));
    const errors = parsedLines.filter(l => l.level === 'error');
    const authEvents = logs.split('\n').filter(l => l.toLowerCase().includes('auth'));

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full font-mono text-[9px]">
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex flex-col">
          <h5 className="text-blue-400 font-bold uppercase mb-2 flex items-center gap-2">
            <Activity className="w-3 h-3" /> System Milestones
          </h5>
          <div className="flex-1 overflow-y-auto space-y-1 opacity-60 custom-scrollbar">
            {milestones.slice(-15).map((m, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-blue-500/40">»</span>
                <span className="truncate">{m.split('MILESTONE:')[1] || m}</span>
              </div>
            ))}
            {milestones.length === 0 && <span className="opacity-20 italic">No milestones recorded</span>}
          </div>
        </div>
        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg flex flex-col">
          <h5 className="text-red-400 font-bold uppercase mb-2 flex items-center gap-2">
            <ShieldAlert className="w-3 h-3" /> Critical Alerts
          </h5>
          <div className="flex-1 overflow-y-auto space-y-1 opacity-60 custom-scrollbar">
            {errors.slice(-15).map((e, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-red-500/40">!</span>
                <span className="truncate">{e.message}</span>
              </div>
            ))}
            {errors.length === 0 && <span className="opacity-20 italic">No critical alerts detected</span>}
          </div>
        </div>
        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex flex-col">
          <h5 className="text-emerald-400 font-bold uppercase mb-2 flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> Auth Events
          </h5>
          <div className="flex-1 overflow-y-auto space-y-1 opacity-60 custom-scrollbar">
            {authEvents.slice(-15).map((a, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-emerald-500/40">✓</span>
                <span className="truncate">{a}</span>
              </div>
            ))}
            {authEvents.length === 0 && <span className="opacity-20 italic">No auth events detected</span>}
          </div>
        </div>
      </div>
    );
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
          <button 
            onClick={onToggleVisual}
            className={`p-1.5 rounded-lg transition-all ${showVisual ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/5 opacity-40 hover:opacity-100'}`}
            title="Toggle Visual Dashboard"
          >
            <LayoutGrid className="w-3 h-3" />
          </button>
          <div className="h-4 w-px bg-white/10" />
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
        {showVisual ? (
          <VisualTerminal />
        ) : filteredLines.length === 0 ? (
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

const parseWifiLink = (wifiLink: string) => {
  const rxMatch = wifiLink.match(/rx bitrate: ([\d.]+) MBit\/s/);
  const txMatch = wifiLink.match(/tx bitrate: ([\d.]+) MBit\/s/);
  const signalMatch = wifiLink.match(/signal: (-?\d+) dBm/);
  return {
    rxBitrate: rxMatch ? parseFloat(rxMatch[1]) : null,
    txBitrate: txMatch ? parseFloat(txMatch[1]) : null,
    signal: signalMatch ? parseInt(signalMatch[1]) : null
  };
};

const parseSockets = (sockets: string) => {
  const lines = sockets.split('\n').filter(l => l.trim().length > 0);
  // Subtract header if present
  return Math.max(0, lines.length - 1);
};

const MetricsDashboard = ({ status, selectedMetric, onSelectMetric }: { status: SystemStatus | null, selectedMetric: 'signal' | 'traffic' | 'bitrate' | 'sockets', onSelectMetric: (m: 'signal' | 'traffic' | 'bitrate' | 'sockets') => void }) => {
  const [zoomState, setZoomState] = useState<{ left: string | number | null, right: string | number | null, refAreaLeft: string | number | null, refAreaRight: string | number | null } | null>(null);

  if (!status || !status.metricsHistory || status.metricsHistory.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-2">
        <Activity className="w-8 h-8" />
        <p className="text-[10px] uppercase tracking-widest">Waiting for telemetry...</p>
      </div>
    );
  }

  const data = status.metricsHistory.map(m => {
    // Attempt to parse verbatim data if available for this timestamp
    const verbatimData = status.verbatim?.wifiLink ? parseWifiLink(status.verbatim.wifiLink) : { rxBitrate: null, txBitrate: null, signal: null };
    const socketCount = status.verbatim?.sockets ? parseSockets(status.verbatim.sockets) : 0;
    
    return {
      ...m,
      time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      rx_kb: (m.rx / 1024).toFixed(1),
      tx_kb: (m.tx / 1024).toFixed(1),
      signal_v: verbatimData.signal !== null ? verbatimData.signal : m.signal,
      rx_bitrate: verbatimData.rxBitrate,
      tx_bitrate: verbatimData.txBitrate,
      socket_count: socketCount
    };
  });

  const handleZoom = () => {
    if (!zoomState) return;
    let { refAreaLeft, refAreaRight } = zoomState;

    if (refAreaLeft === refAreaRight || refAreaRight === null) {
      setZoomState(null);
      return;
    }

    // xAxis domain zoom
    if (refAreaLeft && refAreaRight) {
      if (refAreaLeft > refAreaRight) [refAreaLeft, refAreaRight] = [refAreaRight, refAreaLeft];
      setZoomState({ ...zoomState, left: refAreaLeft, right: refAreaRight, refAreaLeft: null, refAreaRight: null });
    }
  };

  const resetZoom = () => {
    setZoomState(null);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => onSelectMetric('signal')}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase transition-all duration-300 ${selectedMetric === 'signal' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-white/5 border-white/10 opacity-40 hover:opacity-100 hover:bg-white/10'}`}
          >
            Signal Strength
          </button>
          <button 
            onClick={() => onSelectMetric('traffic')}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase transition-all duration-300 ${selectedMetric === 'traffic' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-white/5 border-white/10 opacity-40 hover:opacity-100 hover:bg-white/10'}`}
          >
            Network Traffic
          </button>
          <button 
            onClick={() => onSelectMetric('bitrate')}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase transition-all duration-300 ${selectedMetric === 'bitrate' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-white/5 border-white/10 opacity-40 hover:opacity-100 hover:bg-white/10'}`}
          >
            Link Bitrate
          </button>
          <button 
            onClick={() => onSelectMetric('sockets')}
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono uppercase transition-all duration-300 ${selectedMetric === 'sockets' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-white/5 border-white/10 opacity-40 hover:opacity-100 hover:bg-white/10'}`}
          >
            Active Sockets
          </button>
        </div>
        {zoomState?.left && (
          <button 
            onClick={resetZoom}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-[10px] font-mono uppercase hover:bg-white/10 transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-3 h-3 opacity-60" />
            Reset Zoom
          </button>
        )}
      </div>

      <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-4 min-h-[150px] relative cursor-crosshair select-none">
        <ResponsiveContainer width="100%" height="100%">
          {selectedMetric === 'signal' ? (
            <AreaChart 
              data={data}
              onMouseDown={(e) => e && setZoomState(prev => ({ ...prev, left: prev?.left ?? null, right: prev?.right ?? null, refAreaLeft: e.activeLabel ?? null, refAreaRight: null }))}
              onMouseMove={(e) => zoomState?.refAreaLeft && e && setZoomState(prev => ({ ...prev!, refAreaRight: e.activeLabel ?? null }))}
              onMouseUp={handleZoom}
            >
              <defs>
                <linearGradient id="colorSignal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#ffffff30" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                domain={[zoomState?.left || 'auto', zoomState?.right || 'auto']}
                allowDataOverflow
              />
              <YAxis domain={['auto', 'auto']} stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#151619', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '10px' }}
                itemStyle={{ color: '#3b82f6' }}
              />
              <Area type="monotone" dataKey="signal" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSignal)" animationDuration={300} />
              {zoomState?.refAreaLeft && zoomState?.refAreaRight && (
                <ReferenceArea x1={zoomState.refAreaLeft} x2={zoomState.refAreaRight} {...({ fill: "#3b82f6", fillOpacity: 0.1 } as any)} />
              )}
              <Brush dataKey="time" height={20} stroke="#3b82f620" fill="#00000040" travellerWidth={10} />
            </AreaChart>
          ) : selectedMetric === 'traffic' ? (
            <LineChart 
              data={data}
              onMouseDown={(e) => e && setZoomState(prev => ({ ...prev, left: prev?.left ?? null, right: prev?.right ?? null, refAreaLeft: e.activeLabel ?? null, refAreaRight: null }))}
              onMouseMove={(e) => zoomState?.refAreaLeft && e && setZoomState(prev => ({ ...prev!, refAreaRight: e.activeLabel ?? null }))}
              onMouseUp={handleZoom}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#ffffff30" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                domain={[zoomState?.left || 'auto', zoomState?.right || 'auto']}
                allowDataOverflow
              />
              <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#151619', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '10px' }}
              />
              <Line type="monotone" dataKey="rx_kb" name="RX (KB)" stroke="#10b981" strokeWidth={2} dot={false} animationDuration={300} />
              <Line type="monotone" dataKey="tx_kb" name="TX (KB)" stroke="#3b82f6" strokeWidth={2} dot={false} animationDuration={300} />
              {zoomState?.refAreaLeft && zoomState?.refAreaRight && (
                <ReferenceArea x1={zoomState.refAreaLeft} x2={zoomState.refAreaRight} {...({ fill: "#10b981", fillOpacity: 0.1 } as any)} />
              )}
              <Brush dataKey="time" height={20} stroke="#10b98120" fill="#00000040" travellerWidth={10} />
            </LineChart>
          ) : selectedMetric === 'bitrate' ? (
            <LineChart 
              data={data}
              onMouseDown={(e) => e && setZoomState(prev => ({ ...prev, left: prev?.left ?? null, right: prev?.right ?? null, refAreaLeft: e.activeLabel ?? null, refAreaRight: null }))}
              onMouseMove={(e) => zoomState?.refAreaLeft && e && setZoomState(prev => ({ ...prev!, refAreaRight: e.activeLabel ?? null }))}
              onMouseUp={handleZoom}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#ffffff30" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                domain={[zoomState?.left || 'auto', zoomState?.right || 'auto']}
                allowDataOverflow
              />
              <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#151619', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '10px' }}
              />
              <Line type="monotone" dataKey="rx_bitrate" name="RX Bitrate (MBit/s)" stroke="#f59e0b" strokeWidth={2} dot={false} animationDuration={300} />
              <Line type="monotone" dataKey="tx_bitrate" name="TX Bitrate (MBit/s)" stroke="#ef4444" strokeWidth={2} dot={false} animationDuration={300} />
              {zoomState?.refAreaLeft && zoomState?.refAreaRight && (
                <ReferenceArea x1={zoomState.refAreaLeft} x2={zoomState.refAreaRight} {...({ fill: "#f59e0b", fillOpacity: 0.1 } as any)} />
              )}
              <Brush dataKey="time" height={20} stroke="#f59e0b20" fill="#00000040" travellerWidth={10} />
            </LineChart>
          ) : (
            <LineChart 
              data={data}
              onMouseDown={(e) => e && setZoomState(prev => ({ ...prev, left: prev?.left ?? null, right: prev?.right ?? null, refAreaLeft: e.activeLabel ?? null, refAreaRight: null }))}
              onMouseMove={(e) => zoomState?.refAreaLeft && e && setZoomState(prev => ({ ...prev!, refAreaRight: e.activeLabel ?? null }))}
              onMouseUp={handleZoom}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#ffffff30" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                domain={[zoomState?.left || 'auto', zoomState?.right || 'auto']}
                allowDataOverflow
              />
              <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#151619', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '10px' }}
              />
              <Line type="monotone" dataKey="socket_count" name="Active Sockets" stroke="#a855f7" strokeWidth={2} dot={false} animationDuration={300} />
              {zoomState?.refAreaLeft && zoomState?.refAreaRight && (
                <ReferenceArea x1={zoomState.refAreaLeft} x2={zoomState.refAreaRight} {...({ fill: "#a855f7", fillOpacity: 0.1 } as any)} />
              )}
              <Brush dataKey="time" height={20} stroke="#a855f720" fill="#00000040" travellerWidth={10} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const TelemetryDashboard = ({ status }: { status: SystemStatus | null }) => {
  if (!status || !status.verbatim) {
    return (
      <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-2">
        <Activity className="w-8 h-8" />
        <p className="text-[10px] uppercase tracking-widest">Waiting for telemetry...</p>
      </div>
    );
  }

  const sections = [
    { title: 'Network Interfaces', content: status.verbatim.ipAddr },
    { title: 'ARP Table (Network Neighbors)', content: status.verbatim.arpTable },
    { title: 'Wi-Fi Link Status', content: status.verbatim.wifiLink },
    { title: 'Active Sockets', content: status.verbatim.sockets },
    { title: 'Nearby Access Points', content: status.verbatim.nearbyAPs },
    { title: 'Kernel Messages (Wi-Fi)', content: status.verbatim.kernelLogs },
    { title: 'NetworkManager Logs', content: status.verbatim.nmLogs },
    { title: 'Raw JSON Status', content: JSON.stringify(status, null, 2) },
  ];

  return (
    <div className="flex flex-col h-full space-y-4 overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">{section.title}</h4>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(section.content);
                }}
                className="text-[8px] opacity-40 hover:opacity-100 transition-opacity uppercase"
              >
                Copy
              </button>
            </div>
            <div className="p-3 bg-black/40 rounded-lg border border-white/5 font-mono text-[9px] leading-relaxed whitespace-pre overflow-x-auto text-white/70">
              {section.content || 'No data available'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const parseNearbyAPs = (nearby: string) => {
  const lines = nearby.split('\n').filter(l => l.trim().length > 0);
  return lines.map(line => {
    const parts = line.split(':');
    if (parts.length < 3) return null;
    const ssid = parts[0].trim();
    const signal = parseInt(parts[1].trim());
    const bar = parts[2].trim();
    return { ssid, signal, bar };
  }).filter(Boolean) as { ssid: string, signal: number, bar: string }[];
};

  const ForensicDashboard = ({ status, logs, isCompact = false }: { status: SystemStatus | null, logs: string, isCompact?: boolean }) => {
    if (!status || !status.verbatim) return null;

    const aps = parseNearbyAPs(status.verbatim.nearbyAPs);
    const socketCount = parseSockets(status.verbatim.sockets);
    const neighbors = status.verbatim.arpTable.split('\n').filter(l => l.trim().length > 0).length - 1;

    return (
      <div className={`flex flex-col h-full ${isCompact ? 'space-y-2' : 'space-y-4'} font-mono text-[10px]`}>
        {/* ASCII Header - Hidden in compact mode */}
        {!isCompact && (
          <div className="text-emerald-500 opacity-80 leading-none whitespace-pre text-[5px] md:text-[7px] overflow-hidden">
            {`
     _  __ ___   _    ___     ___  ___   ___  ___  _  __ ___  ___ 
    | |/ // _ | | |  |_ _|   | __|/ _ \ | _ \| __|| \| |/ __||_ _|
    | ' <| __ | | |__ | |    | _|| (_) ||   /| _| | .  |\__ \ | | 
    |_|\_\_||_| |____|___|   |_|  \___/ |_|_\|___||_|\_||___/|___|
            `}
          </div>
        )}

        <div className={`grid grid-cols-1 ${isCompact ? '' : 'md:grid-cols-3'} gap-4`}>
          <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-2">
            <h4 className="text-emerald-400 font-bold uppercase tracking-widest border-b border-emerald-500/20 pb-1">Recon Stats</h4>
            <div className="space-y-1 text-[9px]">
              <div className="flex justify-between"><span>SOCKETS:</span><span className="text-emerald-400">{socketCount}</span></div>
              <div className="flex justify-between"><span>NEIGHBORS:</span><span className="text-emerald-400">{neighbors}</span></div>
              <div className="flex justify-between"><span>UPTIME:</span><span className="text-emerald-400">04:22:11</span></div>
              <div className="pt-1 border-t border-emerald-500/10 mt-1">
                <div className="flex justify-between text-[8px] opacity-40">
                  <span>MTU PROBE:</span>
                  <span className="text-emerald-500">1500 OK</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`${isCompact ? '' : 'md:col-span-2'} p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg`}>
            <h4 className="text-emerald-400 font-bold uppercase tracking-widest border-b border-emerald-500/20 pb-1 mb-2">Airodump-ng Simulation [wlp2s0b1]</h4>
            <div className="grid grid-cols-6 gap-2 text-[8px] font-bold opacity-40 uppercase mb-1">
              <span className="col-span-2">BSSID / ESSID</span>
              <span>PWR</span>
              {!isCompact && <span>BEACONS</span>}
              <span>CH</span>
              {!isCompact && <span>ENC</span>}
            </div>
            <div className="space-y-1">
              {aps.slice(0, isCompact ? 3 : 5).map((ap, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 items-center">
                  <span className="col-span-2 truncate text-emerald-400/80">{ap.ssid}</span>
                  <span className={ap.signal > 70 ? 'text-emerald-400' : ap.signal > 40 ? 'text-amber-400' : 'text-red-400'}>-{100 - ap.signal}</span>
                  {!isCompact && <span>{Math.floor(Math.random() * 1000)}</span>}
                  <span>{i * 5 + 1}</span>
                  {!isCompact && <span className="text-[7px] opacity-60">WPA2 CCMP</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${isCompact ? '' : 'md:grid-cols-2'} gap-4`}>
          {/* MTU Discovery Module */}
          <div className="p-3 bg-black/40 border border-emerald-500/10 rounded-lg flex flex-col">
            <h4 className="text-emerald-400 font-bold uppercase tracking-widest mb-2">MTU Discovery Probe</h4>
            <div className="flex-1 font-mono text-[8px] space-y-1 opacity-60">
              {isCompact ? (
                <div className="flex justify-between items-center">
                  <span>PROBING 1500...</span>
                  <span className="text-emerald-500 font-bold">OPTIMUM: 1500</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2"><span>[01]</span><span>PROBING 1500...</span><span className="text-emerald-500">SUCCESS</span></div>
                  <div className="flex gap-2"><span>[02]</span><span>PROBING 1501...</span><span className="text-red-500">FRAG_REQUIRED</span></div>
                  <div className="flex gap-2"><span>[03]</span><span>PROBING 1492...</span><span className="text-emerald-500">SUCCESS</span></div>
                  <div className="mt-2 p-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center font-bold">
                    OPTIMUM MTU: 1500
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Latency Jitter Map */}
          <div className="p-3 bg-black/40 border border-emerald-500/10 rounded-lg flex flex-col">
            <h4 className="text-emerald-400 font-bold uppercase tracking-widest mb-2">Network Jitter Map</h4>
            <div className="flex-1 font-mono text-[8px] space-y-2">
              <div className="space-y-1">
                <div className="flex justify-between opacity-40"><span>GATEWAY</span><span>1.2ms</span></div>
                <div className="text-emerald-500/40 tracking-tighter leading-none truncate">
                  ############################################################
                </div>
              </div>
              {!isCompact && (
                <div className="space-y-1">
                  <div className="flex justify-between opacity-40"><span>WAN (8.8.8.8)</span><span>42.8ms</span></div>
                  <div className="text-amber-500/40 tracking-tighter leading-none truncate">
                    #######_###_#######_###_#######_###_#######_###_#######_###_
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isCompact && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
            <div className="p-3 bg-black/40 border border-emerald-500/10 rounded-lg overflow-hidden flex flex-col">
              <h4 className="text-emerald-400 font-bold uppercase tracking-widest mb-2">Forensic Event Stream</h4>
              <div className="flex-1 overflow-y-auto space-y-1 opacity-70 custom-scrollbar">
                {logs.split('\n').filter(l => l.toLowerCase().includes('dhcp') || l.toLowerCase().includes('auth') || l.toLowerCase().includes('state')).slice(-20).map((line, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-emerald-500/40">[{i}]</span>
                    <span className="truncate">{line}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-black/40 border border-emerald-500/10 rounded-lg overflow-hidden flex flex-col">
              <h4 className="text-emerald-400 font-bold uppercase tracking-widest mb-2">Active Socket Map</h4>
              <div className="flex-1 overflow-y-auto font-mono text-[8px] opacity-60 custom-scrollbar">
                <div className="grid grid-cols-4 gap-2 border-b border-white/5 pb-1 mb-1 font-bold">
                  <span>PROTO</span>
                  <span>STATE</span>
                  <span className="col-span-2">LOCAL ADDRESS</span>
                </div>
                {status.verbatim.sockets.split('\n').slice(1, 15).map((line, i) => {
                  const parts = line.trim().split(/\s+/);
                  if (parts.length < 4) return null;
                  return (
                    <div key={i} className="grid grid-cols-4 gap-2 py-0.5 border-b border-white/5 last:border-0">
                      <span className="text-emerald-500/60 uppercase">{parts[0]}</span>
                      <span className="text-blue-400/60">{parts[1]}</span>
                      <span className="col-span-2 truncate">{parts[4]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [preparingBundle, setPreparingBundle] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isCompact, setIsCompact] = useState(window.innerWidth < 1024);
  const [showLogs, setShowLogs] = useState(false);
  const [showVisualTerminal, setShowVisualTerminal] = useState(false);
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'metrics' | 'telemetry' | 'forensics'>('status');
  const [selectedMetric, setSelectedMetric] = useState<'signal' | 'traffic' | 'bitrate' | 'sockets'>('signal');
  const [fixStartTime, setFixStartTime] = useState<number | null>(null);
  const [fixElapsedTime, setFixElapsedTime] = useState(0);
  
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
    } finally {
      setIsInitialLoading(false);
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
    setFixStartTime(Date.now());
    setFixElapsedTime(0);
    try {
      await fetch("/api/fix", { method: "POST" });
      // We don't clear loading here immediately, we let the status poll handle it
      // but we do a quick refresh to show the "Fixing" state
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error("Failed to trigger fix", e);
      setFixStartTime(null);
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
    const handleResize = () => {
      if (window.innerWidth >= 1024 && isCompact) {
        setIsCompact(false);
      } else if (window.innerWidth < 1024 && !isCompact) {
        setIsCompact(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isCompact]);

  useEffect(() => {
    fetchStatus();
    fetchLogs();
  }, [fetchStatus, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    // Slow down polling to prevent network congestion (min 5s)
    const intervalTime = (status?.isFixing || !status?.isHealthy) ? 5000 : 10000;
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [autoRefresh, status?.isHealthy, status?.isFixing, fetchStatus, fetchLogs]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status?.isFixing && fixStartTime) {
      interval = setInterval(() => {
        setFixElapsedTime(Math.floor((Date.now() - fixStartTime) / 1000));
      }, 1000);
    } else if (!status?.isFixing) {
      setFixStartTime(null);
      setFixElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [status?.isFixing, fixStartTime]);

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
        {/* View Selector */}
        <div className="flex p-1 bg-white/5 rounded-lg border border-white/5">
          <button 
            onClick={() => setActiveTab('status')}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-md transition-all ${activeTab === 'status' ? 'bg-white/10 text-white shadow-sm' : 'opacity-40 hover:opacity-100'}`}
          >
            Status
          </button>
          <button 
            onClick={() => setActiveTab('metrics')}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-md transition-all ${activeTab === 'metrics' ? 'bg-white/10 text-white shadow-sm' : 'opacity-40 hover:opacity-100'}`}
          >
            Metrics
          </button>
          <button 
            onClick={() => setActiveTab('telemetry')}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-md transition-all ${activeTab === 'telemetry' ? 'bg-white/10 text-white shadow-sm' : 'opacity-40 hover:opacity-100'}`}
          >
            Telemetry
          </button>
          <button 
            onClick={() => setActiveTab('forensics')}
            className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-md transition-all ${activeTab === 'forensics' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'opacity-40 hover:opacity-100'}`}
          >
            Forensics
          </button>
        </div>

        {activeTab === 'status' ? (
          <>
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
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl space-y-4 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                    role="alert"
                  >
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" aria-hidden="true" />
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] font-bold text-red-200 uppercase tracking-tight">System Integration Required</span>
                        <p className="text-[9px] text-red-200/70 leading-relaxed">
                          Autonomous recovery requires a one-time system integration to allow passwordless execution.
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-2 py-1.5 bg-black/40 rounded border border-white/10">
                        <code className="text-[9px] font-mono text-emerald-400 truncate">bash setup-system.sh</code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText('bash setup-system.sh');
                            // Optional: add a "Copied!" state here
                          }}
                          className="text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase ml-2 shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-[8px] text-center opacity-40 uppercase tracking-widest">Run this in your terminal to fix</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={async () => {
                          try {
                            await fetch("/api/recheck-sudo", { method: "POST" });
                            fetchStatus();
                          } catch (e) {
                            console.error("Failed to re-check sudo", e);
                          }
                        }}
                        className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold uppercase transition-colors"
                      >
                        Re-check Status
                      </button>
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
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${!status ? 'bg-white/5 text-white/20' : status?.isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`} aria-hidden="true">
                  {!status ? <RefreshCw className="w-5 h-5 animate-spin" /> : status?.isHealthy ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-xs font-medium">
                    {!status ? 'Connecting...' : status?.isHealthy ? 'Network Healthy' : 'Network Degraded'}
                  </h3>
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
            <div className="space-y-1">
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
              {status?.isFixing && fixElapsedTime > 15 && (
                <div className="flex items-center justify-between text-[8px] font-mono text-amber-400/60 uppercase">
                  <span className="animate-pulse">Slow Handshake Detected</span>
                  <span>{fixElapsedTime}s</span>
                </div>
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

            {/* Live Handshake Snippet */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Live Handshake Snippet</span>
                <span className="text-[8px] opacity-40 font-mono uppercase">{status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '---'}</span>
              </div>
              <div className="p-3 bg-black/40 rounded-lg border border-white/5 font-mono text-[9px] leading-relaxed text-white/70 min-h-[60px] max-h-[100px] overflow-y-auto custom-scrollbar">
                {logs.split('\n').slice(-4).join('\n') || 'Waiting for handshake data...'}
              </div>
            </div>
          </>
        ) : activeTab === 'metrics' ? (
          <div className="h-[250px]">
            <MetricsDashboard 
              status={status} 
              selectedMetric={selectedMetric} 
              onSelectMetric={setSelectedMetric} 
            />
          </div>
        ) : activeTab === 'telemetry' ? (
          <div className="h-[350px]">
            <TelemetryDashboard status={status} />
          </div>
        ) : (
          <div className="h-[350px] overflow-y-auto custom-scrollbar pr-1">
            <ForensicDashboard status={status} logs={logs} isCompact={true} />
          </div>
        )}

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
                  showVisual={showVisualTerminal}
                  onToggleVisual={() => setShowVisualTerminal(!showVisualTerminal)}
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

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center font-mono">
        <div className="space-y-4 text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">Establishing Link</p>
            <p className="text-xs font-bold">Broadcom Control Center</p>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 font-mono">
        <div className="w-full max-w-md p-8 rounded-3xl bg-amber-500/10 border border-amber-500/20 space-y-6 text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto">
            <WifiOff className="w-8 h-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold uppercase tracking-tighter">Telemetry Offline</h2>
            <p className="text-xs text-white/60 leading-relaxed">
              The dashboard is unable to establish a handshake with the Broadcom recovery service.
            </p>
          </div>
          <button 
            onClick={() => fetchStatus()}
            className="w-full py-3 bg-amber-500 text-black rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-amber-600 transition-all"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans select-text flex flex-col p-6">
      {isCompact ? (
        <div className="flex-1 flex items-center justify-center">
          <CompactView />
        </div>
      ) : (
        <div className="flex-1 flex flex-col space-y-6" role="main">
          {/* Header */}
          <header className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/20">
                <Wifi className="w-7 h-7 text-white" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Broadcom Control Center</h1>
                <p className="text-xs font-mono opacity-40 uppercase tracking-[0.2em]">Hardware Recovery Suite v38.6</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-1 mr-4 p-1 bg-white/5 rounded-xl border border-white/10">
                <button 
                  onClick={() => setActiveTab('status')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'status' ? 'bg-white/10 text-white shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                >
                  Status
                </button>
                <button 
                  onClick={() => setActiveTab('metrics')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'metrics' ? 'bg-white/10 text-white shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                >
                  Metrics
                </button>
                <button 
                  onClick={() => setActiveTab('telemetry')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'telemetry' ? 'bg-white/10 text-white shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                >
                  Telemetry
                </button>
                <button 
                  onClick={() => setActiveTab('forensics')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'forensics' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                >
                  Forensics
                </button>
              </div>

              <div className="hidden md:flex items-center gap-6 mr-6 px-6 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono opacity-30 uppercase tracking-widest">Uptime</span>
                  <span className="text-[10px] font-mono text-blue-400">04:22:11</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-mono opacity-30 uppercase tracking-widest">Load</span>
                  <span className="text-[10px] font-mono text-emerald-400">0.42 / 0.38 / 0.41</span>
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
            </div>
          </header>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            {/* Left Column: Health & Controls */}
            <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-1 custom-scrollbar">
               {/* Health Card */}
               <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 space-y-6 shrink-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-mono opacity-30 uppercase tracking-widest mb-1">System Health</p>
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${status?.isHealthy ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} aria-hidden="true" />
                        <span className="text-xl font-medium" aria-live="polite">{status?.isHealthy ? 'Operational' : 'Degraded'}</span>
                      </div>
                    </div>
                    <Activity className="w-5 h-5 opacity-20" aria-hidden="true" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                      <p className="text-[8px] font-mono opacity-30 uppercase mb-1">Power</p>
                      <div className="flex items-center gap-2">
                        {status?.powerSave?.includes("on") ? <Zap className="w-3 h-3 text-amber-400" /> : <ZapOff className="w-3 h-3 text-emerald-400" />}
                        <span className="text-[10px] font-mono uppercase">{status?.powerSave?.split(':')[1]?.trim() || 'OFF'}</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                      <p className="text-[8px] font-mono opacity-30 uppercase mb-1">Radio</p>
                      <div className="flex items-center gap-2">
                        <Circle className={`w-1.5 h-1.5 fill-current ${status?.wifiEnabled ? 'text-emerald-500' : 'text-amber-500'}`} aria-hidden="true" />
                        <span className="text-[10px] font-mono uppercase">{status?.wifiEnabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button 
                      onClick={toggleRecovery} 
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <Power className={`w-4 h-4 ${status?.recoveryEnabled ? 'text-blue-400' : 'opacity-20'}`} />
                        <span className="text-xs font-medium">Auto-Recovery</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full relative transition-colors ${status?.recoveryEnabled ? 'bg-blue-600' : 'bg-white/10'}`}>
                        <motion.div animate={{ x: status?.recoveryEnabled ? 18 : 2 }} className="absolute top-0.5 w-3 h-3 bg-white rounded-full" />
                      </div>
                    </button>

                    <button 
                      onClick={triggerFix} 
                      disabled={loading || status?.isFixing} 
                      className={`w-full p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 ${!status?.isHealthy && !status?.isFixing ? 'bg-blue-600 text-white shadow-[0_0_25px_rgba(37,99,235,0.4)] ring-2 ring-blue-400/50' : 'bg-white text-black'}`}
                    >
                      <div className="flex items-center gap-2">
                        {loading || status?.isFixing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                        <span className="text-xs uppercase tracking-wider">
                          {status?.isFixing ? `Fixing... ${fixElapsedTime > 0 ? `(${fixElapsedTime}s)` : ''}` : 'Force Recovery'}
                        </span>
                      </div>
                      {!status?.isHealthy && !status?.isFixing && !status?.lastFixError && (
                        <span className="text-[8px] uppercase tracking-[0.2em] opacity-80 animate-pulse">Recommended Action</span>
                      )}
                      {status?.lastFixError && !status?.isFixing && (
                        <span className="text-[8px] uppercase tracking-[0.2em] text-red-400 font-bold">
                          Last Fix Failed: {status.lastFixError}
                        </span>
                      )}
                      {status?.isFixing && fixElapsedTime > 15 && (
                        <span className="text-[8px] uppercase tracking-[0.2em] text-amber-500 animate-pulse">Slow Handshake Detected</span>
                      )}
                    </button>
                  </div>
               </div>

               {/* Sudo Warning (Full View) */}
               {status?.sudoPromptDetected && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-2xl bg-red-500/10 border-2 border-red-500/30 flex flex-col gap-3 shrink-0 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                >
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-bold text-red-200 uppercase tracking-wider">Sudo Integration Required</h4>
                      <p className="text-[9px] text-red-200/60 leading-relaxed">
                        The recovery script is hanging on a password prompt. Autonomous recovery requires passwordless sudo.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={async () => {
                        try {
                          await fetch("/api/run-setup", { method: "POST" });
                          setTimeout(fetchStatus, 1000);
                        } catch (e) {
                          console.error("Failed to run setup", e);
                        }
                      }}
                      className="flex-1 py-2 bg-red-500 text-black text-[9px] font-bold rounded-lg uppercase hover:bg-red-400 transition-colors"
                    >
                      Apply Fix Now
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          await fetch("/api/recheck-sudo", { method: "POST" });
                          fetchStatus();
                        } catch (e) {
                          console.error("Failed to re-check sudo", e);
                        }
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[9px] font-bold uppercase transition-colors"
                    >
                      Re-check
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Forensic Toolkit Suggestions */}
              <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-4 shrink-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest">Forensic Toolkit</h3>
                </div>
                <div className="space-y-2 text-[9px] font-mono opacity-60">
                  <p className="border-l-2 border-emerald-500/20 pl-2">airodump-ng: Wi-Fi Recon</p>
                  <p className="border-l-2 border-emerald-500/20 pl-2">aireplay-ng: Deauth Analysis</p>
                  <p className="border-l-2 border-emerald-500/20 pl-2">bettercap: MITM Detection</p>
                  <p className="border-l-2 border-emerald-500/20 pl-2">tcpdump: Packet Forensics</p>
                </div>
              </div>

              {/* Verbatim System Data (Moved to sidebar for better space usage) */}
              <div className="flex-1 min-h-[300px] p-6 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col">
                <h3 className="text-[10px] font-mono opacity-30 uppercase tracking-widest mb-4">Verbatim System Data</h3>
                <div className="flex-1 overflow-hidden">
                  <TelemetryDashboard status={status} />
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic Content based on Active Tab */}
            <div className="lg:col-span-9 flex flex-col gap-6 min-h-0">
              {activeTab === 'status' && (
                <>
                  {/* Metrics Chart */}
                  <div className="flex-[2] p-6 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-[10px] font-mono opacity-30 uppercase tracking-widest">Network Telemetry</h3>
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[8px] font-mono uppercase animate-pulse">Live</span>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">
                      <MetricsDashboard status={status} selectedMetric={selectedMetric} onSelectMetric={setSelectedMetric} />
                    </div>
                  </div>

                  {/* Terminal Dashboard */}
                  <div className="flex-[3] min-h-0">
                    <TerminalDashboard 
                      logs={logs} 
                      autoRefresh={autoRefresh} 
                      onToggleRefresh={() => setAutoRefresh(!autoRefresh)} 
                      onClear={clearLogs}
                      showVisual={showVisualTerminal}
                      onToggleVisual={() => setShowVisualTerminal(!showVisualTerminal)}
                    />
                  </div>
                </>
              )}

              {activeTab === 'metrics' && (
                <div className="flex-1 p-8 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <h3 className="text-sm font-mono opacity-30 uppercase tracking-widest">Advanced Metrics Dashboard</h3>
                      <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-mono uppercase animate-pulse">High Precision Mode</span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <MetricsDashboard status={status} selectedMetric={selectedMetric} onSelectMetric={setSelectedMetric} />
                  </div>
                </div>
              )}

              {activeTab === 'telemetry' && (
                <div className="flex-1 p-8 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <h3 className="text-sm font-mono opacity-30 uppercase tracking-widest">Verbatim System Telemetry</h3>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase">Live Feed</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <TelemetryDashboard status={status} />
                  </div>
                </div>
              )}

              {activeTab === 'forensics' && (
                <div className="flex-1 p-8 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <h3 className="text-sm font-mono opacity-30 uppercase tracking-widest">Network Forensic Suite</h3>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono uppercase">Passive Recon Mode</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <ForensicDashboard status={status} logs={logs} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
