import React from 'react';
import { EdgeQCChecks } from '../types';
import { CheckCircle2, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';

interface EdgeQCPanelProps {
  edgeQC: EdgeQCChecks;
  mcuType: string;
  firmwareVersion: string;
}

export const EdgeQCPanel: React.FC<EdgeQCPanelProps> = ({
  edgeQC,
  mcuType,
  firmwareVersion,
}) => {
  const checks = [
    {
      id: 'range',
      label: 'Range Check',
      description: 'Bounds test (-40°C to +85°C, 300-1100 hPa)',
      passed: edgeQC.rangeCheck,
    },
    {
      id: 'rate',
      label: 'Rate of Change',
      description: 'Gradient step test (WMO: max 5°C/10min)',
      passed: edgeQC.rateOfChange,
    },
    {
      id: 'agreement',
      label: 'Sensor Agreement',
      description: 'Dual BME280 consensus (ΔT ≤ 0.5°C)',
      passed: edgeQC.sensorAgreement,
    },
    {
      id: 'frozen',
      label: 'Frozen Value Test',
      description: 'ADC stuck-value bit freeze check',
      passed: edgeQC.frozenValue,
    },
    {
      id: 'integrity',
      label: 'Data Integrity',
      description: 'CRC8 & I2C parity frame verification',
      passed: edgeQC.dataIntegrity,
    },
  ];

  return (
    <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-xs space-y-3 select-none">
      <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#4A6B78]" />
          <span className="font-mono text-xs font-bold text-[#273844] uppercase tracking-wider">
            ESP32 Edge Quality Checks
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#475560]">
          <span>{mcuType}</span>
          <span>&bull;</span>
          <span className="text-[#4A6B78] font-semibold">{firmwareVersion}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {checks.map((c) => (
          <div
            key={c.id}
            className={`p-2.5 rounded-lg border flex flex-col justify-between gap-1.5 ${
              c.passed
                ? 'bg-[#E8E6DD] border-[#DDD8CF] text-[#273844]'
                : 'bg-[#F8ECE9] border-[#DFC0BB] text-[#8E352B]'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono font-bold text-xs">{c.label}</span>
              {c.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#2D6A4F] shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-[#8E352B] shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-[#475560] line-clamp-2">{c.description}</p>
            <div className="text-[10px] font-mono font-semibold">
              {c.passed ? (
                <span className="text-[#2D6A4F]">PASSED</span>
              ) : (
                <span className="text-[#8E352B]">FAILED (FLAG)</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-[#DDD8CF] flex items-center justify-between text-[11px] font-mono text-[#475560]">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#4A6B78]" />
          <span>
            {edgeQC.overallPass
              ? 'Edge QC Passed: Observation qualified for backend synthesis.'
              : 'Edge QC Flagged: Local hardware anomaly detected prior to cloud dispatch.'}
          </span>
        </div>
      </div>
    </div>
  );
};
