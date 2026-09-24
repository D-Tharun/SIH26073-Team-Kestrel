import React from 'react';
import { CheckCircle2, Activity, AlertTriangle, HelpCircle, CircleDashed } from 'lucide-react';

export const MapLegend: React.FC = () => {
  return (
    <div className="bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl p-3 text-xs shadow-md space-y-2.5 select-none">
      <div className="flex items-center justify-between pb-1.5 border-b border-[#DDD8CF]">
        <span className="font-mono text-[10px] font-bold text-[#273844] uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#4A6B78]"></span>
          QC Status Legend
        </span>
        <span className="text-[10px] text-[#475560] font-mono">Classification</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {/* Normal */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5]">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
          <div>
            <div className="font-semibold text-[#2D6A4F] leading-tight text-[11px]">Normal</div>
            <div className="text-[9px] text-[#475560]">Valid telemetry</div>
          </div>
        </div>

        {/* Genuine Event */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#E7EFF4] border border-[#B3C8CF]">
          <Activity className="w-3.5 h-3.5 text-[#2C4C64] shrink-0" />
          <div>
            <div className="font-semibold text-[#2C4C64] leading-tight text-[11px]">Genuine Event</div>
            <div className="text-[9px] text-[#475560]">Real severe weather</div>
          </div>
        </div>

        {/* Sensor Fault */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#F8ECE9] border border-[#DFC0BB]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#8E352B] shrink-0" />
          <div>
            <div className="font-semibold text-[#8E352B] leading-tight text-[11px]">Sensor Fault</div>
            <div className="text-[9px] text-[#475560]">Hardware anomaly</div>
          </div>
        </div>

        {/* Review */}
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[#F9F4E8] border border-[#E3D4BC]">
          <HelpCircle className="w-3.5 h-3.5 text-[#7D5316] shrink-0" />
          <div>
            <div className="font-semibold text-[#7D5316] leading-tight text-[11px]">Review</div>
            <div className="text-[9px] text-[#475560]">Uncertain parity</div>
          </div>
        </div>
      </div>
    </div>
  );
};
