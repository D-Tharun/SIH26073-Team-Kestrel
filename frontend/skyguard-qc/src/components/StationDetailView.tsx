import React from 'react';
import { AWSStation, SkyGuardQuality } from '../types';
import { ArrowLeft, Radio, CheckCircle2, Activity, AlertTriangle, HelpCircle, Thermometer, Droplets, Gauge, Clock, MapPin } from 'lucide-react';
import { DualBME280Card } from './DualBME280Card';
import { EdgeQCPanel } from './EdgeQCPanel';
import { DecisionPanel } from './DecisionPanel';
import { ObservationChart } from './ObservationChart';
import { StationMiniMap } from './StationMiniMap';

interface StationDetailViewProps {
  station: AWSStation;
  onSelectSensor: (sensorId: 'bme280_1' | 'bme280_2') => void;
  onBackToDistrict: () => void;
  onBackToNational: () => void;
}

export const StationDetailView: React.FC<StationDetailViewProps> = ({
  station,
  onSelectSensor,
  onBackToDistrict,
  onBackToNational,
}) => {
  const renderQualityBadge = (quality: SkyGuardQuality) => {
    switch (quality) {
      case 'normal':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5] text-[#2D6A4F] font-mono font-semibold text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>NORMAL OBSERVATION</span>
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
            <span>REVIEW REQUIRED</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 bg-transparent text-[#273844] select-none overflow-y-auto space-y-4">
      {/* Top Navigation & Station Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#C7C2B8]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDistrict}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] text-[#273844] border border-[#C7C2B8] text-xs font-mono font-semibold transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Return to {station.district}</span>
          </button>

          <div>
            <h2 className="text-xl font-bold text-[#273844] flex items-center gap-2">
              <Radio className="w-5 h-5 text-[#4A6B78]" />
              <span>{station.name}</span>
            </h2>
            <div className="text-xs text-[#475560] font-mono flex items-center gap-2 mt-0.5">
              <span>{station.code}</span>
              <span>&bull;</span>
              <span>{station.district}, {station.state}</span>
              <span>&bull;</span>
              <span>Elev: {station.elevationMeters}m</span>
            </div>
          </div>
        </div>

        <div>{renderQualityBadge(station.quality)}</div>
      </div>

      {/* Current Atmospheric Observation Summary Cards */}
      <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Current Physical Observation
          </span>
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#475560]">
            <Clock className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Observed: <strong className="text-[#273844]">{station.currentObservation.observedAt}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Temperature */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
              <Thermometer className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#475560]">Temperature</div>
              <div className="text-lg font-bold font-mono text-[#273844]">
                {station.currentObservation.tempC.toFixed(1)} °C
              </div>
            </div>
          </div>

          {/* Humidity */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
              <Droplets className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#475560]">Rel. Humidity</div>
              <div className="text-lg font-bold font-mono text-[#273844]">
                {station.currentObservation.rhPercent.toFixed(1)} %
              </div>
            </div>
          </div>

          {/* Barometric Pressure */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#475560]">Barometric</div>
              <div className="text-lg font-bold font-mono text-[#273844]">
                {station.currentObservation.pressureHpa.toFixed(1)} hPa
              </div>
            </div>
          </div>

          {/* Dew Point */}
          <div className="p-3 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-[#4A6B78]">
              <Droplets className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-[#475560]">Dew Point</div>
              <div className="text-lg font-bold font-mono text-[#273844]">
                {station.currentObservation.dewPointC.toFixed(1)} °C
              </div>
            </div>
          </div>
        </div>

        {/* Derived Atmospheric State */}
        <div className="pt-2 border-t border-[#DDD8CF] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[#475560]">Atmospheric State:</span>
            <span className="px-2 py-0.5 rounded bg-[#DDD8CF] text-[#273844] font-semibold capitalize">
              {station.atmosphericState.replace('_', ' ')}
            </span>
            <span className="text-[#475560]">{station.atmosphericDescription}</span>
          </div>
          <div className="text-[#475560]">
            Hardware: {station.hardwareModel} ({station.mcuType})
          </div>
        </div>
      </div>

      {/* Geospatial AWS Tower Siting & High-Resolution Map Section */}
      <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Geospatial Siting Mast & Satellite View ({station.name})</span>
          </span>
          <span className="text-[11px] font-mono text-[#475560]">
            Zoomable Slippy Map &bull; High Resolution
          </span>
        </div>
        <StationMiniMap station={station} />
      </div>

      {/* Dual BME280 Physical Sensor Section */}
      <DualBME280Card
        sensor1={station.sensors.sensor1}
        sensor2={station.sensors.sensor2}
        agreement={station.sensors.agreement}
        onSelectSensor={onSelectSensor}
      />

      {/* ESP32 Edge QC Section */}
      <EdgeQCPanel
        edgeQC={station.edgeQC}
        mcuType={station.mcuType}
        firmwareVersion={station.firmwareVersion}
      />

      {/* Observation History Multi-Variate Analytics Studio */}
      <ObservationChart
        history1h={station.sensors.sensor1.history1h}
        history6h={station.sensors.sensor1.history6h}
        history24h={station.sensors.sensor1.history24h}
        sensor2History1h={station.sensors.sensor2.history1h}
        sensor2History6h={station.sensors.sensor2.history6h}
        sensor2History24h={station.sensors.sensor2.history24h}
        sensorName={station.sensors.sensor1.name}
        stationQuality={station.quality}
      />

      {/* The Core SkyGuard Decision Panel */}
      <DecisionPanel
        decision={station.decision}
        stationName={station.name}
      />
    </div>
  );
};
