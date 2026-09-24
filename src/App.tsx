/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ACTUAL_AWS_STATIONS,
  INDIA_STATES_INFO,
  DEMO_SCENARIOS_LIST,
  TIMELINE_FRAMES,
  ALERT_ITEMS,
} from './data/skyguardData';
import {
  AWSStation,
  StateInfo,
  DistrictInfo,
  DemoScenario,
  AlertItem,
  HierarchyLevel,
} from './types';
import { Breadcrumbs } from './components/Breadcrumbs';
import { IndiaVectorMap } from './components/IndiaVectorMap';
import { ActualIndiaMap } from './components/ActualIndiaMap';
import { StateVectorMap } from './components/StateVectorMap';
import { DistrictDetailView } from './components/DistrictDetailView';
import { StationDetailView } from './components/StationDetailView';
import { SensorDetailView } from './components/SensorDetailView';
import { MapLegend } from './components/MapLegend';
import { MapTimeline } from './components/MapTimeline';
import { NetworkSummary } from './components/NetworkSummary';
import { AlertsPanel } from './components/AlertsPanel';
import { ScenarioSelector } from './components/ScenarioSelector';
import { APIEndpointInspector } from './components/APIEndpointInspector';
import { LiveTestDropdown, LiveTestResult } from './components/LiveTestDropdown';
import { LiveTestPopup } from './components/LiveTestPopup';


import {
  Radio,
  Search,
  Server,
  Map,
  Compass,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useStationData } from './hooks/useStationData';
import { useWebSocket } from './hooks/useWebSocket';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DataModeSelector } from './components/DataModeSelector';

