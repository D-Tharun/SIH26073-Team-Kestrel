import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AWSStation } from '../types';
import { MapPin, Crosshair, Plus, Minus, Layers } from 'lucide-react';

const CARTO_API_KEY = 'cb1_3pry_1_72396480fc3ec23f8375b9c2';

interface StationMiniMapProps {
  station: AWSStation;
}

export const StationMiniMap: React.FC<StationMiniMapProps> = ({ station }) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [layerType, setLayerType] = useState<'light' | 'satellite' | 'osm'>('light');
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const getTileUrl = (type: 'light' | 'satellite' | 'osm') => {
    switch (type) {
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      case 'osm':
        return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}&v=2`;
      case 'light':
      default:
        return `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}&v=2`;
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([station.lat, station.lng], 14);
      return;
    }

    const map = L.map(mapRef.current, {
      center: [station.lat, station.lng],
      zoom: 14,
      minZoom: 9,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false,
    });

    const url = getTileUrl(layerType);
    const tile = L.tileLayer(url, {
      maxZoom: 19,
      subdomains: layerType === 'light' ? 'abcd' : 'abc',
    }).addTo(map);
    tileLayerRef.current = tile;

    // Clean Station Marker with pulsing ring
    const icon = L.divIcon({
      className: 'custom-weather-station-marker',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="absolute w-8 h-8 rounded-full bg-[#4A6B78]/25 animate-ping"></div>
          <div class="w-6 h-6 rounded-full bg-[#273844] border-2 border-white shadow-lg flex items-center justify-center text-white text-[11px] font-bold">
            <span class="w-2 h-2 rounded-full bg-[#4A6B78]"></span>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    L.marker([station.lat, station.lng], { icon }).addTo(map);

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [station.lat, station.lng]);

  useEffect(() => {
    if (!tileLayerRef.current) return;
    tileLayerRef.current.setUrl(getTileUrl(layerType));
    tileLayerRef.current.redraw();
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);
  }, [layerType]);

  const resetView = () => {
    mapInstanceRef.current?.flyTo([station.lat, station.lng], 14, { duration: 0.8 });
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#C7C2B8] bg-[#DDD8CF] h-72 sm:h-80 lg:h-96 select-none shadow-sm">
      {/* Siting Mast Badge */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-[#FFFFFF]/95 backdrop-blur-xs px-2.5 py-1 rounded-xl border border-[#C7C2B8] text-xs font-mono text-[#273844] shadow-xs">
        <MapPin className="w-3.5 h-3.5 text-[#4A6B78]" />
        <span className="font-semibold">
          {station.lat.toFixed(4)}°N, {station.lng.toFixed(4)}°E
        </span>
        <span className="text-[#475560]">&bull; Siting Mast ({station.elevationMeters}m MSL)</span>
      </div>

      {/* Layer Controls */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1 bg-[#FFFFFF]/95 backdrop-blur-xs p-1 rounded-xl border border-[#C7C2B8] shadow-xs">
        <div className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#475560] border-r border-[#C7C2B8] flex items-center gap-1">
          <Layers className="w-3 h-3 text-[#4A6B78]" />
        </div>
        <button
          onClick={() => setLayerType('light')}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold transition-colors ${
            layerType === 'light' ? 'bg-[#4A6B78] text-white' : 'text-[#475560] hover:text-[#273844]'
          }`}
        >
          Carto Light
        </button>
        <button
          onClick={() => setLayerType('satellite')}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold transition-colors ${
            layerType === 'satellite' ? 'bg-[#4A6B78] text-white' : 'text-[#475560] hover:text-[#273844]'
          }`}
        >
          Satellite
        </button>
        <button
          onClick={() => setLayerType('osm')}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold transition-colors ${
            layerType === 'osm' ? 'bg-[#4A6B78] text-white' : 'text-[#475560] hover:text-[#273844]'
          }`}
        >
          OSM
        </button>
      </div>

      {/* Bottom Right Zoom / Recenter Controls */}
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1">
        <button
          onClick={resetView}
          title="Recenter Mast"
          className="p-1.5 rounded-lg bg-[#FFFFFF]/95 hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-xs transition-colors flex items-center justify-center"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#4A6B78]" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          title="Zoom In"
          className="w-7 h-7 rounded-lg bg-[#FFFFFF]/95 hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-xs font-mono font-bold text-xs flex items-center justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          title="Zoom Out"
          className="w-7 h-7 rounded-lg bg-[#FFFFFF]/95 hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-xs font-mono font-bold text-xs flex items-center justify-center"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
};
