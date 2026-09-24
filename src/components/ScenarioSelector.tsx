import React from 'react';
import { DemoScenario } from '../types';
import { Layers, CheckCircle2, Activity, AlertTriangle, HelpCircle } from 'lucide-react';

interface ScenarioSelectorProps {
  scenarios: DemoScenario[];
  selectedScenarioId: string;
  onSelectScenario: (scenario: DemoScenario) => void;
}

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  scenarios,
  selectedScenarioId,
  onSelectScenario,
}) => {
  return (
    <div className="bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl p-3.5 shadow-xs select-none space-y-2.5">
      <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#4A6B78]" />
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Operational QC Scenarios
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#475560]">
          5 Canonical Testbeds
        </span>
      </div>

      <div className="space-y-1.5">
        {scenarios.map((sc) => {
          const isSelected = sc.id === selectedScenarioId;
          const isNormal = sc.targetQuality === 'normal';
          const isEvent = sc.targetQuality === 'genuine_event';
          const isFault = sc.targetQuality === 'sensor_fault';
          const isReview = sc.targetQuality === 'uncertain';

          let statusBadge = (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#E8F3ED] text-[#2D6A4F] font-semibold">
              Validated
            </span>
          );
          if (isFault) {
            statusBadge = (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#F8ECE9] text-[#8E352B] font-semibold">
                Sensor Fault
              </span>
            );
          } else if (isEvent) {
            statusBadge = (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#E7EFF4] text-[#2C4C64] font-semibold">
                Extreme Event
              </span>
            );
          } else if (isReview) {
            statusBadge = (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#F9F4E8] text-[#7D5316] font-semibold">
                Review
              </span>
            );
          }

          return (
            <button
              key={sc.id}
              onClick={() => onSelectScenario(sc)}
              className={`w-full p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between gap-1 group ${
                isSelected
                  ? 'bg-[#FFFFFF] border-[#4A6B78] ring-1 ring-[#4A6B78]/40 shadow-xs'
                  : 'bg-[#E8E6DD]/70 hover:bg-[#DDD8CF]/60 border-[#DDD8CF] text-[#273844]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 w-full">
                <span className="text-[10px] font-mono font-bold text-[#475560] group-hover:text-[#273844]">
                  {sc.code}
                </span>
                {statusBadge}
              </div>

              <div className="text-xs font-medium text-[#273844] mt-0.5 group-hover:text-[#1E293B]">
                {sc.title}
              </div>

              <div className="text-[11px] text-[#475560] leading-snug line-clamp-2 mt-0.5">
                {sc.subtitle || sc.operationalSummary}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
