import React from 'react';
import { SkyGuardDecision, SkyGuardQuality } from '../types';
import { CheckCircle2, Activity, AlertTriangle, HelpCircle, Network, ShieldCheck } from 'lucide-react';

interface DecisionPanelProps {
  decision: SkyGuardDecision;
  stationName: string;
}

export const DecisionPanel: React.FC<DecisionPanelProps> = ({
  decision,
  stationName,
}) => {
  const renderStatusBadge = (status: SkyGuardQuality) => {
    switch (status) {
      case 'normal':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5] text-[#2D6A4F] font-mono font-semibold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>NORMAL</span>
          </span>
        );
      case 'genuine_event':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E7EFF4] border border-[#B3C8CF] text-[#2C4C64] font-mono font-semibold text-xs">
            <Activity className="w-3.5 h-3.5" />
            <span>GENUINE EVENT</span>
          </span>
        );
      case 'sensor_fault':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F8ECE9] border border-[#DFC0BB] text-[#8E352B] font-mono font-semibold text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>SENSOR FAULT</span>
          </span>
        );
      case 'uncertain':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F9F4E8] border border-[#E3D4BC] text-[#7D5316] font-mono font-semibold text-xs">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>REVIEW</span>
          </span>
        );
      default:
        return null;
    }
  };

  const getPillarPill = (status: SkyGuardQuality) => {
    switch (status) {
      case 'normal':
        return (
          <span className="px-2 py-0.5 rounded bg-[#E8F3ED] text-[#2D6A4F] font-mono font-semibold text-[10px]">
            Normal
          </span>
        );
      case 'genuine_event':
        return (
          <span className="px-2 py-0.5 rounded bg-[#E7EFF4] text-[#2C4C64] font-mono font-semibold text-[10px]">
            Corroborated
          </span>
        );
      case 'sensor_fault':
        return (
          <span className="px-2 py-0.5 rounded bg-[#F8ECE9] text-[#8E352B] font-mono font-semibold text-[10px]">
            Inconsistent
          </span>
        );
      case 'uncertain':
        return (
          <span className="px-2 py-0.5 rounded bg-[#F9F4E8] text-[#7D5316] font-mono font-semibold text-[10px]">
            Unavailable
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-4 select-none">
      {/* Top Banner: SKYGUARD DECISION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#DDD8CF]">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#4A6B78] font-bold">
            Quality Assessment Engine
          </div>
          <h3 className="text-base font-bold text-[#273844] mt-0.5">
            Decision Analysis
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right font-mono text-xs">
            <div className="text-[#475560]">Confidence</div>
            <div className="font-bold text-[#273844] text-sm">
              {decision.confidencePercent}%
            </div>
          </div>
          {renderStatusBadge(decision.decision)}
        </div>
      </div>

      {/* Anomaly Evidence vs Event Evidence Meters */}
      <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Evidence Signals (Anomaly vs Event)
          </span>
          <span className="text-[10px] font-mono text-[#475560]">
            S_anomaly vs S_event Fusion
          </span>
        </div>

        {/* S_anomaly bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8E352B] font-semibold">
              S_anomaly (Suspiciousness Score)
            </span>
            <span className="text-[#8E352B] font-bold">{decision.sAnomaly} / 100</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#DDD8CF] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#8E352B] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(2, decision.sAnomaly))}%` }}
            />
          </div>
          <div className="text-[10px] text-[#475560] font-mono">
            Degree of departure from physical, temporal, or multivariate consistency
          </div>
        </div>

        {/* S_event bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#2C4C64] font-semibold">
              S_event (Atmospheric Event Score)
            </span>
            <span className="text-[#2C4C64] font-bold">{decision.sEvent} / 100</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#DDD8CF] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2C4C64] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(2, decision.sEvent))}%` }}
            />
          </div>
          <div className="text-[10px] text-[#475560] font-mono">
            Corroboration by spatial peer stations, synoptic advection, and thermodynamics
          </div>
        </div>
      </div>

      {/* The 4 Pillars of Evidence */}
      <div className="space-y-2">
        <span className="font-mono text-xs font-bold text-[#475560] uppercase tracking-wider">
          Evidence Pillars Assessment
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {/* 1. Temporal Continuity */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#273844]">
                1. Temporal Continuity
              </span>
              {getPillarPill(decision.pillars.temporal.status)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
              <span>{decision.pillars.temporal.metricLabel}:</span>
              <span className="text-[#273844] font-semibold">{decision.pillars.temporal.metricValue}</span>
            </div>
            <p className="text-[11px] text-[#475560] leading-relaxed">
              {decision.pillars.temporal.rationale}
            </p>
          </div>

          {/* 2. Multivariate Consistency */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#273844]">
                2. Multivariate Balance
              </span>
              {getPillarPill(decision.pillars.multivariate.status)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
              <span>{decision.pillars.multivariate.metricLabel}:</span>
              <span className="text-[#273844] font-semibold">{decision.pillars.multivariate.metricValue}</span>
            </div>
            <p className="text-[11px] text-[#475560] leading-relaxed">
              {decision.pillars.multivariate.rationale}
            </p>
          </div>

          {/* 3. Physics & Thermodynamic Boundaries */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#273844]">
                3. Physical Thermodynamics
              </span>
              {getPillarPill(decision.pillars.physics.status)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
              <span>{decision.pillars.physics.metricLabel}:</span>
              <span className="text-[#273844] font-semibold">{decision.pillars.physics.metricValue}</span>
            </div>
            <p className="text-[11px] text-[#475560] leading-relaxed">
              {decision.pillars.physics.rationale}
            </p>
          </div>

          {/* 4. Spatial Peer Correlation */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#273844]">
                4. Spatial Peer Correlation
              </span>
              {getPillarPill(decision.pillars.spatial.status)}
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
              <span>{decision.pillars.spatial.metricLabel}:</span>
              <span className="text-[#273844] font-semibold">{decision.pillars.spatial.metricValue}</span>
            </div>
            <p className="text-[11px] text-[#475560] leading-relaxed">
              {decision.pillars.spatial.rationale}
            </p>
          </div>
        </div>
      </div>

      {/* Regional Event Visualization */}
      <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
              Regional Spatial Buddy Network
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#475560]">
            {decision.buddies.length} Stations Connected
          </span>
        </div>

        {decision.buddies.length > 0 ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {decision.buddies.map((buddy) => (
                <div
                  key={buddy.stationId}
                  className="p-2 rounded-lg bg-[#FFFFFF] border border-[#DDD8CF] flex items-center justify-between gap-2 text-xs font-mono"
                >
                  <div>
                    <div className="font-semibold text-[#273844]">{buddy.stationName}</div>
                    <div className="text-[10px] text-[#475560]">
                      {buddy.distanceKm} km &bull; {buddy.tempC.toFixed(1)}°C &bull; {buddy.rhPercent.toFixed(1)}% RH
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        buddy.supportsEvent
                          ? 'bg-[#E7EFF4] text-[#2C4C64] border border-[#B3C8CF]'
                          : 'bg-[#F8ECE9] text-[#8E352B] border border-[#DFC0BB]'
                      }`}
                    >
                      {buddy.supportsEvent ? 'Supports' : 'Discordant'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {decision.regionalEventDetected && (
              <div className="p-2 rounded-lg bg-[#E7EFF4] border border-[#B3C8CF] text-xs font-mono text-[#2C4C64] flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-[#2C4C64] shrink-0" />
                <span>{decision.regionalEventDescription}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-[#FFFFFF] text-xs font-mono text-[#475560] text-center">
            No adjacent buddy AWS stations within valid microclimatic envelope.
          </div>
        )}
      </div>

      {/* Plain Language Assessment & Operational Recommended Action */}
      <div className="p-3.5 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] space-y-2">
        <div className="text-[11px] font-mono uppercase font-bold text-[#4A6B78] flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#4A6B78]" />
          <span>Operational Assessment</span>
        </div>

        <p className="text-xs text-[#273844] leading-relaxed">
          {decision.assessment}
        </p>

        <div className="pt-2 border-t border-[#DDD8CF] flex items-start gap-2 text-xs font-mono">
          <span className="font-bold text-[#475560] shrink-0">ACTION:</span>
          <span className="text-[#273844] font-medium">{decision.recommendedAction}</span>
        </div>
      </div>
    </div>
  );
};
