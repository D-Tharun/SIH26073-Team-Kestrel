import React from 'react';
import { ChevronRight, Home, MapPin, Radio, Cpu } from 'lucide-react';
import { HierarchyLevel } from '../types';

interface BreadcrumbsProps {
  currentLevel: HierarchyLevel;
  stateName?: string;
  districtName?: string;
  stationName?: string;
  sensorName?: string;
  onNavigate: (level: HierarchyLevel) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  currentLevel,
  stateName,
  districtName,
  stationName,
  sensorName,
  onNavigate,
}) => {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-[#475560] font-mono py-1 px-3 bg-[#FFFFFF] rounded-xl border border-[#C7C2B8] shadow-xs overflow-x-auto select-none">
      {/* Home / India Level */}
      <button
        onClick={() => onNavigate('india')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
          currentLevel === 'india'
            ? 'text-white bg-[#4A6B78] font-semibold'
            : 'hover:text-[#273844] hover:bg-[#DDD8CF]'
        }`}
        title="Return to National Map of India"
      >
        <Home className="w-3.5 h-3.5" />
        <span>India</span>
      </button>

      {/* State Level */}
      {currentLevel !== 'india' && stateName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-[#B3C8CF] shrink-0" />
          <button
            onClick={() => onNavigate('state')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
              currentLevel === 'state'
                ? 'text-white bg-[#4A6B78] font-semibold'
                : 'hover:text-[#273844] hover:bg-[#DDD8CF]'
            }`}
            title={`View ${stateName} observation network`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{stateName}</span>
          </button>
        </>
      )}

      {/* District Level */}
      {(currentLevel === 'district' || currentLevel === 'station' || currentLevel === 'sensor') && districtName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-[#B3C8CF] shrink-0" />
          <button
            onClick={() => onNavigate('district')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
              currentLevel === 'district'
                ? 'text-white bg-[#4A6B78] font-semibold'
                : 'hover:text-[#273844] hover:bg-[#DDD8CF]'
            }`}
            title={`View ${districtName} district stations`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{districtName}</span>
          </button>
        </>
      )}

      {/* Station Level */}
      {(currentLevel === 'station' || currentLevel === 'sensor') && stationName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-[#B3C8CF] shrink-0" />
          <button
            onClick={() => onNavigate('station')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
              currentLevel === 'station'
                ? 'text-white bg-[#4A6B78] font-semibold'
                : 'hover:text-[#273844] hover:bg-[#DDD8CF]'
            }`}
            title={`View ${stationName} operational telemetry`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{stationName}</span>
          </button>
        </>
      )}

      {/* Sensor Level */}
      {currentLevel === 'sensor' && sensorName && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-[#B3C8CF] shrink-0" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#4A6B78] text-white font-semibold">
            <Cpu className="w-3.5 h-3.5" />
            <span>{sensorName}</span>
          </div>
        </>
      )}
    </nav>
  );
};
