import React, { useState } from 'react';
import { AWSStation, StateInfo, SkyGuardQuality } from '../types';
import { CheckCircle2, Activity, AlertTriangle, HelpCircle } from 'lucide-react';

interface IndiaVectorMapProps {
  stations: AWSStation[];
  states: StateInfo[];
  selectedStationId?: string;
  highlightedStationId?: string;
  onSelectStation: (stationId: string) => void;
  onSelectState: (stateId: string) => void;
}

export const IndiaVectorMap: React.FC<IndiaVectorMapProps> = ({
  stations,
  states,
  selectedStationId,
  onSelectStation,
  onSelectState,
}) => {
  const [hoveredStation, setHoveredStation] = useState<AWSStation | null>(null);
  const [hoveredState, setHoveredState] = useState<StateInfo | null>(null);

  const projectCoords = (lat: number, lng: number) => {
    const minLat = 7.0;
    const maxLat = 37.5;
    const minLng = 67.5;
    const maxLng = 97.5;

    const x = ((lng - minLng) / (maxLng - minLng)) * 700 + 50;
    const y = 840 - ((lat - minLat) / (maxLat - minLat)) * 740;
    return { x, y };
  };

  const statePolygons: { id: string; name: string; d: string; centerLat: number; centerLng: number }[] = [
    { id: 'jk_ladakh', name: 'Ladakh & J&K', centerLat: 34.2, centerLng: 76.5, d: 'M 180,60 L 260,30 L 350,60 L 330,140 L 250,150 L 190,130 Z' },
    { id: 'himachal_pradesh', name: 'Himachal Pradesh', centerLat: 31.8, centerLng: 77.2, d: 'M 250,150 L 310,145 L 320,185 L 265,195 L 245,165 Z' },
    { id: 'punjab', name: 'Punjab', centerLat: 31.0, centerLng: 75.3, d: 'M 195,160 L 245,165 L 240,210 L 190,200 Z' },
    { id: 'uttarakhand', name: 'Uttarakhand', centerLat: 30.2, centerLng: 79.2, d: 'M 290,185 L 345,175 L 360,220 L 305,225 Z' },
    { id: 'delhi', name: 'Delhi (NCT)', centerLat: 28.6, centerLng: 77.2, d: 'M 240,205 L 285,200 L 280,240 L 235,240 Z' },
    { id: 'rajasthan', name: 'Rajasthan', centerLat: 26.8, centerLng: 73.5, d: 'M 100,200 L 235,210 L 255,290 L 190,345 L 90,290 Z' },
    { id: 'uttar_pradesh', name: 'Uttar Pradesh', centerLat: 27.0, centerLng: 81.0, d: 'M 285,205 L 360,220 L 460,240 L 440,310 L 315,310 L 280,245 Z' },
    { id: 'bihar', name: 'Bihar', centerLat: 25.6, centerLng: 85.5, d: 'M 460,240 L 535,245 L 530,295 L 440,305 Z' },
    { id: 'gujarat', name: 'Gujarat', centerLat: 22.5, centerLng: 71.5, d: 'M 60,300 L 150,315 L 180,390 L 105,420 L 60,370 Z' },
    { id: 'madhya_pradesh', name: 'Madhya Pradesh', centerLat: 23.5, centerLng: 78.0, d: 'M 190,345 L 315,310 L 415,330 L 380,420 L 230,420 Z' },
    { id: 'maharashtra', name: 'Maharashtra', centerLat: 19.5, centerLng: 75.5, d: 'M 120,420 L 230,420 L 340,430 L 305,535 L 175,540 L 140,480 Z' },
    { id: 'goa', name: 'Goa', centerLat: 15.4, centerLng: 73.8, d: 'M 175,545 L 190,545 L 185,570 L 170,565 Z' },
    { id: 'karnataka', name: 'Karnataka', centerLat: 14.5, centerLng: 76.0, d: 'M 180,545 L 255,545 L 290,670 L 220,680 L 180,590 Z' },
    { id: 'kerala', name: 'Kerala', centerLat: 10.5, centerLng: 76.2, d: 'M 215,680 L 245,680 L 250,775 L 225,765 Z' },
    { id: 'tamil_nadu', name: 'Tamil Nadu', centerLat: 11.2, centerLng: 78.8, d: 'M 255,670 L 335,660 L 320,780 L 250,780 Z' },
    { id: 'andhra_pradesh', name: 'Andhra Pradesh', centerLat: 15.5, centerLng: 80.0, d: 'M 290,560 L 390,500 L 415,530 L 335,660 L 285,630 Z' },
    { id: 'telangana', name: 'Telangana', centerLat: 17.8, centerLng: 79.0, d: 'M 260,490 L 335,470 L 365,535 L 285,555 Z' },
    { id: 'chhattisgarh', name: 'Chhattisgarh', centerLat: 21.5, centerLng: 81.8, d: 'M 350,380 L 410,360 L 400,475 L 340,485 Z' },
    { id: 'odisha', name: 'Odisha', centerLat: 20.5, centerLng: 84.5, d: 'M 405,360 L 485,350 L 470,440 L 405,475 Z' },
    { id: 'west_bengal', name: 'West Bengal', centerLat: 23.5, centerLng: 87.8, d: 'M 490,290 L 540,290 L 530,380 L 480,360 Z' },
    { id: 'jharkhand', name: 'Jharkhand', centerLat: 23.6, centerLng: 85.3, d: 'M 430,310 L 490,300 L 480,360 L 415,355 Z' },
    { id: 'sikkim', name: 'Sikkim', centerLat: 27.5, centerLng: 88.5, d: 'M 545,215 L 565,215 L 560,240 L 540,240 Z' },
    { id: 'assam', name: 'Assam', centerLat: 26.2, centerLng: 92.5, d: 'M 575,230 L 685,200 L 675,255 L 580,270 Z' },
    { id: 'meghalaya', name: 'Meghalaya', centerLat: 25.5, centerLng: 91.3, d: 'M 580,265 L 640,265 L 635,285 L 575,285 Z' },
    { id: 'arunachal', name: 'Arunachal Pradesh', centerLat: 28.2, centerLng: 94.7, d: 'M 620,165 L 720,160 L 710,210 L 645,215 Z' },
    { id: 'northeast_others', name: 'Nagaland / Manipur / Mizoram / Tripura', centerLat: 24.5, centerLng: 93.5, d: 'M 650,230 L 685,230 L 670,335 L 620,325 Z' },
  ];

  const renderQualityIcon = (quality: SkyGuardQuality) => {
    switch (quality) {
      case 'normal':
        return <CheckCircle2 className="w-3.5 h-3.5 text-[#2D6A4F]" />;
      case 'genuine_event':
        return <Activity className="w-3.5 h-3.5 text-[#2C4C64]" />;
      case 'sensor_fault':
        return <AlertTriangle className="w-3.5 h-3.5 text-[#8E352B]" />;
      case 'uncertain':
        return <HelpCircle className="w-3.5 h-3.5 text-[#7D5316]" />;
      default:
        return null;
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-2 select-none overflow-hidden bg-[#E8E6DD] rounded-xl border border-[#C7C2B8]">
      {/* SVG Canvas */}
      <svg
        viewBox="0 0 780 860"
        className="w-full h-full max-h-[720px]"
      >
        <defs>
          <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#DDD8CF" strokeWidth="0.75" />
          </pattern>
        </defs>

        {/* Map Background with coordinates grid */}
        <rect width="780" height="860" fill="#E8E6DD" />
        <rect width="780" height="860" fill="url(#gridPattern)" />

        {/* Latitude / Longitude Guide lines */}
        <g stroke="#C7C2B8" strokeWidth="0.5" strokeDasharray="3,3">
          <line x1="50" y1="200" x2="730" y2="200" />
          <line x1="50" y1="360" x2="730" y2="360" />
          <line x1="50" y1="520" x2="730" y2="520" />
          <line x1="50" y1="680" x2="730" y2="680" />
          <line x1="200" y1="50" x2="200" y2="810" />
          <line x1="360" y1="50" x2="360" y2="810" />
          <line x1="520" y1="50" x2="520" y2="810" />
          <line x1="680" y1="50" x2="680" y2="810" />
        </g>

        {/* Water Bodies labels */}
        <text x="70" y="520" fill="#4A6B78" fontSize="12" fontFamily="monospace" fontWeight="600" letterSpacing="3">
          ARABIAN SEA
        </text>
        <text x="500" y="540" fill="#4A6B78" fontSize="12" fontFamily="monospace" fontWeight="600" letterSpacing="3">
          BAY OF BENGAL
        </text>
        <text x="260" y="830" fill="#4A6B78" fontSize="12" fontFamily="monospace" fontWeight="600" letterSpacing="3">
          INDIAN OCEAN
        </text>

        {/* State Boundaries */}
        <g id="statesLayer">
          {statePolygons.map((state) => {
            const hasStation = states.find((s) => s.id === state.id)?.hasStations;
            const isHovered = hoveredState?.id === state.id;

            return (
              <path
                key={state.id}
                d={state.d}
                onClick={() => onSelectState(state.id)}
                onMouseEnter={() => {
                  const found = states.find((s) => s.id === state.id);
                  if (found) setHoveredState(found);
                }}
                onMouseLeave={() => setHoveredState(null)}
                className="transition-all duration-150 cursor-pointer"
                fill={
                  isHovered
                    ? '#C7C2B8'
                    : hasStation
                    ? '#DDD8CF'
                    : '#FFFFFF'
                }
                stroke={
                  isHovered
                    ? '#4A6B78'
                    : hasStation
                    ? '#B3C8CF'
                    : '#C7C2B8'
                }
                strokeWidth={isHovered ? '2' : hasStation ? '1.5' : '1'}
              />
            );
          })}
        </g>

        {/* Regional Event Links */}
        <g id="regionalNetworkLayer" strokeDasharray="3,3">
          {stations.map((st) => {
            if (st.decision.regionalEventDetected && st.decision.buddies.length > 0) {
              const src = projectCoords(st.lat, st.lng);
              return st.decision.buddies.map((buddy, bIdx) => {
                const targetX = src.x + (bIdx === 0 ? 40 : -45);
                const targetY = src.y + (bIdx === 0 ? 30 : -25);
                const isGenuine = st.decision.decision === 'genuine_event';

                return (
                  <g key={`${st.id}-buddy-${bIdx}`}>
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={targetX}
                      y2={targetY}
                      stroke={isGenuine ? '#2C4C64' : '#8E352B'}
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={targetX}
                      cy={targetY}
                      r="3.5"
                      fill={isGenuine ? '#2C4C64' : '#8E352B'}
                      stroke="#FFFFFF"
                      strokeWidth="1"
                    />
                    <text
                      x={targetX + 6}
                      y={targetY + 3}
                      fill="#475560"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {buddy.stationName.split(' ')[0]}
                    </text>
                  </g>
                );
              });
            }
            return null;
          })}
        </g>

        {/* Actual AWS Stations Markers */}
        <g id="stationsLayer">
          {stations.map((st) => {
            const { x, y } = projectCoords(st.lat, st.lng);
            const isSelected = selectedStationId === st.id;

            const isNormal = st.quality === 'normal';
            const isGenuine = st.quality === 'genuine_event';
            const isFault = st.quality === 'sensor_fault';

            const fillColor = isNormal
              ? '#2D6A4F'
              : isGenuine
              ? '#2C4C64'
              : isFault
              ? '#8E352B'
              : '#7D5316';

            return (
              <g
                key={st.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => onSelectStation(st.id)}
                onMouseEnter={() => setHoveredStation(st)}
                onMouseLeave={() => setHoveredStation(null)}
                className="cursor-pointer"
              >
                {/* Outer halo */}
                <circle
                  r={isSelected ? '14' : '10'}
                  fill="#FFFFFF"
                  stroke={fillColor}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                />

                {/* Status indicator mark */}
                <circle r="5" fill={fillColor} />

                {/* Station Name Label */}
                <text
                  x="0"
                  y="20"
                  textAnchor="middle"
                  fill="#273844"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="600"
                  className="select-none pointer-events-none"
                >
                  {st.name.replace(' AWS', '')}
                </text>

                {/* Quick Observation Value (Temp) */}
                <text
                  x="0"
                  y="30"
                  textAnchor="middle"
                  fill="#475560"
                  fontSize="9"
                  fontFamily="monospace"
                  className="select-none pointer-events-none"
                >
                  {st.currentObservation.tempC.toFixed(1)}°C
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredStation && (
        <div
          className="absolute z-30 pointer-events-none p-3 rounded-xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-lg text-xs font-mono max-w-xs"
          style={{
            top: '20px',
            right: '20px',
          }}
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#DDD8CF]">
            <span className="font-bold text-[#273844]">{hoveredStation.name}</span>
            <div className="flex items-center gap-1">
              {renderQualityIcon(hoveredStation.quality)}
              <span
                className={`font-semibold uppercase text-[10px] ${
                  hoveredStation.quality === 'normal'
                    ? 'text-[#2D6A4F]'
                    : hoveredStation.quality === 'genuine_event'
                    ? 'text-[#2C4C64]'
                    : hoveredStation.quality === 'sensor_fault'
                    ? 'text-[#8E352B]'
                    : 'text-[#7D5316]'
                }`}
              >
                {hoveredStation.quality.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="mt-2 space-y-1 text-[#475560]">
            <div className="flex justify-between">
              <span>Location:</span>
              <span className="text-[#273844]">{hoveredStation.district}, {hoveredStation.state}</span>
            </div>
            <div className="flex justify-between">
              <span>Observation:</span>
              <span className="font-semibold text-[#273844]">
                {hoveredStation.currentObservation.tempC.toFixed(1)}°C &bull; {hoveredStation.currentObservation.rhPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Condition:</span>
              <span className="text-[#273844] capitalize">{hoveredStation.atmosphericState.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span>Confidence:</span>
              <span className="font-semibold text-[#273844]">{hoveredStation.decision.confidencePercent}%</span>
            </div>
          </div>
        </div>
      )}

      {/* State Hover Hint */}
      {!hoveredStation && hoveredState && (
        <div className="absolute top-4 left-4 z-20 pointer-events-none px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#C7C2B8] text-xs font-mono text-[#273844] shadow-xs">
          <span className="font-bold">{hoveredState.name}</span>
          <span className="text-[#475560] text-[10px] ml-2">
            ({hoveredState.hasStations ? `${hoveredState.stationCount} Station Active` : 'No station'})
          </span>
          <div className="text-[10px] text-[#475560]">Click to drill down into districts</div>
        </div>
      )}
    </div>
  );
};
