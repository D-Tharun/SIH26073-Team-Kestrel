import React from 'react';
import { Database, Play, Square } from 'lucide-react';

interface DataModeSelectorProps {
  mode: 'static' | 'demo' | 'live';
  onModeChange: (mode: 'static' | 'demo' | 'live') => void;
  simulatorRunning: boolean;
}

export function DataModeSelector({ mode, onModeChange, simulatorRunning }: DataModeSelectorProps) {
  return (
    <div className="flex items-center bg-[#E8E6DD] rounded-lg p-0.5 border border-[#C7C2B8]">
      <button
        onClick={() => onModeChange('static')}
        className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-colors ${
          mode === 'static' ? 'bg-[#FFFFFF] shadow-sm text-[#273844]' : 'text-[#475560] hover:text-[#273844]'
        }`}
      >
        <Square className="w-3 h-3" />
        STATIC
      </button>
      <button
        onClick={() => onModeChange('demo')}
        className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-colors ${
          mode === 'demo' ? 'bg-[#FFFFFF] shadow-sm text-[#273844]' : 'text-[#475560] hover:text-[#273844]'
        }`}
      >
        <Play className={`w-3 h-3 ${simulatorRunning && mode === 'demo' ? 'text-[#137333]' : ''}`} />
        REPLAY
      </button>
      <button
        onClick={() => onModeChange('live')}
        className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-colors ${
          mode === 'live' ? 'bg-[#FFFFFF] shadow-sm text-[#273844]' : 'text-[#475560] hover:text-[#273844]'
        }`}
      >
        <Database className="w-3 h-3" />
        MQTT
      </button>
    </div>
  );
}
