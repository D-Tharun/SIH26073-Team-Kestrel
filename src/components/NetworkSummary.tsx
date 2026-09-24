import React from 'react';
import { Radio, CheckCircle2, Activity, AlertTriangle, HelpCircle, ShieldCheck } from 'lucide-react';
import { AWSStation } from '../types';

interface NetworkSummaryProps {
  stations: AWSStation[];
  onSelectStationById?: (id: string) => void;
}

export const NetworkSummary: React.FC<NetworkSummaryProps> = ({ stations, onSelectStationById }) => {
  const total = stations.length;
  const normalCount = stations.filter((s) => s.quality === 'normal').length;
  const genuineEventCount = stations.filter((s) => s.quality === 'genuine_event').length;
  const faultCount = stations.filter((s) => s.quality === 'sensor_fault').length;
  const reviewCount = stations.filter((s) => s.quality === 'uncertain').length;

  const dualSensorAgreedCount = stations.filter((s) => s.sensors.agreement.isAgreed).length;
  const edgeQCPassCount = stations.filter((s) => s.edgeQC.overallPass).length;

  return (
    <div className="bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl p-3.5 shadow-xs select-none">
      <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[#DDD8CF]">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#4A6B78]" />
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Network Telemetry
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#475560]">
          <span className="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
          <span>7 Stations Active</span>
        </div>
      </div>

      {/* Grid of Micro Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {/* Total Stations */}
        <div className="p-2 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF]">
          <div className="text-[10px] text-[#475560] font-mono">Total AWS</div>
          <div className="text-lg font-bold font-mono text-[#273844] mt-0.5">
            {total}
          </div>
        </div>

        {/* Normal */}
        <div className="p-2 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5]">
          <div className="text-[10px] text-[#2D6A4F] font-mono flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Normal</span>
          </div>
          <div className="text-lg font-bold font-mono text-[#2D6A4F] mt-0.5">
            {normalCount}
          </div>
        </div>

        {/* Genuine Event */}
        <div className="p-2 rounded-lg bg-[#E7EFF4] border border-[#B3C8CF]">
          <div className="text-[10px] text-[#2C4C64] font-mono flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>Events</span>
          </div>
          <div className="text-lg font-bold font-mono text-[#2C4C64] mt-0.5">
            {genuineEventCount}
          </div>
        </div>

        {/* Sensor Fault */}
        <div className="p-2 rounded-lg bg-[#F8ECE9] border border-[#DFC0BB]">
          <div className="text-[10px] text-[#8E352B] font-mono flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Faults</span>
          </div>
          <div className="text-lg font-bold font-mono text-[#8E352B] mt-0.5">
            {faultCount}
          </div>
        </div>

        {/* Review / Uncertain */}
        <div className="p-2 rounded-lg bg-[#F9F4E8] border border-[#E3D4BC] col-span-2 sm:col-span-1">
          <div className="text-[10px] text-[#7D5316] font-mono flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            <span>Review</span>
          </div>
          <div className="text-lg font-bold font-mono text-[#7D5316] mt-0.5">
            {reviewCount}
          </div>
        </div>
      </div>

      {/* Network Health Indicators */}
      <div className="mt-3 pt-2.5 border-t border-[#DDD8CF] grid grid-cols-2 gap-3 text-[11px] font-mono">
        <div>
          <div className="flex justify-between text-[#475560] mb-1">
            <span>Dual Sensor Parity</span>
            <span className="font-semibold text-[#273844]">{dualSensorAgreedCount}/{total}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#DDD8CF] overflow-hidden">
            <div
              className="h-full bg-[#4A6B78] rounded-full transition-all"
              style={{ width: `${(dualSensorAgreedCount / total) * 100}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[#475560] mb-1">
            <span>Edge QC Pass Rate</span>
            <span className="font-semibold text-[#273844]">{edgeQCPassCount}/{total}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#DDD8CF] overflow-hidden">
            <div
              className="h-full bg-[#4A6B78] rounded-full transition-all"
              style={{ width: `${(edgeQCPassCount / total) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
