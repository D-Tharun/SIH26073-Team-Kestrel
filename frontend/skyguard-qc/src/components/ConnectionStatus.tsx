import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  mode: string;
}

export function ConnectionStatus({ isConnected, mode }: ConnectionStatusProps) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
      isConnected 
        ? 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]' 
        : 'bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]'
    }`}>
      {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      <div className="flex flex-col">
        <span className="font-semibold">{isConnected ? 'LIVE WS' : 'DISCONNECTED'}</span>
        <span className="text-[9px] opacity-80 uppercase">{mode} MODE</span>
      </div>
    </div>
  );
}
