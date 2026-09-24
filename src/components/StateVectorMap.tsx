import React, { useState } from 'react';
import { StateInfo, DistrictInfo, AWSStation, SkyGuardQuality } from '../types';
import { Radio, ArrowLeft, CheckCircle2, Activity, AlertTriangle, HelpCircle, CircleDashed, MapPin } from 'lucide-react';
import { ActualStateMap } from './ActualStateMap';

interface StateVectorMapProps {
  state: StateInfo;
  stations: AWSStation[];
  onSelectDistrict: (districtId: string) => void;
  onSelectStation: (stationId: string) => void;
  onBackToNational: () => void;
}

export const StateVectorMap: React.FC<StateVectorMapProps> = ({
  state,
  stations,
  onSelectDistrict,
  onSelectStation,
  onBackToNational,
}) => {
  const [hoveredDistrict, setHoveredDistrict] = useState<DistrictInfo | null>(null);

  const stateStations = stations.filter((s) => s.state.toLowerCase() === state.name.toLowerCase());
  const stationsCount = stateStations.length;
  const normalCount = stateStations.filter((s) => s.quality === 'normal').length;
  const genuineCount = stateStations.filter((s) => s.quality === 'genuine_event').length;
  const faultCount = stateStations.filter((s) => s.quality === 'sensor_fault').length;
  const reviewCount = stateStations.filter((s) => s.quality === 'uncertain').length;

  const renderQualityBadge = (quality: SkyGuardQuality, hasStation: boolean) => {
    if (!hasStation) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-mono text-[#475560]">
          <CircleDashed className="w-3 h-3 text-[#475560]" />
          <span>No Data</span>
        </span>
      );
    }
    switch (quality) {
      case 'normal':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#2D6A4F] font-semibold">
            <CheckCircle2 className="w-3 h-3 text-[#2D6A4F]" />
            <span>NORMAL</span>
          </span>
        );
      case 'genuine_event':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#2C4C64] font-semibold">
            <Activity className="w-3 h-3 text-[#2C4C64]" />
            <span>EVENT</span>
          </span>
        );
      case 'sensor_fault':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#8E352B] font-semibold">
            <AlertTriangle className="w-3 h-3 text-[#8E352B]" />
            <span>FAULT</span>
          </span>
        );
      case 'uncertain':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono text-[#7D5316] font-semibold">
            <HelpCircle className="w-3 h-3 text-[#7D5316]" />
            <span>REVIEW</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 bg-transparent text-[#273844] select-none overflow-y-auto space-y-4">
      {/* Header & Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#C7C2B8]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToNational}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] text-[#273844] border border-[#C7C2B8] text-xs font-mono font-semibold transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Return to National Map</span>
          </button>

          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#273844] flex items-center gap-2">
              <span>{state.name}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-[#DDD8CF] text-[#273844] font-mono">
                {state.code}
              </span>
            </h2>
            <p className="text-xs text-[#475560]">
              Regional Observation Network & Quality Assessment
            </p>
          </div>
        </div>

        {/* State Network Stats */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#273844]">
            Stations: <span className="font-bold">{stationsCount}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5] text-[#2D6A4F]">
            Normal: <span className="font-bold">{normalCount}</span>
          </div>
          {genuineCount > 0 && (
            <div className="px-2.5 py-1 rounded-lg bg-[#E7EFF4] border border-[#B3C8CF] text-[#2C4C64]">
              Events: <span className="font-bold">{genuineCount}</span>
            </div>
          )}
          {faultCount > 0 && (
            <div className="px-2.5 py-1 rounded-lg bg-[#F8ECE9] border border-[#DFC0BB] text-[#8E352B]">
              Faults: <span className="font-bold">{faultCount}</span>
            </div>
          )}
          {reviewCount > 0 && (
            <div className="px-2.5 py-1 rounded-lg bg-[#F9F4E8] border border-[#E3D4BC] text-[#7D5316]">
              Review: <span className="font-bold">{reviewCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Actual Map, District Grid & Stations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
        {/* Actual Map & Districts List Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Actual Leaflet State Map */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase font-bold text-[#273844] tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#4A6B78]" />
                <span>Regional Map ({state.name})</span>
              </span>
              <span className="text-[11px] text-[#475560] font-mono">
                Interactive Slippy Map
              </span>
            </div>
            <ActualStateMap
              state={state}
              stations={stations}
              onSelectDistrict={onSelectDistrict}
              onSelectStation={onSelectStation}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-mono uppercase font-bold text-[#475560] tracking-wider">
              Districts ({state.districts.length})
            </span>
            <span className="text-[11px] text-[#475560] font-mono">
              Select district to inspect telemetry
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {state.districts.map((dist) => {
              const hasStation = dist.hasStation;

              return (
                <div
                  key={dist.id}
                  onClick={() => onSelectDistrict(dist.id)}
                  onMouseEnter={() => setHoveredDistrict(dist)}
                  onMouseLeave={() => setHoveredDistrict(null)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-xs ${
                    hasStation
                      ? 'bg-[#FFFFFF] border-[#C7C2B8] hover:border-[#4A6B78]'
                      : 'bg-[#E8E6DD] border-[#DDD8CF] opacity-80 hover:opacity-100 hover:bg-[#FFFFFF]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-[#273844] flex items-center gap-1.5">
                        {dist.name}
                      </h4>
                      <p className="text-[11px] text-[#475560] mt-0.5 font-mono">
                        {hasStation
                          ? `AWS Station Operational`
                          : 'No observation available'}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {renderQualityBadge(dist.quality, hasStation)}
                    </div>
                  </div>

                  {/* Telemetry preview if station present */}
                  {hasStation && dist.tempC !== undefined && (
                    <div className="mt-1 pt-1.5 border-t border-[#DDD8CF] flex items-center justify-between text-xs font-mono text-[#273844]">
                      <span>{dist.tempC.toFixed(1)}°C</span>
                      <span>{dist.rhPercent?.toFixed(1)}% RH</span>
                      <span>{dist.pressureHpa?.toFixed(1)} hPa</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational Stations in this State Column */}
        <div className="space-y-3">
          <span className="text-xs font-mono uppercase font-bold text-[#475560] tracking-wider">
            Operational Weather Stations ({stateStations.length})
          </span>

          {stateStations.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] text-center text-[#475560] text-xs font-mono">
              <CircleDashed className="w-6 h-6 text-[#4A6B78] mx-auto mb-2" />
              <div>No SkyGuard AWS field station installed in this state yet.</div>
              <div className="text-[#475560] text-[10px] mt-1">
                The 7 SkyGuard testbed stations are located in TN, RJ, DL, HP, KA, MH, and ML.
              </div>
            </div>
          ) : (
            stateStations.map((st) => (
              <div
                key={st.id}
                onClick={() => onSelectStation(st.id)}
                className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] hover:border-[#4A6B78] shadow-xs cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-[#4A6B78]" />
                      <h4 className="font-bold text-sm text-[#273844] group-hover:text-[#4A6B78]">
                        {st.name}
                      </h4>
                    </div>
                    <div className="text-xs text-[#475560] font-mono mt-0.5">
                      {st.code} &bull; Elev. {st.elevationMeters}m
                    </div>
                  </div>

                  {renderQualityBadge(st.quality, true)}
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2 p-2 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] text-center font-mono text-xs">
                  <div>
                    <div className="text-[10px] text-[#475560]">TEMP</div>
                    <div className="font-bold text-[#273844]">{st.currentObservation.tempC.toFixed(1)}°C</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#475560]">HUMIDITY</div>
                    <div className="font-bold text-[#273844]">{st.currentObservation.rhPercent.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#475560]">PRESSURE</div>
                    <div className="font-bold text-[#273844]">{st.currentObservation.pressureHpa.toFixed(1)}</div>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#475560]">
                  <span>MCU: {st.mcuType}</span>
                  <span className="text-[#4A6B78] font-semibold group-hover:underline">
                    View Dual BME280 &rarr;
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
