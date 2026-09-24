import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AWSStation, StateInfo } from '../types';
import { Layers, CloudRain, Crosshair, MapPin, Radio } from 'lucide-react';

interface ActualIndiaMapProps {
  stations: AWSStation[];
  states: StateInfo[];
  selectedStationId?: string;
  highlightedStationId?: string;
  onSelectStation: (stationId: string) => void;
  onSelectState: (stateId: string) => void;
}

type BaseLayerType = 'osm' | 'light' | 'dark' | 'satellite' | 'topo';

interface CuteWeatherDetails {
  type: string;
  label: string;
  badgeClass: string;
  iconHtml: string;
}

const getCuteWeatherDetails = (st: AWSStation): CuteWeatherDetails => {
  const isEvent = st.quality === 'genuine_event';
  const temp = st.currentObservation.tempC;
  const rh = st.currentObservation.rhPercent;
  const id = st.id.toLowerCase();
  const district = (st.district || '').toLowerCase();

  // 1. Thunderstorm: high humidity events, squalls, Cherrapunji / Mawsynram / Shillong during storms
  if (
    st.atmosphericState === 'heavy_rain' ||
    (isEvent && rh > 75) ||
    rh >= 85 ||
    id.includes('cherrapunji') ||
    id.includes('mawsynram')
  ) {
    return {
      type: 'thunderstorm',
      label: 'Thunderstorm',
      badgeClass: 'weather-badge-thunderstorm',
      iconHtml: `
        <svg class="w-4 h-4 shrink-0 overflow-visible" viewBox="0 0 24 24" fill="none" style="animation: cute-thunder-rumble 2s infinite ease-in-out;">
          <path d="M4 12a3 3 0 0 1 0-6 4 4 0 0 1 7.6-1.2A3.5 3.5 0 0 1 15 8a3 3 0 0 1-1 4H4z" fill="#475569" stroke="#94A3B8" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="6" y1="13" x2="5" y2="17" stroke="#818CF8" stroke-width="1.5" stroke-linecap="round" style="animation: cute-rain-drop 1s infinite linear;"/>
          <polygon points="12,9 9.5,13.5 12,13.5 10.5,18 15.5,12.5 13,12.5 14.5,9" fill="#FACC15" stroke="#EAB308" stroke-width="0.8" style="animation: cute-lightning-flash 2.2s infinite ease-in-out; transform-origin: 12px 13px;"/>
        </svg>
      `,
    };
  }

  // 2. Rain Showers: high humidity, coastal monsoons (Mumbai Santacruz etc.)
  if (
    rh >= 70 ||
    st.atmosphericState === 'high_humidity' ||
    id.includes('mumbai') ||
    district.includes('mumbai')
  ) {
    return {
      type: 'rainy',
      label: 'Rain Showers',
      badgeClass: 'weather-badge-rainy',
      iconHtml: `
        <svg class="w-4 h-4 shrink-0 overflow-visible" viewBox="0 0 24 24" fill="none">
          <path d="M4 13a3 3 0 0 1 0-6 4 4 0 0 1 7.6-1.2A3.5 3.5 0 0 1 15 9a3 3 0 0 1-1 4H4z" fill="#94A3B8" stroke="#64748B" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="7" y1="14" x2="6" y2="18" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round" style="animation: cute-rain-drop 1.1s infinite linear; animation-delay: 0s;"/>
          <line x1="10.5" y1="14" x2="9.5" y2="18" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round" style="animation: cute-rain-drop 1.1s infinite linear; animation-delay: 0.35s;"/>
          <line x1="14" y1="14" x2="13" y2="18" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round" style="animation: cute-rain-drop 1.1s infinite linear; animation-delay: 0.7s;"/>
        </svg>
      `,
    };
  }

  // 3. Desert Wind / Arid: Thar Desert, Jaisalmer, Barmer
  if (
    id.includes('jaisalmer') ||
    id.includes('barmer') ||
    district.includes('jaisalmer') ||
    district.includes('barmer') ||
    st.atmosphericState === 'dry_heat' ||
    (rh < 32 && temp > 32)
  ) {
    return {
      type: 'windy',
      label: 'Desert Wind',
      badgeClass: 'weather-badge-windy',
      iconHtml: `
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="17" cy="7" r="3" fill="#FBBF24" style="animation: cute-sun-pulse 2s infinite ease-in-out;"/>
          <path d="M3 12h10a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 0-2 1" stroke="#F59E0B" stroke-width="1.6" stroke-linecap="round" style="animation: cute-wind-wave 2s ease-in-out infinite alternate;"/>
          <path d="M2 16h12a2 2 0 0 0 0-4" stroke="#D97706" stroke-width="1.4" stroke-linecap="round" style="animation: cute-wind-wave 2s ease-in-out infinite alternate; animation-delay: 0.3s;"/>
        </svg>
      `,
    };
  }

  // 4. Mountain Mist / Cold: Shillong, Shimla, Himalayan / high elevation
  if (
    id.includes('shillong') ||
    id.includes('shimla') ||
    district.includes('shillong') ||
    st.elevationMeters > 800 ||
    temp < 20 ||
    st.atmosphericState === 'cold'
  ) {
    return {
      type: 'mist',
      label: 'Mountain Mist',
      badgeClass: 'weather-badge-mist',
      iconHtml: `
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <polygon points="4,15 9,9 14,15" fill="#99F6E4" opacity="0.6"/>
          <polygon points="11,15 15,10 19,15" fill="#5EEAD4" opacity="0.5"/>
          <path d="M3 12h18" stroke="#14B8A6" stroke-width="1.5" stroke-linecap="round" style="animation: cute-mist-glide 2.8s ease-in-out infinite alternate;"/>
          <path d="M5 15h14" stroke="#0D9488" stroke-width="1.5" stroke-linecap="round" style="animation: cute-mist-glide 2.8s ease-in-out infinite alternate; animation-delay: 0.4s;"/>
          <path d="M7 18h10" stroke="#0F766E" stroke-width="1.3" stroke-linecap="round" style="animation: cute-mist-glide 2.8s ease-in-out infinite alternate; animation-delay: 0.8s;"/>
        </svg>
      `,
    };
  }

  // 5. Partly Cloudy: mild humidity, Bengaluru HAL etc.
  if (
    rh >= 52 ||
    id.includes('bengaluru') ||
    id.includes('blr') ||
    st.atmosphericState === 'moderate'
  ) {
    return {
      type: 'partly_cloudy',
      label: 'Partly Cloudy',
      badgeClass: 'weather-badge-partly_cloudy',
      iconHtml: `
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <g style="animation: cute-sun-spin 12s linear infinite; transform-origin: 16px 8px;">
            <circle cx="16" cy="8" r="3.5" fill="#FBBF24"/>
            <g stroke="#F59E0B" stroke-width="1.4" stroke-linecap="round">
              <line x1="16" y1="2.5" x2="16" y2="3.8" />
              <line x1="21.5" y1="8" x2="20.2" y2="8" />
              <line x1="19.8" y1="4.2" x2="18.9" y2="5.1" />
              <line x1="12.2" y1="11.8" x2="13.1" y2="10.9" />
            </g>
          </g>
          <path d="M5 18a3.5 3.5 0 0 1-.3-6.98A4.5 4.5 0 0 1 13.5 9a4.5 4.5 0 0 1 3.2 1.34A3 3 0 0 1 16 18H5z" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.2" stroke-linejoin="round" style="animation: cute-cloud-drift 3s ease-in-out infinite alternate;"/>
        </svg>
      `,
    };
  }

  // 6. Cloudy: overcast
  if (rh >= 38) {
    return {
      type: 'cloudy',
      label: 'Cloudy',
      badgeClass: 'weather-badge-cloudy',
      iconHtml: `
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" style="animation: cute-cloud-drift 3.2s ease-in-out infinite alternate;">
          <path d="M7 14a3 3 0 0 1 0-6 4 4 0 0 1 7.5-1A3.5 3.5 0 0 1 18 10a3 3 0 0 1-2 4H7z" fill="#CBD5E1" opacity="0.8"/>
          <path d="M4 18a3.5 3.5 0 0 1-.2-6.98A4.5 4.5 0 0 1 12.5 9a4.5 4.5 0 0 1 3.5 1.7A3 3 0 0 1 15 18H4z" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.3" stroke-linejoin="round" style="animation: cute-cloud-puff 2.5s ease-in-out infinite; transform-origin: 10px 14px;"/>
        </svg>
      `,
    };
  }

  // 7. Sunny / Clear Sky
  return {
    type: 'sunny',
    label: isEvent && temp > 38 ? 'Heatwave' : 'Sunny',
    badgeClass: 'weather-badge-sunny',
    iconHtml: `
      <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="4.5" fill="#F59E0B" style="animation: cute-sun-pulse 2s ease-in-out infinite; transform-origin: 12px 12px;"/>
        <g style="animation: cute-sun-spin 10s linear infinite; transform-origin: 12px 12px;" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round">
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
          <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
          <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
          <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
        </g>
      </svg>
    `,
  };
};