export default function App() {
  // Navigation & Hierarchy State
  const [currentLevel, setCurrentLevel] = useState<HierarchyLevel>('india');
  const [selectedStateId, setSelectedStateId] = useState<string>('tamil_nadu');
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('chennai');
  const [selectedStationId, setSelectedStationId] = useState<string>('Chennai_Meenambakkam');
  const [selectedSensorId, setSelectedSensorId] = useState<'bme280_1' | 'bme280_2'>('bme280_1');

  // Timeline & Scenarios State (Defaults to baseline normal operations)
  const [timelineIndex, setTimelineIndex] = useState<number>(0); // 12:00 Baseline
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('scenario_a');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [mapDisplayMode, setMapDisplayMode] = useState<'actual' | 'vector'>('actual');
  const [dataMode, setDataMode] = useState<'static' | 'demo' | 'live'>('demo');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Live Manual ML Test State
  const [liveTestPopupResult, setLiveTestPopupResult] = useState<LiveTestResult | null>(null);
  const [highlightedStationId, setHighlightedStationId] = useState<string | undefined>(undefined);

  // Backend Integration
  const { stations: apiStations, updateStation } = useStationData(ACTUAL_AWS_STATIONS);
  const wsUrl = `ws://${window.location.host}/ws`;
  const { isConnected, lastMessage, sendMessage } = useWebSocket(wsUrl);
  const lastProcessedMessageRef = useRef<any>(null);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage && lastMessage !== lastProcessedMessageRef.current) {
      lastProcessedMessageRef.current = lastMessage;
      if (lastMessage.type === 'station_update' && dataMode !== 'static') {
        updateStation(lastMessage);
      }
    }
  }, [lastMessage, updateStation, dataMode]);

  // Active Station Data with dynamic timeline / scenario overrides
  const stations: AWSStation[] = useMemo(() => {
    if (dataMode !== 'static') {
      return apiStations;
    }

    const activeFrame = TIMELINE_FRAMES[timelineIndex] || TIMELINE_FRAMES[0];

    return ACTUAL_AWS_STATIONS.map((st: AWSStation) => {
      // Apply timeline frame status if present
      const frameOverride = activeFrame.stationSnapshots[st.id];
      if (!frameOverride) return st;

      return {
        ...st,
        quality: frameOverride.quality,
        currentObservation: {
          ...st.currentObservation,
          tempC: frameOverride.tempC,
          rhPercent: frameOverride.rhPercent,
          pressureHpa: frameOverride.pressureHpa,
          observedAt: `${activeFrame.timeStr} IST`,
        },
        decision: {
          ...st.decision,
          decision: frameOverride.quality,
          sAnomaly: frameOverride.sAnomaly,
          sEvent: frameOverride.sEvent,
        },
      };
    });
  }, [timelineIndex, dataMode, apiStations]);

  // Derived selected entities
  const selectedState = useMemo<StateInfo>(() => {
    return (
      INDIA_STATES_INFO.find((s: StateInfo) => s.id === selectedStateId) ||
      INDIA_STATES_INFO[0]
    );
  }, [selectedStateId]);

  const selectedDistrict = useMemo<DistrictInfo>(() => {
    const found = selectedState.districts.find(
      (d: DistrictInfo) => d.id === selectedDistrictId
    );
    if (found) return found;
    return selectedState.districts[0];
  }, [selectedState, selectedDistrictId]);

  const selectedStation = useMemo<AWSStation>(() => {
    return (
      stations.find((s: AWSStation) => s.id === selectedStationId) || stations[0]
    );
  }, [stations, selectedStationId]);

  const selectedSensor = useMemo(() => {
    return selectedSensorId === 'bme280_1'
      ? selectedStation.sensors.sensor1
      : selectedStation.sensors.sensor2;
  }, [selectedStation, selectedSensorId]);

  // Active Alerts based on timeline frame
  const activeAlerts: AlertItem[] = useMemo(() => {
    return ALERT_ITEMS;
  }, []);

  // Handle Scenario Selection
  const findStateForStation = (targetState: string) => {
    if (!targetState) return undefined;
    const norm = targetState.toLowerCase().trim();
    return INDIA_STATES_INFO.find((st: StateInfo) => {
      const sName = st.name.toLowerCase();
      const sId = st.id.toLowerCase();
      const sCode = st.code.toLowerCase();
      return (
        sName === norm ||
        sId === norm ||
        sCode === norm ||
        sName.includes(norm) ||
        norm.includes(sName) ||
        (norm.includes('delhi') && (sId === 'delhi' || sName.includes('delhi')))
      );
    });
  };

  // Handle Scenario Selection
  const handleSelectScenario = async (sc: DemoScenario) => {
    setSelectedScenarioId(sc.id);
    setSelectedStationId(sc.targetStationId);

    // Notify backend to activate scenario
    if (dataMode === 'demo') {
      sendMessage({ type: 'activate_scenario', scenario_id: sc.id });
    }

    // Find state and district of the focus station
    const targetStation = stations.find((st: AWSStation) => st.id === sc.targetStationId);
    if (targetStation) {
      const stateObj = findStateForStation(targetStation.state);
      if (stateObj) {
        setSelectedStateId(stateObj.id);
        const distId = targetStation.district.toLowerCase().replace(/\s+/g, '_');
        const distExists = stateObj.districts.some((d) => d.id === distId);
        setSelectedDistrictId(distExists ? distId : stateObj.districts[0]?.id || distId);
      } else {
        setSelectedDistrictId(targetStation.district.toLowerCase().replace(/\s+/g, '_'));
      }
    }

    // Automatically navigate to station detail for instant verification
    setCurrentLevel('station');
  };

  // Handle Station Quick Select
  const handleSelectStation = (stationId: string) => {
    setSelectedStationId(stationId);
    const target = stations.find((st: AWSStation) => st.id === stationId);
    if (target) {
      const stateObj = findStateForStation(target.state);
      if (stateObj) {
        setSelectedStateId(stateObj.id);
        const distId = target.district.toLowerCase().replace(/\s+/g, '_');
        const distExists = stateObj.districts.some((d) => d.id === distId);
        setSelectedDistrictId(distExists ? distId : stateObj.districts[0]?.id || distId);
      } else {
        setSelectedDistrictId(target.district.toLowerCase().replace(/\s+/g, '_'));
      }
    }
    setCurrentLevel('station');
  };

  // Handle State Selection
  const handleSelectState = (stateId: string) => {
    setSelectedStateId(stateId);
    const stateObj = INDIA_STATES_INFO.find((st: StateInfo) => st.id === stateId);
    if (stateObj && stateObj.districts.length > 0) {
      setSelectedDistrictId(stateObj.districts[0].id);
    }
    setCurrentLevel('state');
  };

  // Handle District Selection
  const handleSelectDistrict = (districtId: string) => {
    setSelectedDistrictId(districtId);
    const dist = selectedState.districts.find((d: DistrictInfo) => d.id === districtId);
    if (dist && dist.hasStation && dist.stationId) {
      setSelectedStationId(dist.stationId);
    }
    setCurrentLevel('district');
  };

  // Handle Manual Live Test Complete
  const handleLiveTestComplete = (result: LiveTestResult) => {
    // If user was on static mode, switch to live demo mode to see real updates
    if (dataMode === 'static') {
      setDataMode('demo');
    }

    // Keep view on India map to visually observe the station marker update
    setCurrentLevel('india');
    setSelectedStationId(result.station_id);
    setHighlightedStationId(result.station_id);

    // Apply the exact real-time ML decision and observation returned from FastAPI
    updateStation({
      station_id: result.station_id,
      observation: result.reading,
      decision: result.decision,
    });

    // Display the smooth macOS-style query popup (Green for pass, Red alert for anomaly)
    setLiveTestPopupResult(result);
  };

  // Filtered station search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return stations.filter(
      (s: AWSStation) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.district.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q)
    );
  }, [stations, searchQuery]);

  return (
    <div className="relative flex flex-col h-screen w-screen bg-[#E8E6DD] text-[#273844] font-sans overflow-hidden">




      {/* Top Operations Header */}
      <header className="relative h-14 bg-[#FFFFFF]/95 backdrop-blur-sm border-b border-[#C7C2B8] px-4 flex items-center justify-between gap-4 shrink-0 select-none z-30">

        <div className="flex items-center gap-3">
          {/* Logo & Identity */}
          <div
            onClick={() => setCurrentLevel('india')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#4A6B78] flex items-center justify-center text-white transition-opacity group-hover:opacity-90">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm tracking-wider text-[#273844]">
                  SKYGUARD AI
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#DDD8CF] text-[#273844] font-semibold">
                  QC Command
                </span>
              </div>
              <p className="text-[10px] text-[#475560] font-mono hidden sm:block">
                Meteorological Observation Quality Control Center
              </p>
            </div>
          </div>
        </div>

        {/* Central Search / Quick Switcher */}
        <div className="relative flex-1 max-w-md hidden md:block">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#475560] absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search 7 AWS stations, districts, states..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-[#E8E6DD] border border-[#C7C2B8] text-xs font-mono text-[#273844] placeholder-[#475560] focus:outline-none focus:border-[#4A6B78] focus:bg-[#FFFFFF] transition-all"
            />
          </div>

          {/* Quick Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#FFFFFF] border border-[#C7C2B8] rounded-xl shadow-lg p-1.5 z-50 max-h-60 overflow-y-auto">
              {searchResults.map((st: AWSStation) => (
                <button
                  key={st.id}
                  onClick={() => {
                    handleSelectStation(st.id);
                    setSearchQuery('');
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-[#DDD8CF]/50 flex items-center justify-between text-xs font-mono transition-colors"
                >
                  <div>
                    <span className="font-semibold text-[#273844]">{st.name}</span>
                    <span className="text-[#475560] text-[10px] ml-2">
                      ({st.district}, {st.state})
                    </span>
                  </div>
                  <span className="text-[#4A6B78] font-semibold">{st.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Operations Status & API Inspector button */}
        <div className="flex items-center gap-2.5">
          <LiveTestDropdown
            stations={stations}
            selectedStationId={selectedStationId}
            onSelectStation={(id) => {
              setSelectedStationId(id);
              setHighlightedStationId(id);
            }}
            onTestComplete={handleLiveTestComplete}
          />

          <DataModeSelector mode={dataMode} onModeChange={setDataMode} simulatorRunning={isConnected && dataMode === 'demo'} />
          <ConnectionStatus isConnected={isConnected} mode={dataMode} />
          
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-lg bg-[#DDD8CF] text-[11px] font-mono text-[#273844]">
            <span className="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
            <span>Network: 7/7 Monitored AWS</span>
          </div>

          <button
            onClick={() => setIsApiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DDD8CF] hover:bg-[#C7C2B8] border border-[#C7C2B8] text-[#273844] text-xs font-mono font-medium transition-colors"
            title="Inspect REST API schemas for backend integration"
          >
            <Server className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span className="hidden sm:inline">REST API</span>
          </button>
        </div>
      </header>

      {/* Main Hierarchy Breadcrumbs Navigation Bar */}
      <div className="relative bg-[#DDD8CF]/40 border-b border-[#C7C2B8] px-4 py-1.5 shrink-0 z-20 backdrop-blur-[2px]">
        <Breadcrumbs
          currentLevel={currentLevel}
          stateName={selectedState.name}
          districtName={selectedDistrict.name}
          stationName={selectedStation.name}
          sensorName={selectedSensor.name}
          onNavigate={(level: HierarchyLevel) => setCurrentLevel(level)}
        />
      </div>

      {/* Main Working View Area */}
      <main className="relative flex-1 overflow-hidden z-10">

        {/* National Level View (Map-first Command Center) */}
        {currentLevel === 'india' && (
          <div className="h-full flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden">
            {/* Left/Center: The Interactive India Vector Map & Timeline */}
            <div className="flex-1 flex flex-col p-3 xl:p-4 overflow-hidden min-h-[540px]">
              {/* Map Canvas */}
              <div className="flex-1 relative rounded-2xl bg-[#FFFFFF] border border-[#C7C2B8] overflow-hidden shadow-sm flex items-center justify-center">
                {/* Map Display Mode Switcher (Actual Slippy Map vs Schematic Vector) */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] hidden sm:flex items-center gap-1 bg-[#FFFFFF] p-1 rounded-xl border border-[#C7C2B8] shadow-md pointer-events-auto">
                  <button
                    onClick={() => setMapDisplayMode('actual')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
                      mapDisplayMode === 'actual'
                        ? 'bg-[#4A6B78] text-white'
                        : 'text-[#475560] hover:text-[#273844]'
                    }`}
                  >
                    <Map className="w-3.5 h-3.5" />
                    <span>GIS Map</span>
                  </button>
                  <button
                    onClick={() => setMapDisplayMode('vector')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
                      mapDisplayMode === 'vector'
                        ? 'bg-[#4A6B78] text-white'
                        : 'text-[#475560] hover:text-[#273844]'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Schematic</span>
                  </button>
                </div>

                {mapDisplayMode === 'actual' ? (
                  <ActualIndiaMap
                    stations={stations}
                    states={INDIA_STATES_INFO}
                    selectedStationId={selectedStationId}
                    highlightedStationId={highlightedStationId}
                    onSelectStation={(id: string) => handleSelectStation(id)}
                    onSelectState={(id: string) => handleSelectState(id)}
                  />
                ) : (
                  <IndiaVectorMap
                    stations={stations}
                    states={INDIA_STATES_INFO}
                    selectedStationId={selectedStationId}
                    highlightedStationId={highlightedStationId}
                    onSelectStation={(id: string) => handleSelectStation(id)}
                    onSelectState={(id: string) => handleSelectState(id)}
                  />
                )}

                {/* Floating Map Maximize / Panel Toggle Button */}
                <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 pointer-events-auto">
                  {mapDisplayMode === 'vector' && (
                    <div className="max-w-xs hidden md:block">
                      <MapLegend />
                    </div>
                  )}

                  <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFFFFF]/95 hover:bg-[#DDD8CF] border border-[#C7C2B8] text-xs font-mono font-bold text-[#273844] shadow-sm transition-all"
                    title={isSidebarOpen ? "Maximize Map (Hide Sidebar)" : "Show Operations Panel"}
                  >
                    {isSidebarOpen ? (
                      <>
                        <Maximize2 className="w-3.5 h-3.5 text-[#4A6B78]" />
                        <span className="hidden sm:inline">Maximize Map</span>
                      </>
                    ) : (
                      <>
                        <PanelRightOpen className="w-3.5 h-3.5 text-[#4A6B78]" />
                        <span>Show Panel</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Scrubbable Timeline Bar (Only show in static mode) */}
              {dataMode === 'static' && (
                <div className="mt-3">
                  <MapTimeline
                    frames={TIMELINE_FRAMES}
                    currentFrameIndex={timelineIndex}
                    onSelectFrame={(idx: number) => setTimelineIndex(idx)}
                  />
                </div>
              )}
            </div>

            {/* Right Structural Sidebar: Network Telemetry, Scenarios & Alerts */}
            {isSidebarOpen && (
              <div className="w-full xl:w-[380px] border-t xl:border-t-0 xl:border-l border-[#C7C2B8] p-3.5 space-y-3.5 overflow-y-auto bg-[#FFFFFF] shrink-0 transition-all duration-300">
                <div className="flex items-center justify-between pb-2 border-b border-[#DDD8CF]">
                  <span className="text-xs font-mono font-bold text-[#273844] uppercase tracking-wider">
                    Operations Panel
                  </span>
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1 rounded-md hover:bg-[#DDD8CF] text-[#475560] hover:text-[#273844] transition-colors"
                    title="Collapse Sidebar for Full Map"
                  >
                    <PanelRightClose className="w-4 h-4" />
                  </button>
                </div>

                {/* Network Stats Summary */}
                <NetworkSummary stations={stations} />

                {/* 5 Canonical Test Scenarios */}
                <ScenarioSelector
                  scenarios={DEMO_SCENARIOS_LIST}
                  selectedScenarioId={selectedScenarioId}
                  onSelectScenario={handleSelectScenario}
                />

                {/* Real-time Alerts Feed */}
                <AlertsPanel
                  alerts={activeAlerts}
                  onInvestigateAlert={(stId: string) => handleSelectStation(stId)}
                />
              </div>
            )}
          </div>
        )}

        {/* State Level View */}
        {currentLevel === 'state' && (
          <StateVectorMap
            state={selectedState}
            stations={stations}
            onSelectDistrict={(id: string) => handleSelectDistrict(id)}
            onSelectStation={(id: string) => handleSelectStation(id)}
            onBackToNational={() => setCurrentLevel('india')}
          />
        )}

        {/* District Level View */}
        {currentLevel === 'district' && (
          <DistrictDetailView
            district={selectedDistrict}
            state={selectedState}
            stations={stations}
            onSelectStation={(id: string) => handleSelectStation(id)}
            onBackToState={() => setCurrentLevel('state')}
          />
        )}

        {/* AWS Station Level View */}
        {currentLevel === 'station' && (
          <StationDetailView
            station={selectedStation}
            onSelectSensor={(sensorId: 'bme280_1' | 'bme280_2') => {
              setSelectedSensorId(sensorId);
              setCurrentLevel('sensor');
            }}
            onBackToDistrict={() => setCurrentLevel('district')}
            onBackToNational={() => setCurrentLevel('india')}
          />
        )}

        {/* Individual Physical Sensor Level View */}
        {currentLevel === 'sensor' && (
          <SensorDetailView
            sensor={selectedSensor}
            station={selectedStation}
            onBackToStation={() => setCurrentLevel('station')}
          />
        )}
      </main>

      {/* REST API Endpoints Modal */}
      <APIEndpointInspector
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        stations={stations}
      />

      {/* Real-Time ML Live Test Query Notification Popup */}
      <LiveTestPopup
        result={liveTestPopupResult}
        onClose={() => setLiveTestPopupResult(null)}
      />
    </div>
  );
}
