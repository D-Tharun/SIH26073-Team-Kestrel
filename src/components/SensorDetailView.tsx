import React from 'react';
import { AWSStation, BME280Sensor } from '../types';
import { ArrowLeft, Cpu, Thermometer, Droplets, Gauge, ShieldCheck } from 'lucide-react';
import { ObservationChart } from './ObservationChart';

interface SensorDetailViewProps {
  station: AWSStation;
  sensor: BME280Sensor;
  onBackToStation: () => void;
}

export const SensorDetailView: React.FC<SensorDetailViewProps> = ({
  station,
  sensor,
  onBackToStation,
}) => {
  return (
    <div className="w-full h-full flex flex-col p-4 bg-transparent text-[#273844] select-none overflow-y-auto space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#C7C2B8]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToStation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] text-[#273844] border border-[#C7C2B8] text-xs font-mono font-semibold transition-colors shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Return to {station.name}</span>
          </button>

          <div>
            <h2 className="text-xl font-bold text-[#273844] flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#4A6B78]" />
              <span>{sensor.name}</span>
            </h2>
            <div className="text-xs text-[#475560] font-mono mt-0.5">
              Co-located on {station.name} &bull; Bus Address: {sensor.busAddress}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E8F3ED] border border-[#B7D8C5] text-[#2D6A4F] font-mono font-semibold text-xs">
            <span className="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
            <span>HARDWARE ONLINE</span>
          </span>
        </div>
      </div>

      {/* Sensor Calibration & Health Telemetry Card */}
      <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Live Physical Sensor Readout
          </span>
          <span className="text-xs font-mono text-[#475560]">
            I2C Bus: 100 kHz Standard Mode
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Temperature */}
          <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono text-[#475560]">
              <span className="flex items-center gap-1">
                <Thermometer className="w-4 h-4 text-[#4A6B78]" /> Temperature
              </span>
              <span className="text-[10px] text-[#475560]">Live Trend</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#273844]">
              {sensor.tempC.toFixed(2)} °C
            </div>
            <div className="text-[10px] font-mono text-[#475560]">
              Cal Offset: {sensor.calibrationOffsetC >= 0 ? `+${sensor.calibrationOffsetC}` : sensor.calibrationOffsetC} °C
            </div>
          </div>

          {/* Humidity */}
          <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono text-[#475560]">
              <span className="flex items-center gap-1">
                <Droplets className="w-4 h-4 text-[#4A6B78]" /> Relative Humidity
              </span>
              <span className="text-[10px] text-[#475560]">Live Trend</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#273844]">
              {sensor.rhPercent.toFixed(1)} %
            </div>
            <div className="text-[10px] font-mono text-[#475560]">
              Hysteresis: &plusmn;1.0% RH
            </div>
          </div>

          {/* Pressure */}
          <div className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono text-[#475560]">
              <span className="flex items-center gap-1">
                <Gauge className="w-4 h-4 text-[#4A6B78]" /> Barometric Pressure
              </span>
              <span className="text-[10px] text-[#475560]">Live Trend</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#273844]">
              {sensor.pressureHpa.toFixed(1)} hPa
            </div>
            <div className="text-[10px] font-mono text-[#475560]">
              Resolution: 0.18 Pa RMS
            </div>
          </div>
        </div>

        {/* Hardware Calibration & Drift Details */}
        <div className="pt-2 border-t border-[#DDD8CF] flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#475560]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#4A6B78]" />
            <span>Factory Calibration Register: Validated</span>
          </div>
          <div>
            Monthly Drift Estimate: <strong className="text-[#273844]">+{sensor.driftRateCPerMonth}°C/mo</strong>
          </div>
        </div>
      </div>

      {/* Observation History with 1H, 6H, 24H tabs */}
      <ObservationChart
        history1h={sensor.history1h}
        history6h={sensor.history6h}
        history24h={sensor.history24h}
        sensorName={sensor.name}
      />
    </div>
  );
};
