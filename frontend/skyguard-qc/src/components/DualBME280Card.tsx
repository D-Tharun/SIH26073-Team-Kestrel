import React from 'react';
import { BME280Sensor, SensorAgreement } from '../types';
import { Cpu, CheckCircle2, AlertTriangle, ChevronRight, Gauge, Droplets, Thermometer } from 'lucide-react';

interface DualBME280CardProps {
  sensor1: BME280Sensor;
  sensor2: BME280Sensor;
  agreement: SensorAgreement;
  onSelectSensor: (sensorId: 'bme280_1' | 'bme280_2') => void;
}

export const DualBME280Card: React.FC<DualBME280CardProps> = ({
  sensor1,
  sensor2,
  agreement,
  onSelectSensor,
}) => {
  return (
    <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-3.5 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#4A6B78]" />
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            Dual Physical BME280 Sensor Subsystem
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#475560]">
          Hardware Redundancy
        </span>
      </div>

      {/* Side-by-Side Dual Sensors View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Sensor #1 */}
        <div
          onClick={() => onSelectSensor('bme280_1')}
          className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] hover:border-[#4A6B78] hover:bg-[#FFFFFF] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
              <h4 className="font-mono font-bold text-xs text-[#273844] group-hover:text-[#4A6B78]">
                {sensor1.name}
              </h4>
            </div>
            <span className="text-[10px] font-mono text-[#475560]">{sensor1.busAddress}</span>
          </div>

          <div className="mt-2.5 space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475560] flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-[#4A6B78]" /> Temperature
              </span>
              <span className="font-bold text-[#273844] text-sm">{sensor1.tempC.toFixed(1)} °C</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475560] flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-[#4A6B78]" /> Rel. Humidity
              </span>
              <span className="font-bold text-[#273844] text-sm">{sensor1.rhPercent.toFixed(1)} %</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475560] flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-[#4A6B78]" /> Barometric
              </span>
              <span className="font-bold text-[#273844] text-sm">{sensor1.pressureHpa.toFixed(1)} hPa</span>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#DDD8CF] flex items-center justify-between text-[10px] font-mono text-[#4A6B78]">
            <span>Cal: {sensor1.calibrationOffsetC >= 0 ? `+${sensor1.calibrationOffsetC}` : sensor1.calibrationOffsetC}°C</span>
            <span className="flex items-center gap-0.5 group-hover:underline">
              <span>View Details</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Sensor #2 */}
        <div
          onClick={() => onSelectSensor('bme280_2')}
          className="p-3.5 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] hover:border-[#4A6B78] hover:bg-[#FFFFFF] transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
              <h4 className="font-mono font-bold text-xs text-[#273844] group-hover:text-[#4A6B78]">
                {sensor2.name}
              </h4>
            </div>
            <span className="text-[10px] font-mono text-[#475560]">{sensor2.busAddress}</span>
          </div>

          <div className="mt-2.5 space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475560] flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5 text-[#4A6B78]" /> Temperature
              </span>
              <span className="font-bold text-[#273844] text-sm">{sensor2.tempC.toFixed(1)} °C</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475560] flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-[#4A6B78]" /> Rel. Humidity
              </span>
              <span className="font-bold text-[#273844] text-sm">{sensor2.rhPercent.toFixed(1)} %</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#475560] flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-[#4A6B78]" /> Barometric
              </span>
              <span className="font-bold text-[#273844] text-sm">{sensor2.pressureHpa.toFixed(1)} hPa</span>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#DDD8CF] flex items-center justify-between text-[10px] font-mono text-[#4A6B78]">
            <span>Cal: {sensor2.calibrationOffsetC >= 0 ? `+${sensor2.calibrationOffsetC}` : sensor2.calibrationOffsetC}°C</span>
            <span className="flex items-center gap-0.5 group-hover:underline">
              <span>View Details</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Sensor Agreement Banner */}
      <div
        className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs font-mono ${
          agreement.isAgreed
            ? 'bg-[#E8F3ED] border-[#B7D8C5] text-[#2D6A4F]'
            : 'bg-[#F8ECE9] border-[#DFC0BB] text-[#8E352B]'
        }`}
      >
        <div className="flex items-center gap-2">
          {agreement.isAgreed ? (
            <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-[#8E352B] shrink-0" />
          )}
          <div>
            <div className="font-bold">
              SENSOR PARITY: {agreement.isAgreed ? 'CONCORDANT' : 'DISCORDANCE DETECTED'}
            </div>
            <div className="text-[11px] opacity-90">{agreement.statusText}</div>
          </div>
        </div>

        <div className="text-right shrink-0 text-[11px]">
          <div>&Delta;T: <span className="font-bold">{agreement.deltaTempC.toFixed(2)}°C</span> (Max: {agreement.tempThresholdC}°C)</div>
          <div>&Delta;RH: <span className="font-bold">{agreement.deltaRhPercent.toFixed(1)}%</span></div>
        </div>
      </div>
    </div>
  );
};
