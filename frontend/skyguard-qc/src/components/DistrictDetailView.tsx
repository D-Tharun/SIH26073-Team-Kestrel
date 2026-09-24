import React from 'react';
import { DistrictInfo, StateInfo, AWSStation, SkyGuardQuality } from '../types';
import { ArrowLeft, Thermometer, Droplets, Gauge, Radio, CircleDashed, CheckCircle2, Activity, AlertTriangle, HelpCircle, ChevronRight } from 'lucide-react';

interface DistrictDetailViewProps {
  district: DistrictInfo;
  state: StateInfo;
  stations: AWSStation[];
  onSelectStation: (stationId: string) => void;
  onBackToState: () => void;
}

export const DistrictDetailView: React.FC<DistrictDetailViewProps> = ({
  district,
  state,
  stations,
  onSelectStation,
  onBackToState,
}) => {
  const districtStations = stations.filter((s) => s.id === district.stationId);
  const hasStation = district.hasStation && districtStations.length > 0;
  const primaryStation = districtStations[0];

  const renderQualityBadge = (quality: SkyGuardQuality) => {
    switch (quality) {
      case 'normal':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5] text-[#2D6A4F] font-mono font-semibold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>NORMAL</span>
          </div>
        );
      case 'genuine_event':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E7EFF4] border border-[#B3C8CF] text-[#2C4C64] font-mono font-semibold text-xs">
            <Activity className="w-3.5 h-3.5" />
            <span>GENUINE EVENT</span>
          </div>
        );
      case 'sensor_fault':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F8ECE9] border border-[#DFC0BB] text-[#8E352B] font-mono font-semibold text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>SENSOR FAULT</span>
          </div>
        );
      case 'uncertain':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F9F4E8] border border-[#E3D4BC] text-[#7D5316] font-mono font-semibold text-xs">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>REVIEW</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#DDD8CF] border border-[#C7C2B8] text-[#475560] font-mono text-xs">
            <CircleDashed className="w-3.5 h-3.5" />
            <span>NO OBSERVATION DATA</span>
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 bg-transparent text-[#273844] select-none overflow-y-auto space-y-4">
      {/* Header & Breadcrumb Back */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#C7C2B8]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToState}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] text-[#273844] border border-[#C7C2B8] text-xs font-mono font-semibold transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Return to {state.name}</span>
          </button>

          <div>
            <h2 className="text-xl font-bold text-[#273844] flex items-center gap-2">
              <span>{district.name} District</span>
              <span className="text-xs text-[#475560] font-mono font-normal">
                ({state.name})
              </span>
            </h2>
          </div>
        </div>

        <div>{renderQualityBadge(hasStation ? district.quality : 'no_data')}</div>
      </div>

      {/* Main District Body */}
      <div className="space-y-4 max-w-4xl mx-auto w-full">
        {hasStation && primaryStation ? (
          <>
            {/* Current Atmospheric Conditions Card */}
            <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#DDD8CF]">
                <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
                  Current Atmospheric Conditions
                </span>
                <span className="text-xs font-mono text-[#4A6B78] font-semibold">
                  Station: {primaryStation.name}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Temperature */}
                <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
                    <Thermometer className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#475560]">Temperature</div>
                    <div className="text-xl font-bold font-mono text-[#273844]">
                      {primaryStation.currentObservation.tempC.toFixed(1)} °C
                    </div>
                  </div>
                </div>

                {/* Relative Humidity */}
                <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
                    <Droplets className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#475560]">Relative Humidity</div>
                    <div className="text-xl font-bold font-mono text-[#273844]">
                      {primaryStation.currentObservation.rhPercent.toFixed(1)} %
                    </div>
                  </div>
                </div>

                {/* Pressure */}
                <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
                    <Gauge className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#475560]">Pressure</div>
                    <div className="text-xl font-bold font-mono text-[#273844]">
                      {primaryStation.currentObservation.pressureHpa.toFixed(1)} hPa
                    </div>
                  </div>
                </div>
              </div>

              {/* Atmospheric Summary & SkyGuard Decision */}
              <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center justify-between gap-3 text-xs font-mono">
                <div>
                  <span className="text-[#475560]">Atmospheric Profile: </span>
                  <span className="text-[#273844] font-medium">{primaryStation.atmosphericDescription}</span>
                </div>
                <div className="shrink-0 text-[#475560]">
                  Observed at: <span className="text-[#273844] font-semibold">{primaryStation.currentObservation.observedAt}</span>
                </div>
              </div>
            </div>

            {/* Actual AWS Stations Belonging to this District */}
            <div className="space-y-2.5">
              <span className="font-mono text-xs font-bold text-[#475560] uppercase tracking-wider">
                Operational Weather Stations in {district.name} ({districtStations.length})
              </span>

              {districtStations.map((st) => (
                <div
                  key={st.id}
                  onClick={() => onSelectStation(st.id)}
                  className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] hover:border-[#4A6B78] transition-all cursor-pointer shadow-xs group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-[#4A6B78]" />
                      <h3 className="text-base font-bold text-[#273844] group-hover:text-[#4A6B78]">
                        {st.name}
                      </h3>
                      <span className="text-xs font-mono text-[#475560] px-2 py-0.5 rounded bg-[#DDD8CF]">
                        {st.code}
                      </span>
                    </div>
                    <p className="text-xs text-[#475560] font-mono">
                      Hardware: {st.hardwareModel} ({st.mcuType}) &bull; Firm: {st.firmwareVersion} &bull; Dual BME280 Active
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    {renderQualityBadge(st.quality)}
                    <button className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#4A6B78] hover:bg-[#385460] text-white font-mono text-xs font-semibold transition-colors">
                      <span>Inspect</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* District with No Actual SkyGuard AWS Station */
          <div className="p-8 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#DDD8CF] flex items-center justify-center mx-auto text-[#475560]">
              <CircleDashed className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#273844]">
              No SkyGuard observation station in {district.name}
            </h3>
            <p className="text-xs text-[#475560] max-w-md mx-auto font-mono">
              The SkyGuard network currently operates 7 validated testbed stations across India. No hardware is currently deployed in {district.name} district.
            </p>
            <button
              onClick={onBackToState}
              className="mt-2 px-3.5 py-1.5 rounded-lg bg-[#DDD8CF] hover:bg-[#C7C2B8] text-[#273844] text-xs font-mono transition-colors"
            >
              &larr; Back to {state.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
