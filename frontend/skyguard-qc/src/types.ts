/**
 * SkyGuard AI - National Meteorological Observation Quality Control Command Center
 * Core Data Models & Type Definitions
 */

export type SkyGuardQuality =
  | 'normal'          // ðŸŸ¢ Observation consistent with available evidence
  | 'genuine_event'   // ðŸ”µ Observation unusual, but evidence supports genuine atmospheric event
  | 'sensor_fault'    // ðŸ”´ Evidence suggests station or data-system problem
  | 'uncertain'       // ðŸŸ  Evidence conflicting or insufficient
  | 'no_data';        // âšª No SkyGuard observation available for this district/station

export type AtmosphericState =
  | 'warm_humid'      // ðŸŒ¤ï¸ Warm & Humid
  | 'extreme_heat'    // ðŸ”¥ Extreme Heat
  | 'cold'            // â„ï¸ Cold conditions
  | 'high_humidity'   // ðŸ’§ High Humidity
  | 'heavy_rain'      // ðŸŒ§ï¸ Heavy Precipitation
  | 'dry_heat'        // â˜€ï¸ Dry Heat
  | 'moderate';       // â›… Moderate

export type DataMode =
  | 'CONTROLLED_SCENARIO'
  | 'DEMO_DATA'
  | 'HISTORICAL'
  | 'LIVE_HARDWARE';

export interface BME280DataPoint {
  timeStr: string;
  tempC: number;
  rhPercent: number;
  pressureHpa: number;
  isFlagged?: boolean;
}

export interface BME280Sensor {
  id: 'bme280_1' | 'bme280_2';
  name: string;
  connected: boolean;
  busAddress: string;
  tempC: number;
  rhPercent: number;
  pressureHpa: number;
  calibrationOffsetC: number;
  driftRateCPerMonth: number;
  history1h: BME280DataPoint[];
  history6h: BME280DataPoint[];
  history24h: BME280DataPoint[];
}

export interface SensorAgreement {
  isAgreed: boolean;
  deltaTempC: number;
  deltaRhPercent: number;
  deltaPressureHpa: number;
  tempThresholdC: number;
  rhThresholdPercent: number;
  pressureThresholdHpa: number;
  statusText: string;
}

export interface EdgeQCChecks {
  overallPass: boolean;
  rangeCheck: boolean;
  rateOfChange: boolean;
  sensorAgreement: boolean;
  frozenValue: boolean;
  dataIntegrity: boolean;
  failingChecks: string[];
}

export interface PillarEvidence {
  status: SkyGuardQuality;
  confidenceScore: number; // 0 - 100
  title: string;
  metricLabel: string;
  metricValue: string;
  rationale: string;
}

export interface BuddyComparison {
  stationId: string;
  stationName: string;
  distanceKm: number;
  tempC: number;
  rhPercent: number;
  pressureHpa: number;
  quality: SkyGuardQuality;
  deltaTempC: number;
  supportsEvent: boolean;
}

export interface SkyGuardDecision {
  decision: SkyGuardQuality;
  confidencePercent: number;
  sAnomaly: number; // Suspiciousness score 0 - 100
  sEvent: number;   // Genuine event corroboration score 0 - 100
  primaryAnomalyType?: string;
  assessment: string;
  recommendedAction: string;
  pillars: {
    temporal: PillarEvidence;
    multivariate: PillarEvidence;
    physics: PillarEvidence;
    spatial: PillarEvidence;
  };
  buddies: BuddyComparison[];
  regionalEventDetected: boolean;
  regionalEventDescription?: string;
}

export interface AWSStation {
  id: string; // e.g. "Chennai_Meenambakkam"
  name: string;
  code: string;
  state: string; // e.g. "Tamil Nadu"
  district: string; // e.g. "Chennai"
  lat: number;
  lng: number;
  elevationMeters: number;
  hardwareModel: string;
  mcuType: string; // e.g. "ESP32-C3-Mini"
  firmwareVersion: string;
  lastTransmission: string;
  quality: SkyGuardQuality;
  atmosphericState: AtmosphericState;
  atmosphericDescription: string;
  currentObservation: {
    tempC: number;
    rhPercent: number;
    pressureHpa: number;
    dewPointC: number;
    observedAt: string;
  };
  sensors: {
    sensor1: BME280Sensor;
    sensor2: BME280Sensor;
    agreement: SensorAgreement;
  };
  edgeQC: EdgeQCChecks;
  decision: SkyGuardDecision;
}

export interface DistrictInfo {
  id: string;
  name: string;
  stateId: string;
  hasStation: boolean;
  stationId?: string;
  quality: SkyGuardQuality;
  tempC?: number;
  rhPercent?: number;
  pressureHpa?: number;
  atmosphericState?: AtmosphericState;
}

export interface StateInfo {
  id: string;
  name: string;
  code: string;
  centerLat: number;
  centerLng: number;
  svgPath: string;
  hasStations: boolean;
  stationCount: number;
  districts: DistrictInfo[];
}

export type DemoScenarioId =
  | 'scenario_a'
  | 'scenario_b'
  | 'scenario_c'
  | 'scenario_d'
  | 'scenario_e';

export interface DemoScenario {
  id: DemoScenarioId;
  code: string;
  title: string;
  targetStationId: string;
  targetStationName: string;
  stateName: string;
  targetQuality: SkyGuardQuality;
  subtitle: string;
  operationalSummary: string;
  whySkyGuardDecided: string;
  distinguishingPrinciple: string;
}

export interface AlertItem {
  id: string;
  timestamp: string;
  stationId: string;
  stationName: string;
  stateName: string;
  districtName: string;
  quality: SkyGuardQuality;
  title: string;
  description: string;
  sAnomaly: number;
  sEvent: number;
}

export interface TimelineFrame {
  timeStr: string; // "12:00", "12:30", "13:00", "13:30", "14:00"
  label: string;
  stationSnapshots: Record<string, {
    tempC: number;
    rhPercent: number;
    pressureHpa: number;
    quality: SkyGuardQuality;
    sAnomaly: number;
    sEvent: number;
    edgePass: boolean;
    sensor1Temp: number;
    sensor2Temp: number;
  }>;
}

export type HierarchyLevel = 'india' | 'state' | 'district' | 'station' | 'sensor';

export type NavigationLevel =
  | { type: 'national' }
  | { type: 'state'; stateId: string }
  | { type: 'district'; stateId: string; districtId: string }
  | { type: 'station'; stationId: string }
  | { type: 'sensor'; stationId: string; sensorId: 'bme280_1' | 'bme280_2' };