export const ActualIndiaMap: React.FC<ActualIndiaMapProps> = ({
  stations,
  states,
  selectedStationId,
  highlightedStationId,
  onSelectStation,
  onSelectState,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const peerLinesLayerRef = useRef<L.LayerGroup | null>(null);

  const [activeBaseLayer, setActiveBaseLayer] = useState<BaseLayerType>('osm');
  const [showRadar, setShowRadar] = useState<boolean>(false);
  const [showPeerCorrelations, setShowPeerCorrelations] = useState<boolean>(true);

  // Clean, fast, watermark-free basemap tiles without API key restrictions
  const TILE_SERVERS: Record<BaseLayerType, { url: string; attribution: string; subdomains?: string }> = {
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      subdomains: 'abc',
    },
    light: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      subdomains: '',
    },
    dark: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      subdomains: '',
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri',
      subdomains: '',
    },
    topo: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri',
      subdomains: '',
    },
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [22.8, 79.5],
      zoom: 4.8,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
    });

    mapContainerRef.current.style.backgroundColor = '#DDD8CF';

    // Base Tile Layer (OpenStreetMap by default, crisp and watermark-free)
    const baseConfig = TILE_SERVERS[activeBaseLayer];
    const baseTileLayer = L.tileLayer(baseConfig.url, {
      attribution: baseConfig.attribution,
      subdomains: baseConfig.subdomains || 'abc',
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

    peerLinesLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      resizeObserver.disconnect();
      markersMapRef.current.clear();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Base Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const baseConfig = TILE_SERVERS[activeBaseLayer];
    tileLayerRef.current.setUrl(baseConfig.url);
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

  // Render Station Markers & Peer Lines (In-Place Incremental Updates to Prevent Flickering)
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !peerLinesLayerRef.current) return;

    // 1. Peer Correlation Vectors (only re-create if empty or toggled)
    if (showPeerCorrelations) {
      if (peerLinesLayerRef.current.getLayers().length === 0) {
        const peerPairs: [string, string][] = [
          ['Jaisalmer_Sam', 'RJ_BARMER_002'],
          ['Delhi_Safdarjung', 'DL_PALAM_004'],
          ['Chennai_Meenambakkam', 'KA_BLR_005'],
        ];

        peerPairs.forEach(([st1Id, st2Id]) => {
          const s1 = stations.find((s) => s.id === st1Id);
          const s2 = stations.find((s) => s.id === st2Id);
          if (s1 && s2) {
            const line = L.polyline(
              [
                [s1.lat, s1.lng],
                [s2.lat, s2.lng],
              ],
              {
                color: '#4A6B78',
                weight: 1.5,
                opacity: 0.65,
                dashArray: '4, 6',
              }
            );
            peerLinesLayerRef.current?.addLayer(line);
          }
        });
      }
    } else {
      peerLinesLayerRef.current.clearLayers();
    }

    // 2. AWS Stations Markers with Smooth, In-Place DOM Updates
    stations.forEach((st) => {
      const isSelected = st.id === selectedStationId;
      const isFault = st.quality === 'sensor_fault';
      const isEvent = st.quality === 'genuine_event';
      const isReview = st.quality === 'uncertain';

      let dotColor = '#10B981'; // Validated emerald
      let labelText = 'VALIDATED';
      let borderStyle = isSelected
        ? 'border-[#4A6B78] ring-2 ring-[#4A6B78]/50 shadow-md'
        : 'border-slate-300';

      const isHighlighted = st.id === highlightedStationId;

      if (isFault) {
        dotColor = '#EF4444';
        labelText = 'FAULT';
        if (isHighlighted) {
          borderStyle = 'border-red-600 ring-4 ring-red-500/90 shadow-2xl bg-red-50/95 scale-105 transition-transform';
        } else {
          borderStyle = isSelected
            ? 'border-red-500 ring-2 ring-red-500/50 shadow-md'
            : 'border-red-300';
        }
      } else if (isEvent) {
        dotColor = '#3B82F6';
        labelText = 'EVENT';
        if (isHighlighted) {
          borderStyle = 'border-blue-600 ring-4 ring-blue-500/80 shadow-2xl bg-blue-50/95 scale-105 transition-transform';
        } else {
          borderStyle = isSelected
            ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-md'
            : 'border-blue-300';
        }
      } else if (isReview) {
        dotColor = '#F59E0B';
        labelText = 'REVIEW';
        borderStyle = isSelected
          ? 'border-amber-500 ring-2 ring-amber-500/50 shadow-md'
          : 'border-amber-300';
      }

      // Compute cute climatic feature & animation
      const weather = getCuteWeatherDetails(st);
      const pulseClass = (isHighlighted && isFault)
        ? 'station-marker-fault animate-pulse ring-4 ring-red-400'
        : isFault
        ? 'station-marker-fault'
        : isEvent
        ? 'station-marker-event'
        : '';

      const highlightBeacon = (isHighlighted && isFault)
        ? `<div class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-red-600 text-white font-mono text-[8.5px] font-extrabold uppercase shadow-xl border border-white animate-bounce tracking-wider whitespace-nowrap z-50">
             🚨 SENSOR FAULT!
           </div>`
        : (isHighlighted && isEvent)
        ? `<div class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-blue-600 text-white font-mono text-[8.5px] font-extrabold uppercase shadow-xl border border-white tracking-wider whitespace-nowrap z-50">
             🌐 GENUINE EVENT
           </div>`
        : '';

      const iconHtml = `
        <div class="relative flex flex-col items-center select-none cursor-pointer group" id="station-marker-${st.id}" style="width: 160px;">
          ${highlightBeacon}
          <!-- Cute Weather Node Floating on Top -->
          <div class="mb-1 flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-md transition-all duration-300 group-hover:scale-105 ${weather.badgeClass}" style="animation: cute-badge-float 3s ease-in-out infinite;">
            ${weather.iconHtml}
            <div class="flex items-center gap-1 text-[10px] font-sans font-bold leading-none tracking-tight">
              <span>${weather.label}</span>
              <span class="text-[9px] font-mono opacity-85">${st.currentObservation.tempC.toFixed(0)}°</span>
            </div>
          </div>

          <!-- Station Telemetry Pill with Solid Background and High Contrast -->
          <div class="relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border ${borderStyle} shadow-lg transition-all duration-300 group-hover:shadow-xl">
            <div class="absolute inset-0 rounded-xl ${pulseClass} pointer-events-none"></div>
            <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style="background-color: ${dotColor};"></span>
            <div class="flex flex-col leading-tight min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1 text-[11px] font-mono font-bold text-slate-800">
                <span>${st.currentObservation.tempC.toFixed(1)}°C</span>
                <span class="text-[9.5px] text-slate-500 font-semibold">${st.currentObservation.rhPercent.toFixed(0)}% RH</span>
              </div>
              <span class="text-[9.5px] font-mono text-slate-600 font-medium truncate max-w-[115px]">${st.name.replace('AWS', '').trim()}</span>
            </div>
          </div>

          <!-- GPS Pointing Tip Pin -->
          <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white -mt-0.5 filter drop-shadow-sm"></div>
        </div>
      `;

      // Rich Telemetry Popup with Matching Weather Node
      const popupHtml = `
        <div class="p-3 font-mono text-xs text-[#273844] max-w-[250px] bg-white rounded-xl">
          <div class="flex items-center justify-between gap-1 pb-2 border-b border-[#C7C2B8]">
            <div>
              <div class="font-bold text-[#273844] truncate">${st.name}</div>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="text-[9px] px-1.5 py-0.5 rounded ${weather.badgeClass} font-semibold flex items-center gap-1">
                  ${weather.label} &bull; ${st.currentObservation.tempC.toFixed(1)}°C
                </span>
              </div>
            </div>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#DDD8CF] text-[#273844] font-semibold shrink-0">${st.code}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 mt-2 text-[11px]">
            <div class="p-1.5 rounded bg-[#E8E6DD] border border-[#DDD8CF]">
              <div class="text-[9px] text-[#475560]">Temperature</div>
              <div class="font-bold text-[#273844]">${st.currentObservation.tempC.toFixed(1)}°C</div>
            </div>
            <div class="p-1.5 rounded bg-[#E8E6DD] border border-[#DDD8CF]">
              <div class="text-[9px] text-[#475560]">Humidity</div>
              <div class="font-bold text-[#273844]">${st.currentObservation.rhPercent.toFixed(1)}%</div>
            </div>
            <div class="p-1.5 rounded bg-[#E8E6DD] border border-[#DDD8CF]">
              <div class="text-[9px] text-[#475560]">Pressure</div>
              <div class="font-bold text-[#273844]">${st.currentObservation.pressureHpa.toFixed(1)} hPa</div>
            </div>
            <div class="p-1.5 rounded bg-[#E8E6DD] border border-[#DDD8CF]">
              <div class="text-[9px] text-[#475560]">QC Status</div>
              <div class="font-bold uppercase text-[10px]" style="color: ${dotColor};">${labelText}</div>
            </div>
          </div>

          <div class="mt-2 text-[10px] text-[#475560]">
            Dual BME280 Agreement: <strong class="${st.sensors.agreement.isAgreed ? 'text-[#2D6A4F]' : 'text-[#8E352B]'}">${st.sensors.agreement.isAgreed ? 'Matched' : 'Discrepant'}</strong>
          </div>

          <button
            onclick="window.dispatchEvent(new CustomEvent('inspect-station', { detail: '${st.id}' }))"
            class="w-full mt-2.5 py-1 px-2 rounded-lg bg-[#4A6B78] hover:bg-[#385460] text-white text-[10px] font-semibold transition-colors flex items-center justify-center gap-1"
          >
            Inspect Station Telemetry &rarr;
          </button>
        </div>
      `;

      let marker = markersMapRef.current.get(st.id);
      if (!marker) {
        // Create marker once
        marker = L.marker([st.lat, st.lng], {
          icon: L.divIcon({
            className: 'custom-weather-station-marker',
            html: iconHtml,
            iconSize: [160, 70],
            iconAnchor: [80, 70],
          }),
          zIndexOffset: isSelected ? 1000 : 100,
        });

        marker.on('click', () => {
          onSelectStation(st.id);
        });

        marker.bindPopup(popupHtml, {
          offset: [0, -42],
          closeButton: true,
        });

        markersLayerRef.current?.addLayer(marker);
        markersMapRef.current.set(st.id, marker);
      } else {
        // Update existing marker in-place without removing or flickering!
        marker.setLatLng([st.lat, st.lng]);
        marker.setZIndexOffset(isSelected ? 1000 : 100);

        const el = marker.getElement();
        if (el) {
          el.innerHTML = iconHtml;
        } else {
          marker.setIcon(
            L.divIcon({
              className: 'custom-weather-station-marker',
              html: iconHtml,
              iconSize: [160, 70],
              iconAnchor: [80, 70],
            })
          );
        }

        const popup = marker.getPopup();
        if (popup) {
          popup.setContent(popupHtml);
        }
      }
    });

    // Cleanup markers that are no longer in the station list
    const currentStationIds = new Set(stations.map((s) => s.id));
    markersMapRef.current.forEach((marker, id) => {
      if (!currentStationIds.has(id)) {
        markersLayerRef.current?.removeLayer(marker);
        markersMapRef.current.delete(id);
      }
    });
  }, [stations, selectedStationId, highlightedStationId, showPeerCorrelations]);

  // Smoothly center map onto highlighted station when testing
  useEffect(() => {
    if (highlightedStationId && mapInstanceRef.current) {
      const target = stations.find((s) => s.id === highlightedStationId);
      if (target) {
        mapInstanceRef.current.panTo([target.lat, target.lng], { animate: true, duration: 1.0 });
      }
    }
  }, [highlightedStationId, stations]);

  // Listen for popup inspection button dispatch
  useEffect(() => {
    const handleInspect = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        onSelectStation(customEvent.detail);
      }
    };
    window.addEventListener('inspect-station', handleInspect);
    return () => window.removeEventListener('inspect-station', handleInspect);
  }, [onSelectStation]);

  const resetView = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([22.8, 79.5], 4.8, { duration: 1 });
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden rounded-2xl bg-[#DDD8CF]">
      {/* Top Map Layer & Feature Controls */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-2 pointer-events-auto">
        {/* Layer Selector */}
        <div className="flex items-center bg-[#FFFFFF] p-1 rounded-xl border border-[#C7C2B8] shadow-sm">
          <div className="px-2 py-0.5 text-[10px] font-mono font-bold text-[#475560] border-r border-[#C7C2B8] flex items-center gap-1">
            <Layers className="w-3 h-3 text-[#4A6B78]" />
            <span className="hidden sm:inline">Tiles</span>
          </div>
          <button
            onClick={() => setActiveBaseLayer('osm')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-colors ${
              activeBaseLayer === 'osm'
                ? 'bg-[#4A6B78] text-white font-bold shadow-xs'
                : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            OSM
          </button>
          <button
            onClick={() => setActiveBaseLayer('light')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-colors ${
              activeBaseLayer === 'light'
                ? 'bg-[#4A6B78] text-white font-bold shadow-xs'
                : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Light
          </button>
          <button
            onClick={() => setActiveBaseLayer('dark')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-colors ${
              activeBaseLayer === 'dark'
                ? 'bg-[#4A6B78] text-white font-bold shadow-xs'
                : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => setActiveBaseLayer('satellite')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-colors ${
              activeBaseLayer === 'satellite'
                ? 'bg-[#4A6B78] text-white font-bold shadow-xs'
                : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Sat
          </button>
          <button
            onClick={() => setActiveBaseLayer('topo')}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium transition-colors ${
              activeBaseLayer === 'topo'
                ? 'bg-[#4A6B78] text-white font-bold shadow-xs'
                : 'text-[#475560] hover:text-[#273844]'
            }`}
          >
            Topo
          </button>
        </div>

        {/* Doppler Radar Toggle */}
        <button
          onClick={() => setShowRadar(!showRadar)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-mono font-semibold border transition-all shadow-sm ${
            showRadar
              ? 'bg-[#4A6B78] border-[#4A6B78] text-white'
              : 'bg-[#FFFFFF] border-[#C7C2B8] text-[#475560] hover:text-[#273844]'
          }`}
        >
          <CloudRain className="w-3 h-3" />
          <span>Radar {showRadar ? 'ON' : 'OFF'}</span>
        </button>

        {/* Spatial Peer Vectors Toggle */}
        <button
          onClick={() => setShowPeerCorrelations(!showPeerCorrelations)}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-mono font-semibold border transition-all shadow-sm ${
            showPeerCorrelations
              ? 'bg-[#FFFFFF] border-[#4A6B78] text-[#4A6B78]'
              : 'bg-[#FFFFFF] border-[#C7C2B8] text-[#475560]'
          }`}
        >
          <Radio className="w-3 h-3" />
          <span>Peer Vectors</span>
        </button>
      </div>

      {/* Map Tools & Zoom Controls (Right) */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
        <button
          onClick={resetView}
          className="p-2 rounded-xl bg-[#FFFFFF] hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-sm transition-colors"
          title="Reset View to All India"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#4A6B78]" />
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-8 h-8 rounded-xl bg-[#FFFFFF] hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-sm font-mono font-bold text-xs flex items-center justify-center transition-colors"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-8 h-8 rounded-xl bg-[#FFFFFF] hover:bg-[#DDD8CF] border border-[#C7C2B8] text-[#273844] shadow-sm font-mono font-bold text-xs flex items-center justify-center transition-colors"
          title="Zoom Out"
        >
          -
        </button>
      </div>

      {/* Quick Station Jump Bar (Bottom Left) */}
      <div className="absolute bottom-3 left-3 z-[1000] hidden lg:flex items-center gap-1.5 bg-[#FFFFFF]/90 backdrop-blur-sm p-1.5 rounded-xl border border-[#C7C2B8] shadow-sm pointer-events-auto">
        <span className="text-[10px] font-mono font-semibold text-[#475560] px-1.5">
          Focus:
        </span>
        {stations.map((st) => {
          const isSelected = st.id === selectedStationId;
          return (
            <button
              key={st.id}
              onClick={() => {
                onSelectStation(st.id);
                mapInstanceRef.current?.flyTo([st.lat, st.lng], 9, { duration: 1.2 });
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all ${
                isSelected
                  ? 'bg-[#4A6B78] text-white font-semibold shadow-xs'
                  : 'text-[#475560] hover:bg-[#DDD8CF] hover:text-[#273844]'
              }`}
            >
              {st.name.replace('AWS', '').trim()}
            </button>
          );
        })}
      </div>

      {/* Map Target DOM */}
      <div ref={mapContainerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};
