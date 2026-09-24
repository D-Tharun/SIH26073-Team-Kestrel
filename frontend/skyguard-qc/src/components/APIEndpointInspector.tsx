import React, { useState } from 'react';
import { Copy, Check, X, Server } from 'lucide-react';
import { AWSStation } from '../types';

interface APIEndpointInspectorProps {
  station?: AWSStation;
  stations?: AWSStation[];
  isOpen: boolean;
  onClose: () => void;
}

export const APIEndpointInspector: React.FC<APIEndpointInspectorProps> = ({
  station,
  stations,
  isOpen,
  onClose,
}) => {
  const defaultStation = station || (stations && stations.length > 0 ? stations[0] : null);
  const [selectedStationId, setSelectedStationId] = useState<string>(defaultStation?.id || '');
  const activeStation = (stations && stations.find((s) => s.id === selectedStationId)) || defaultStation;

  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('decision');

  if (!isOpen || !activeStation) return null;

  const endpoints = [
    {
      id: 'stations',
      method: 'GET',
      path: '/api/v1/stations',
      description: 'List all active AWS telemetry nodes across India',
      payload: { count: stations ? stations.length : 7, stations: stations ? stations.map((s) => s.code) : ['ST_TN_001', 'ST_RJ_002', 'ST_DL_003', 'ST_HP_004', 'ST_KA_005', 'ST_MH_006', 'ST_ML_007'] },
    },
    {
      id: 'current',
      method: 'GET',
      path: `/api/v1/stations/${activeStation.id}/observations/current`,
      description: 'Get latest calibrated dual-sensor consensus observation',
      payload: activeStation.currentObservation,
    },
    {
      id: 'sensors',
      method: 'GET',
      path: `/api/v1/stations/${activeStation.id}/sensors`,
      description: 'Get physical redundant BME280 sensor states and agreement status',
      payload: activeStation.sensors,
    },
    {
      id: 'decision',
      method: 'GET',
      path: `/api/v1/stations/${activeStation.id}/skyguard-decision`,
      description: 'Get synthesized ML, physical, and spatial evidence decision',
      payload: activeStation.decision,
    },
    {
      id: 'edge',
      method: 'GET',
      path: `/api/v1/stations/${activeStation.id}/edge-qc`,
      description: 'Get ESP32 microcontroller edge validation test flags',
      payload: activeStation.edgeQC,
    },
  ];

  const active = endpoints.find((e) => e.id === selectedEndpoint) || endpoints[0];

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(active.payload, null, 2));
    setCopiedEndpoint(active.id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#273844]/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl w-full max-w-3xl overflow-hidden shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-[#DDD8CF] bg-[#E8E6DD]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#4A6B78]" />
            <div>
              <h3 className="text-sm font-bold text-[#273844] font-mono">
                API Specification & Schema Inspector
              </h3>
              <p className="text-[11px] text-[#475560] font-mono">
                Station endpoint schema for ingestion pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#DDD8CF] text-[#475560] hover:text-[#273844] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Endpoint List */}
          <div className="w-full md:w-64 border-r border-[#DDD8CF] p-2 space-y-1 overflow-y-auto bg-[#E8E6DD]/50">
            {endpoints.map((ep) => (
              <button
                key={ep.id}
                onClick={() => setSelectedEndpoint(ep.id)}
                className={`w-full text-left p-2 rounded-lg text-xs font-mono transition-all ${
                  selectedEndpoint === ep.id
                    ? 'bg-[#FFFFFF] text-[#273844] border border-[#4A6B78] shadow-xs font-semibold'
                    : 'text-[#475560] hover:bg-[#FFFFFF] hover:text-[#273844]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#E8F3ED] text-[#2D6A4F] border border-[#B7D8C5] font-semibold">
                    {ep.method}
                  </span>
                  <span className="truncate">{ep.path.replace('/api/v1', '')}</span>
                </div>
                <div className="text-[10px] text-[#475560] line-clamp-1">{ep.description}</div>
              </button>
            ))}
          </div>

          {/* JSON Payload viewer */}
          <div className="flex-1 p-3.5 flex flex-col overflow-hidden bg-[#FFFFFF]">
            <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
              <span className="font-mono text-xs text-[#273844] font-bold">
                {active.method} {active.path}
              </span>

              <button
                onClick={copyPayload}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#E8E6DD] hover:bg-[#DDD8CF] text-[#273844] text-xs font-mono border border-[#C7C2B8] transition-colors"
              >
                {copiedEndpoint === active.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#2D6A4F]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#475560]" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>

            <pre className="flex-1 overflow-auto p-3 mt-2 rounded-lg bg-[#E8E6DD] border border-[#DDD8CF] text-[11px] font-mono text-[#273844] scrollbar-thin">
              {JSON.stringify(active.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
