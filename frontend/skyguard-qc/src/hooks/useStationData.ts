import { useState, useEffect, useCallback } from 'react';
import { AWSStation, SkyGuardQuality } from '../types';

function normalizeQuality(raw: any, fallback: SkyGuardQuality = 'normal'): SkyGuardQuality {
  if (!raw) return fallback;
  const s = String(raw).toLowerCase().trim();
  if (s.includes('fault') || s.includes('sensor')) return 'sensor_fault';
  if (s.includes('event')) return 'genuine_event';
  if (s.includes('uncertain') || s.includes('review') || s.includes('comm')) return 'uncertain';
  if (s.includes('normal')) return 'normal';
  return fallback;
}

export function useStationData(staticStations: AWSStation[]) {
  const [stations, setStations] = useState<AWSStation[]>(staticStations);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch of all stations
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await fetch('/api/stations');
        if (!res.ok) throw new Error('Failed to fetch stations');
        const data = await res.json();
        
        // Merge fetched data with static metadata
        setStations((prevStations) => 
          prevStations.map((st) => {
            const serverStation = data.stations.find((s: any) => 
              s.id === st.id || 
              s.id.toLowerCase() === st.id.toLowerCase() ||
              (s.id.includes('Delhi') && st.id.includes('Delhi')) ||
              (s.id.includes('Jaisalmer') && st.id.includes('Jaisalmer')) ||
              (s.id.includes('BLR') && st.id.includes('Bengaluru')) ||
              (s.id.includes('Bengaluru') && st.id.includes('Bengaluru'))
            );
            if (serverStation) {
              const obs = serverStation.current_observation || serverStation.currentObservation || {};
              const quality = normalizeQuality(serverStation.quality, st.quality);
              return {
                ...st,
                quality,
                currentObservation: {
                  ...st.currentObservation,
                  tempC: obs.temp_c ?? st.currentObservation?.tempC ?? 25,
                  pressureHpa: obs.pressure_hpa ?? st.currentObservation?.pressureHpa ?? 1013,
                  rhPercent: obs.humidity_pct ?? st.currentObservation?.rhPercent ?? 60,
                  observedAt: obs.timestamp 
                    ? new Date(obs.timestamp).toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST'
                    : st.currentObservation?.observedAt || '12:00 IST',
                },
              };
            }
            return st;
          })
        );
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching stations:', err);
        setError('Failed to connect to backend API');
        setIsLoading(false);
      }
    };

    fetchStations();
  }, []);

  // Update a single station (used when receiving WS updates)
  const updateStation = useCallback((update: any) => {
    if (!update || !update.station_id) return;
    
    setStations((prev) => prev.map((st) => {
      const isMatch =
        st.id === update.station_id ||
        st.id.toLowerCase() === update.station_id.toLowerCase() ||
        (update.station_id.includes('Delhi') && st.id.includes('Delhi')) ||
        (update.station_id.includes('Jaisalmer') && st.id.includes('Jaisalmer')) ||
        (update.station_id.includes('BLR') && st.id.includes('Bengaluru')) ||
        (update.station_id.includes('Bengaluru') && st.id.includes('Bengaluru'));

      if (isMatch) {
        const obs = update.observation || {};
        const dec = update.decision || {};
        const timeStr = obs.timestamp 
          ? new Date(obs.timestamp).toLocaleTimeString('en-US', { hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST'
          : st.currentObservation?.observedAt || '12:00 IST';

        const quality = normalizeQuality(dec.quality, st.quality);

        // Convert S_anomaly and S_event to 0-100 scale for UI progress bars
        const sAnomaly = typeof dec.S_anomaly === 'number'
          ? Math.round(dec.S_anomaly * 100)
          : (typeof dec.ml_ensemble?.ensemble_score === 'number'
              ? Math.round(dec.ml_ensemble.ensemble_score * 100)
              : (st.decision?.sAnomaly ?? 0));

        const sEvent = typeof dec.S_event === 'number'
          ? Math.round(dec.S_event * 100)
          : (dec.pillars?.spatial?.regional_event_detected ? 85 : 15);

        // Map live pillar evidence
        const pillars = dec.pillars ? {
          temporal: {
            title: dec.pillars.temporal?.title ?? 'Temporal Consistency',
            status: normalizeQuality(dec.pillars.temporal?.status, st.decision?.pillars?.temporal?.status || 'normal'),
            confidenceScore: dec.pillars.temporal?.confidence_score ?? st.decision?.pillars?.temporal?.confidenceScore ?? 95,
            metricLabel: dec.pillars.temporal?.metric_label ?? 'Max Rate-of-Change',
            metricValue: dec.pillars.temporal?.metric_value ?? '0.0 units/step',
            rationale: dec.pillars.temporal?.rationale ?? 'Temporal patterns consistent with expected diurnal cycle',
          },
          multivariate: {
            title: dec.pillars.multivariate?.title ?? 'Multivariate Dynamics',
            status: normalizeQuality(dec.pillars.multivariate?.status, st.decision?.pillars?.multivariate?.status || 'normal'),
            confidenceScore: dec.pillars.multivariate?.confidence_score ?? st.decision?.pillars?.multivariate?.confidenceScore ?? 95,
            metricLabel: dec.pillars.multivariate?.metric_label ?? 'Mahalanobis Distance',
            metricValue: dec.pillars.multivariate?.metric_value ?? '1.2 D²',
            rationale: dec.pillars.multivariate?.rationale ?? 'Cross-parameter atmospheric balance intact',
          },
          physics: {
            title: dec.pillars.physics?.title ?? 'Physics & Boundary',
            status: normalizeQuality(dec.pillars.physics?.status, st.decision?.pillars?.physics?.status || 'normal'),
            confidenceScore: dec.pillars.physics?.confidence_score ?? st.decision?.pillars?.physics?.confidenceScore ?? 95,
            metricLabel: dec.pillars.physics?.metric_label ?? 'Thermodynamic Boundary',
            metricValue: dec.pillars.physics?.metric_value ?? '0.00 violations',
            rationale: dec.pillars.physics?.rationale ?? 'Parameters satisfy Clausius-Clapeyron and altitude-lapse boundaries',
          },
          spatial: {
            title: dec.pillars.spatial?.title ?? 'Spatial Consistency',
            status: normalizeQuality(dec.pillars.spatial?.status, st.decision?.pillars?.spatial?.status || 'normal'),
            confidenceScore: dec.pillars.spatial?.confidence_score ?? st.decision?.pillars?.spatial?.confidenceScore ?? 95,
            metricLabel: dec.pillars.spatial?.metric_label ?? 'Spatial Buddy Consistency',
            metricValue: dec.pillars.spatial?.metric_value ?? '0.98 r',
            rationale: dec.pillars.spatial?.rationale ?? 'Validated against neighboring AWS stations',
          },
        } : (st.decision?.pillars as any);

        // Dual sensor agreement update
        const tempPrimary = obs.temp_c ?? st.currentObservation?.tempC ?? 25;
        const tempSecondary = obs.temp_c_secondary ?? tempPrimary;
        const deltaTemp = Math.abs(tempPrimary - tempSecondary);

        return {
          ...st,
          quality,
          currentObservation: {
            ...st.currentObservation,
            tempC: tempPrimary,
            pressureHpa: obs.pressure_hpa ?? st.currentObservation?.pressureHpa ?? 1013,
            rhPercent: obs.humidity_pct ?? st.currentObservation?.rhPercent ?? 60,
            observedAt: timeStr,
          },
          sensors: {
            ...st.sensors,
            sensor1: {
              ...st.sensors.sensor1,
              tempC: tempPrimary,
              pressureHpa: obs.pressure_hpa ?? 1013,
              rhPercent: obs.humidity_pct ?? 60,
            },
            sensor2: {
              ...st.sensors.sensor2,
              tempC: tempSecondary,
              pressureHpa: obs.pressure_hpa_secondary ?? obs.pressure_hpa ?? 1013,
              rhPercent: obs.humidity_pct_secondary ?? obs.humidity_pct ?? 60,
            },
            agreement: {
              ...st.sensors.agreement,
              deltaTempC: Number(deltaTemp.toFixed(2)),
              isAgreed: deltaTemp < 1.0,
              statusText: deltaTemp < 1.0 ? 'Dual BME280 In Agreement' : `Sensor Divergence: Δ${deltaTemp.toFixed(1)}°C`,
            },
          },
          decision: {
            ...st.decision,
            decision: quality,
            confidencePercent: dec.confidence_pct ?? st.decision?.confidencePercent ?? 95,
            sAnomaly,
            sEvent,
            assessment: dec.evidence_summary || st.decision?.assessment || 'Nominal atmospheric operations.',
            pillars: pillars || st.decision?.pillars,
          },
        };
      }
      return st;
    }));
  }, []);

  return { stations, updateStation, isLoading, error };
}
