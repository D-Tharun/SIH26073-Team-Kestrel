import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LiveTestResult } from './LiveTestDropdown';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  Radio,
  ShieldCheck,
  ShieldAlert,
  CloudSun,
  Activity,
} from 'lucide-react';

interface LiveTestPopupProps {
  result: LiveTestResult | null;
  onClose: () => void;
}

export const LiveTestPopup: React.FC<LiveTestPopupProps> = ({ result, onClose }) => {
  useEffect(() => {
    if (!result) return;
    // Auto-dismiss after 8.5 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 8500);
    return () => clearTimeout(timer);
  }, [result, onClose]);

  const isFault = result?.final_quality === 'SENSOR_FAULT' || result?.final_quality === 'DATA_COMMUNICATION_FAULT';
  const isEvent = result?.final_quality === 'GENUINE_EVENT';
  const isNormal = result?.final_quality === 'NORMAL';

  const sAnomaly = typeof result?.decision?.S_anomaly === 'number' ? result.decision.S_anomaly : 0;
  const sEvent = typeof result?.decision?.S_event === 'number' ? result.decision.S_event : 0;
  const rationale =
    result?.decision?.pillars?.temporal?.rationale ||
    result?.decision?.pillars?.spatial?.rationale ||
    result?.decision?.evidence_summary ||
    'Real-time physical analysis completed';

  return (
    <AnimatePresence mode="wait">
      {result && (
        <div className="fixed top-16 right-6 z-[9999] pointer-events-none select-none">
          <motion.div
            key={`${result.station_id}-${result.reading.timestamp}`}
            initial={{ opacity: 0, y: -30, scale: 0.92, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, scale: 0.94, filter: 'blur(6px)', transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
            transition={{
              type: 'spring',
              damping: 24,
              stiffness: 380,
              mass: 0.8,
            }}
            className="w-[420px] pointer-events-auto"
          >
            {/* macOS Frosted Glass Surface */}
            <div
              className={`relative overflow-hidden rounded-2xl border p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-colors ${
                isFault
                  ? 'bg-red-950/85 border-red-500/50 text-red-50 ring-1 ring-red-400/30'
                  : isEvent
                  ? 'bg-slate-900/85 border-blue-500/50 text-blue-50 ring-1 ring-blue-400/30'
                  : 'bg-emerald-950/85 border-emerald-500/50 text-emerald-50 ring-1 ring-emerald-400/30'
              }`}
            >
              {/* macOS Specular Gloss Highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />

              {/* Header Bar */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                      isFault
                        ? 'bg-red-500/25 text-red-400 border border-red-400/30'
                        : isEvent
                        ? 'bg-blue-500/25 text-blue-400 border border-blue-400/30'
                        : 'bg-emerald-500/25 text-emerald-400 border border-emerald-400/30'
                    }`}
                  >
                    {isFault ? (
                      <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
                    ) : isEvent ? (
                      <CloudSun className="w-5 h-5 text-blue-400" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
                          isFault
                            ? 'bg-red-500/30 text-red-200 border border-red-400/30'
                            : isEvent
                            ? 'bg-blue-500/30 text-blue-200 border border-blue-400/30'
                            : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                        }`}
                      >
                        {isFault
                          ? '🚨 CRITICAL ANOMALY ALERT'
                          : isEvent
                          ? '🌐 GENUINE WEATHER EVENT'
                          : '✅ QC TEST PASSED'}
                      </span>
                      <span className="text-[10px] font-mono opacity-60">
                        {result.latency_ms}ms
                      </span>
                    </div>

                    <h4 className="text-sm font-bold mt-1 text-white tracking-tight">
                      {result.station_name}
                    </h4>
                  </div>
                </div>

                {/* macOS Close Button */}
                <button
                  onClick={onClose}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer"
                  title="Close Notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Telemetry Query Details */}
              <div className="mt-3 grid grid-cols-3 gap-2 bg-black/35 backdrop-blur-md rounded-xl p-2.5 border border-white/10 text-[11px] font-mono">
                <div>
                  <span className="text-white/50 text-[9.5px] block">Temperature</span>
                  <span className="font-bold text-white text-xs">
                    {result.reading.temp_c.toFixed(1)}°C
                  </span>
                </div>
                <div>
                  <span className="text-white/50 text-[9.5px] block">Humidity</span>
                  <span className="font-bold text-white text-xs">
                    {result.reading.humidity_pct.toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-white/50 text-[9.5px] block">Pressure</span>
                  <span className="font-bold text-white text-xs">
                    {result.reading.pressure_hpa.toFixed(0)} hPa
                  </span>
                </div>
              </div>

              {/* ML & 4-Pillar Evaluation Summary */}
              <div className="mt-2.5 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/60">ML Evidence (S_anomaly):</span>
                  <span
                    className={`font-bold ${
                      sAnomaly >= 0.4 ? 'text-red-300 font-extrabold' : 'text-emerald-300'
                    }`}
                  >
                    {sAnomaly.toFixed(2)}
                  </span>
                </div>

                <div className="text-[11px] text-white/90 bg-white/5 p-2 rounded-lg border border-white/5 leading-relaxed">
                  {rationale}
                </div>
              </div>

              {/* Visual Map Impact Notice */}
              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] font-mono">
                {isFault ? (
                  <div className="flex items-center gap-1.5 text-red-300 font-semibold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_#f87171]"></span>
                    <span>Map Status: Highlighted in RED (Sensor Fault)</span>
                  </div>
                ) : isEvent ? (
                  <div className="flex items-center gap-1.5 text-blue-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_#60a5fa]"></span>
                    <span>Map Status: Highlighted in BLUE (Extreme Event)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
                    <span>Map Status: Unchanged (Green / Validated)</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
