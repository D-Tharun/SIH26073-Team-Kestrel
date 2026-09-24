import React from 'react';
import { AlertTriangle, Activity, HelpCircle, CheckCircle2, ChevronRight, Bell } from 'lucide-react';
import { AlertItem } from '../types';

interface AlertsPanelProps {
  alerts: AlertItem[];
  onInvestigateAlert: (stationId: string) => void;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts, onInvestigateAlert }) => {
  return (
    <div className="bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl p-3.5 shadow-xs select-none flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#DDD8CF]">
        <div className="flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-[#4A6B78]" />
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Telemetry Alerts
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#DDD8CF] text-[#475560] font-semibold">
          {alerts.length} Active
        </span>
      </div>

      <div className="space-y-1.5 overflow-y-auto max-h-[190px] pr-1">
        {alerts.length === 0 ? (
          <div className="p-3 text-center text-xs text-[#475560] font-mono">
            No active anomalies or warning flags.
          </div>
        ) : (
          alerts.map((alert) => {
            const isFault = alert.quality === 'sensor_fault';
            const isEvent = alert.quality === 'genuine_event';
            const isReview = alert.quality === 'uncertain';

            let cardStyle = 'border-[#DDD8CF] bg-[#E8E6DD]/50 hover:bg-[#DDD8CF]/50 text-[#273844]';
            let iconEl = <CheckCircle2 className="w-3.5 h-3.5 text-[#2D6A4F]" />;
            let badgeEl = (
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#E8F3ED] text-[#2D6A4F] font-semibold">
                NORMAL
              </span>
            );

            if (isFault) {
              cardStyle = 'border-[#DFC0BB] bg-[#F8ECE9]/60 hover:bg-[#F8ECE9] text-[#273844]';
              iconEl = <AlertTriangle className="w-3.5 h-3.5 text-[#8E352B]" />;
              badgeEl = (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#F8ECE9] text-[#8E352B] font-semibold">
                  SENSOR FAULT
                </span>
              );
            } else if (isEvent) {
              cardStyle = 'border-[#B3C8CF] bg-[#E7EFF4]/60 hover:bg-[#E7EFF4] text-[#273844]';
              iconEl = <Activity className="w-3.5 h-3.5 text-[#2C4C64]" />;
              badgeEl = (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#E7EFF4] text-[#2C4C64] font-semibold">
                  GENUINE EVENT
                </span>
              );
            } else if (isReview) {
              cardStyle = 'border-[#E3D4BC] bg-[#F9F4E8]/60 hover:bg-[#F9F4E8] text-[#273844]';
              iconEl = <HelpCircle className="w-3.5 h-3.5 text-[#7D5316]" />;
              badgeEl = (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#F9F4E8] text-[#7D5316] font-semibold">
                  REVIEW
                </span>
              );
            }

            return (
              <div
                key={alert.id}
                onClick={() => onInvestigateAlert(alert.stationId)}
                className={`p-2 rounded-lg border transition-all cursor-pointer group flex items-start justify-between gap-2 ${cardStyle}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{iconEl}</div>

                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-xs text-[#273844]">
                        {alert.stationName}
                      </span>
                      <span className="text-[10px] text-[#475560] font-mono">
                        ({alert.districtName})
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475560] leading-tight mt-0.5">
                      {alert.description || alert.title}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {badgeEl}
                  <ChevronRight className="w-3.5 h-3.5 text-[#475560] group-hover:text-[#273844] transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
