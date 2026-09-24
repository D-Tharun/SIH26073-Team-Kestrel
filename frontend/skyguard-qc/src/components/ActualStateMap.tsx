import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { StateInfo, AWSStation } from '../types';
import { Layers, CloudRain, Crosshair } from 'lucide-react';

interface ActualStateMapProps {
  state: StateInfo;
  stations: AWSStation[];
  onSelectDistrict: (districtId: string) => void;
  onSelectStation: (stationId: string) => void;
}

type BaseLayerType = 'light' | 'dark' | 'satellite' | 'osm';

const CARTO_API_KEY = 'cb1_3pry_1_72396480fc3ec23f8375b9c2';

export const ActualStateMap: React.FC<ActualStateMapProps> = ({
  state,
  stations,
  onSelectDistrict,
  onSelectStation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [activeBaseLayer, setActiveBaseLayer] = useState<BaseLayerType>('light');
  const [showRadar, setShowRadar] = useState<boolean>(false);

  const TILE_SERVERS: Record<BaseLayerType, { url: string; attribution: string; subdomains?: string }> = {
    light: {
      url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}&v=2`,
      attribution: '&copy; CartoDB &copy; OpenStreetMap',
      subdomains: 'abcd',
    },
    dark: {
      url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}&v=2`,
      attribution: '&copy; CartoDB &copy; OpenStreetMap',
      subdomains: 'abcd',
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri',
    },
    osm: {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}&v=2`,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
    },
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialZoom = state.id === 'delhi' ? 10 : state.id === 'rajasthan' ? 6.2 : 7.2;

    const map = L.map(mapContainerRef.current, {
      center: [state.centerLat, state.centerLng],
      zoom: initialZoom,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
    });

    mapContainerRef.current.style.backgroundColor = '#DDD8CF';

    // Base Tile Layer
    const baseConfig = TILE_SERVERS[activeBaseLayer];
    const baseTileLayer = L.tileLayer(baseConfig.url, {
      attribution: baseConfig.attribution,
      subdomains: 'abcd',
    }).addTo(map);
    tileLayerRef.current = baseTileLayer;

    // Doppler Radar Tile Layer
    const radarTileLayer = L.tileLayer(
      'https://tilecache.rainviewer.com/v2/radar/nowcast_4/256/{z}/{x}/{y}/2/1_1.png',
      {
        opacity: 0.6,
        maxZoom: 12,
        zIndex: 10,
      }
    );
    if (showRadar) {
      radarTileLayer.addTo(map);
    }
    radarLayerRef.current = radarTileLayer;

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [state.id]);

  // Update Base Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const baseConfig = TILE_SERVERS[activeBaseLayer];
    tileLayerRef.current.setUrl(baseConfig.url);
    tileLayerRef.current.redraw();
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);
  }, [activeBaseLayer]);

  // Update Radar Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !radarLayerRef.current) return;
    if (showRadar) {
      if (!mapInstanceRef.current.hasLayer(radarLayerRef.current)) {
        radarLayerRef.current.addTo(mapInstanceRef.current);
      }
    } else {
      if (mapInstanceRef.current.hasLayer(radarLayerRef.current)) {
        radarLayerRef.current.remove();
      }
    }
  }, [showRadar]);

  // Render Operational AWS Stations & District Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();

    const stateStations = stations.filter(
      (s) => s.state.toLowerCase() === state.name.toLowerCase()
    );

    stateStations.forEach((st) => {
      const isFault = st.quality === 'sensor_fault';
      const isEvent = st.quality === 'genuine_event';
      const isReview = st.quality === 'uncertain';

      let dotColor = '#2D6A4F';
      let borderStyle = 'border-[#C7C2B8]';
      if (isFault) {
        dotColor = '#8E352B';
        borderStyle = 'border-[#DFC0BB]';
      } else if (isEvent) {
        dotColor = '#2C4C64';
        borderStyle = 'border-[#B3C8CF]';
      } else if (isReview) {
        dotColor = '#7D5316';
        borderStyle = 'border-[#E3D4BC]';
      }

      const iconHtml = `
        <div class="relative w-full h-full group cursor-pointer select-none">
          <div class="absolute inset-0 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white border ${borderStyle} shadow-sm transition-transform group-hover:scale-105">
            <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${dotColor};"></span>
            <div class="flex flex-col leading-tight">
              <div class="flex items-center gap-1 text-[11px] font-mono font-bold text-[#273844]">
                <span>${st.currentObservation.tempC.toFixed(1)}°C</span>
                <span class="text-[9px] text-[#475560] font-normal">${st.currentObservation.rhPercent.toFixed(0)}%</span>
              </div>
              <span class="text-[9px] font-mono text-[#475560] truncate max-w-[105px]">${st.name}</span>
            </div>
          </div>
        </div>
      `;

      const marker = L.marker([st.lat, st.lng], {
        icon: L.divIcon({
          className: 'custom-weather-station-marker',
          html: iconHtml,
          iconSize: [150, 36],
          iconAnchor: [75, 18],
        }),
        zIndexOffset: 1000,
      });

      marker.on('click', () => {
        onSelectStation(st.id);
      });

      marker.bindTooltip(
        `<div class="text-xs font-mono bg-white text-[#273844] p-2 rounded-xl border border-[#C7C2B8] shadow-md">
          <div class="font-bold text-[#4A6B78]">${st.name}</div>
          <div class="text-[11px] text-[#273844] mt-0.5">${st.currentObservation.tempC.toFixed(1)}°C &bull; ${st.currentObservation.rhPercent.toFixed(1)}% RH</div>
          <div class="text-[10px] text-[#475560] mt-1">Dual BME280 &bull; Click to inspect &rarr;</div>
        </div>`,
        { direction: 'top', offset: [0, -15] }
      );

      markersLayerRef.current?.addLayer(marker);
    });
  }, [state, stations]);

  const resetView = () => {
    if (!mapInstanceRef.current) return;
    const initialZoom = state.id === 'delhi' ? 10 : state.id === 'rajasthan' ? 6.2 : 7.2;
    mapInstanceRef.current.flyTo([state.centerLat, state.centerLng], initialZoom, {
      duration: 1,
    });
  };

  return (
    <div className="relative w-full h-[500px] lg:h-[560px] rounded-2xl overflow-hidden border border-[#C7C2B8] shadow-sm select-none bg-[#DDD8CF]">
      {/* Top Map Controls */}
      <div className="absolute top-2.5 left-2.5 z-[1000] flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center bg-[#FFFFFF]/95 backdrop-blur-xs p-1 rounded-xl border border-[#C7C2B8] shadow-xs">
          <div className="px-2 py-0.5 text-[10px] font-mono font-bold text-[#475560] border-r border-[#C7C2B8] flex items-center gap-1">
            <Layers className="w-3 h-3 text-[#4A6B78]" />
            <span>Map</span>
          </div>
          <button
            onClick={() => setActiveBaseLayer('light')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
              activeBaseLayer === 'light' ? 'bg-[#4A6B78] text-white font-semibold' : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Carto Light
          </button>
          <button
            onClick={() => setActiveBaseLayer('dark')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
              activeBaseLayer === 'dark' ? 'bg-[#4A6B78] text-white font-semibold' : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Carto Dark
          </button>
          <button
            onClick={() => setActiveBaseLayer('satellite')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
              activeBaseLayer === 'satellite' ? 'bg-[#4A6B78] text-white font-semibold' : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => setActiveBaseLayer('osm')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
              activeBaseLayer === 'osm' ? 'bg-[#4A6B78] text-white font-semibold' : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            OSM
          </button>
        </div>

        <button
          onClick={() => setShowRadar(!showRadar)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-mono font-semibold border transition-all shadow-xs ${
            showRadar
              ? 'bg-[#4A6B78] border-[#4A6B78] text-white'
              : 'bg-[#FFFFFF]/95 border-[#C7C2B8] text-[#475560] hover:text-[#273844]'
          }`}
        >
          <CloudRain className="w-3 h-3" />
          <span>Radar {showRadar ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      <div className="absolute top-2.5 right-2.5 z-[1000] flex flex-col gap-1 pointer-events-auto">
        <button
          onClick={resetView}
          className="p-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-xs transition-colors"
          title="Reset State View"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#4A6B78]" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-7 h-7 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-xs font-mono font-bold text-xs flex items-center justify-center"
        >
          +
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-7 h-7 rounded-lg bg-[#FFFFFF] hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-xs font-mono font-bold text-xs flex items-center justify-center"
        >
          -
        </button>
      </div>

      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[280px] cursor-grab active:cursor-grabbing" />
    </div>
  );
};
