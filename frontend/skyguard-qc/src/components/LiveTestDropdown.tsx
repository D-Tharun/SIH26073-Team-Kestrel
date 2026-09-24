import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AWSStation } from '../types';
import {
  FlaskConical,
  Zap,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Activity,
  Layers,
  ShieldAlert,
} from 'lucide-react';

export interface LiveTestResult {
  station_id: string;
  station_name: string;
  reading: {
    temp_c: number;
    humidity_pct: number;
    pressure_hpa: number;
    timestamp: string;
  };
  decision: any;
  final_quality: 'NORMAL' | 'SENSOR_FAULT' | 'GENUINE_EVENT' | 'DATA_COMMUNICATION_FAULT' | 'UNCERTAIN_REVIEW';
  latency_ms: number;
}

interface LiveTestDropdownProps {
  stations: AWSStation[];
  selectedStationId: string;
  onSelectStation: (stationId: string) => void;
  onTestComplete: (result: LiveTestResult) => void;
}

export const LiveTestDropdown: React.FC<LiveTestDropdownProps> = ({
  stations,
  selectedStationId,
  onSelectStation,
  onTestComplete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stationId, setStationId] = useState(selectedStationId || 'Chennai_Meenambakkam');
  
  // Find currently targeted station
  const currentStation = stations.find((s) => s.id === stationId) || stations[0];
  
  // Form Inputs
  const [tempC, setTempC] = useState<string>('27.0');
  const [humidityPct, setHumidityPct] = useState<string>('65.0');
  const [pressureHpa, setPressureHpa] = useState<string>('1013.0');
  
  // Execution status
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<LiveTestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync stationId if selectedStationId changes externally
  useEffect(() => {
    if (selectedStationId && stations.some(s => s.id === selectedStationId)) {
      setStationId(selectedStationId);
    }
  }, [selectedStationId, stations]);

  // When station changes, initialize inputs near its current reading
  useEffect(() => {
    if (currentStation && currentStation.currentObservation) {
      setTempC(currentStation.currentObservation.tempC.toFixed(1));
      setHumidityPct(currentStation.currentObservation.rhPercent.toFixed(0));
      setPressureHpa(currentStation.currentObservation.pressureHpa.toFixed(0));
    }
  }, [stationId]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Presets
  const applyPreset = (preset: 'normal' | 'spike' | 'subzero' | 'multivariate') => {
    if (!currentStation) return;
    const baseTemp = currentStation.currentObservation.tempC;
    const baseRh = currentStation.currentObservation.rhPercent;
    const baseP = currentStation.currentObservation.pressureHpa;

    if (preset === 'normal') {
      // Normal natural variation: +0.4°C
      setTempC((baseTemp + 0.4).toFixed(1));
      setHumidityPct(Math.min(100, Math.max(20, baseRh - 1)).toFixed(0));
      setPressureHpa(baseP.toFixed(0));
    } else if (preset === 'spike') {
      // Massive unphysical spike (+35°C above current)
      setTempC((baseTemp + 35.0).toFixed(1));
      setHumidityPct(baseRh.toFixed(0));
      setPressureHpa(baseP.toFixed(0));
    } else if (preset === 'subzero') {
      // Extreme drop / hardware short (-25°C)
      setTempC((-25.0).toFixed(1));
      setHumidityPct('95');
      setPressureHpa('1010');
    } else if (preset === 'multivariate') {
      // Thermodynamic violation: 50°C and 99% RH simultaneously
      setTempC('50.0');
      setHumidityPct('99');
      setPressureHpa('1013');
    }
  };

  // Run Real ML Inference via FastAPI
  const handleRunTest = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const startTime = performance.now();

    const t = parseFloat(tempC);
    const h = parseFloat(humidityPct);
    const p = parseFloat(pressureHpa);

    if (isNaN(t) || isNaN(h) || isNaN(p)) {
      setErrorMsg('Please enter valid numeric values for all meteorological fields.');
      setIsLoading(false);
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiBase}/api/inject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          station_id: stationId,
          temp_c: t,
          humidity_pct: h,
          pressure_hpa: p,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status HTTP ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Math.round(performance.now() - startTime);

      const result: LiveTestResult = {
        station_id: stationId,
        station_name: currentStation ? currentStation.name : stationId,
        reading: data.reading || {
          temp_c: t,
          humidity_pct: h,
          pressure_hpa: p,
          timestamp: new Date().toISOString(),
        },
        decision: data.decision || {},
        final_quality: data.final_quality || 'NORMAL',
        latency_ms: latencyMs,
      };

      setLastResult(result);
      onSelectStation(stationId);
      onTestComplete(result);
    } catch (err: any) {
      console.error('Live Test Error:', err);
      setErrorMsg(err.message || 'Failed to connect to backend ML API');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Navbar Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all shadow-xs ${
          isOpen
            ? 'bg-[#4A6B78] text-white border-[#3B5763] shadow-md ring-2 ring-[#4A6B78]/40'
            : 'bg-[#DDD8CF] hover:bg-[#C7C2B8] text-[#273844] border-[#C7C2B8]'
        }`}
        title="Open Live Manual Injection & ML Quality Control Testbed"
      >
        <FlaskConical className={`w-3.5 h-3.5 ${isOpen ? 'text-amber-300' : 'text-[#4A6B78]'}`} />
        <span>Live Test</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -12, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.96, y: -8, filter: 'blur(4px)', transition: { duration: 0.16, ease: [0.32, 0.72, 0, 1] } }}
            transition={{ type: 'spring', damping: 25, stiffness: 420, mass: 0.8 }}
            className="absolute right-0 mt-2 w-[380px] bg-white/95 backdrop-blur-2xl border border-[#C7C2B8]/80 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] z-50 p-4 font-sans text-slate-800"
          >
            {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold font-mono tracking-wide text-slate-900 uppercase">
                  Live ML Testbed
                </h3>
                <p className="text-[10.5px] text-slate-500 font-mono">
                  Inject raw inputs ➔ Real PyTorch Engine
                </p>
              </div>
            </div>
            <span className="text-[9.5px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live FastAPI
            </span>
          </div>

          {/* Form */}
          <div className="mt-3.5 space-y-3">
            {/* Target Station Selection */}
            <div>
              <label className="block text-[11px] font-mono font-semibold text-slate-700 mb-1">
                Target AWS Station:
              </label>
              <select
                value={stationId}
                onChange={(e) => {
                  setStationId(e.target.value);
                  onSelectStation(e.target.value);
                }}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-colors"
              >
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.state})
                  </option>
                ))}
              </select>

              {/* Station Current Baseline Info */}
              {currentStation && (
                <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                  <span>Current Baseline:</span>
                  <span className="font-semibold text-slate-700">
                    {currentStation.currentObservation.tempC.toFixed(1)}°C &bull;{' '}
                    {currentStation.currentObservation.rhPercent.toFixed(0)}% RH &bull;{' '}
                    {currentStation.currentObservation.pressureHpa.toFixed(0)} hPa
                  </span>
                </div>
              )}
            </div>

            {/* Quick Test Presets */}
            <div>
              <div className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Quick Test Scenarios:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('normal')}
                  className="px-2 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 text-[10.5px] font-mono font-medium text-left transition-colors flex items-center justify-between"
                >
                  <span>🟢 Normal Weather</span>
                  <span className="text-[9px] opacity-75">+0.4°C</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('spike')}
                  className="px-2 py-1.5 rounded-lg border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-800 text-[10.5px] font-mono font-medium text-left transition-colors flex items-center justify-between"
                >
                  <span>🔴 Sensor Spike</span>
                  <span className="text-[9px] opacity-75">+35°C</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('subzero')}
                  className="px-2 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50/70 hover:bg-cyan-100 text-cyan-800 text-[10.5px] font-mono font-medium text-left transition-colors flex items-center justify-between"
                >
                  <span>❄️ Freeze Glitch</span>
                  <span className="text-[9px] opacity-75">-25°C</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('multivariate')}
                  className="px-2 py-1.5 rounded-lg border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-purple-800 text-[10.5px] font-mono font-medium text-left transition-colors flex items-center justify-between"
                >
                  <span>⚠️ Phys. Violation</span>
                  <span className="text-[9px] opacity-75">50°/99%</span>
                </button>
              </div>
            </div>

            {/* Manual Metric Inputs */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10.5px] font-mono font-semibold text-slate-600 mb-0.5">
                  Temp (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tempC}
                  onChange={(e) => setTempC(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-mono font-semibold text-slate-600 mb-0.5">
                  Humidity (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={humidityPct}
                  onChange={(e) => setHumidityPct(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-mono font-semibold text-slate-600 mb-0.5">
                  Pressure (hPa)
                </label>
                <input
                  type="number"
                  step="1"
                  value={pressureHpa}
                  onChange={(e) => setPressureHpa(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                {errorMsg}
              </div>
            )}

            {/* Run Button */}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleRunTest}
              className="w-full py-2 px-4 rounded-xl bg-[#273844] hover:bg-[#1E293B] text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  <span>Evaluating PyTorch ML & 4-Pillars...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-teal-400" />
                  <span>Run Real ML Quality Control</span>
                </>
              )}
            </button>

            {/* Inline Output Feedback */}
            {lastResult && (
              <div className="mt-2.5 p-2.5 rounded-xl border bg-slate-50/90 border-slate-200 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">Inference Result:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      lastResult.final_quality === 'NORMAL'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : lastResult.final_quality === 'GENUINE_EVENT'
                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                        : 'bg-red-100 text-red-800 border border-red-300 animate-pulse'
                    }`}
                  >
                    {lastResult.final_quality}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-white p-1.5 rounded border border-slate-100">
                  <div>
                    <span className="text-slate-400">S_anomaly: </span>
                    <strong className="text-slate-800">
                      {(lastResult.decision?.S_anomaly ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">S_event: </span>
                    <strong className="text-slate-800">
                      {(lastResult.decision?.S_event ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Temporal: </span>
                    <strong className="text-slate-800">
                      {lastResult.decision?.pillars?.temporal?.status || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Spatial: </span>
                    <strong className="text-slate-800">
                      {lastResult.decision?.pillars?.spatial?.status || 'N/A'}
                    </strong>
                  </div>
                </div>

                <div className="text-[9.5px] text-slate-500 text-right">
                  Inference latency: <span className="font-bold text-slate-700">{lastResult.latency_ms} ms</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
};
