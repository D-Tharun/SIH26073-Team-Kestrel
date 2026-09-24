"""
SkyGuard AI — Spatial Buddy Analyzer
Cross-station geographic correlation analysis.
"""
import numpy as np
from typing import Dict, List, Optional
from server.config import BUDDY_PAIRS, STATIONS


class SpatialAnalyzer:
    """
    Spatial pillar: analyzes cross-station consistency.
    
    Uses buddy station pairs to determine if an anomaly is:
    - Sensor fault (buddy disagrees → likely sensor issue)
    - Genuine event (buddy agrees → likely real weather event)
    """
    
    def analyze(self, station_id: str, current: Dict,
                all_station_data: Dict[str, Dict]) -> Dict:
        """
        Analyze spatial consistency with buddy stations.
        
        Args:
            station_id: ID of station being analyzed
            current: Current observation dict
            all_station_data: Dict of station_id → latest observation dict
        """
        buddies = self._find_buddies(station_id)
        if not buddies:
            buddies = [sid for sid in all_station_data if sid != station_id]
        
        if not buddies:
            return self._no_buddies_result()
        
        comparisons = []
        supports_event = 0
        contradicts = 0
        
        for buddy_id in buddies:
            buddy_data = all_station_data.get(buddy_id)
            if buddy_data is None:
                continue
            
            buddy_config = STATIONS.get(buddy_id, {})
            station_config = STATIONS.get(station_id, {})
            
            distance_km = self._haversine_distance(
                station_config.get("lat", 0), station_config.get("lng", 0),
                buddy_config.get("lat", 0), buddy_config.get("lng", 0),
            )
            
            delta_temp = abs(current.get("temp_c", 0) - buddy_data.get("temp_c", 0))
            delta_hum = abs(current.get("humidity_pct", 0) - buddy_data.get("humidity_pct", 0))
            delta_pres = abs(current.get("pressure_hpa", 0) - buddy_data.get("pressure_hpa", 0))
            
            # Adjust thresholds by distance (farther stations can differ more)
            dist_factor = max(1.0, distance_km / 100.0)
            temp_threshold = 1.5 * dist_factor
            hum_threshold = 8.0 * dist_factor
            pres_threshold = 2.0 * dist_factor
            
            is_consistent = (
                delta_temp < temp_threshold and
                delta_hum < hum_threshold and
                delta_pres < pres_threshold
            )
            
            if is_consistent:
                supports_event += 1
            else:
                contradicts += 1
            
            comparisons.append({
                "station_id": buddy_id,
                "station_name": buddy_config.get("name", buddy_id),
                "distance_km": round(distance_km, 1),
                "temp_c": buddy_data.get("temp_c", 0),
                "humidity_pct": buddy_data.get("humidity_pct", 0),
                "pressure_hpa": buddy_data.get("pressure_hpa", 0),
                "delta_temp_c": round(delta_temp, 2),
                "supports_event": is_consistent,
                "quality": "normal" if is_consistent else "sensor_fault",
            })
        
        total = supports_event + contradicts
        if total == 0:
            return self._no_buddies_result()
        
        agreement_ratio = supports_event / total
        score = agreement_ratio * 100
        
        if agreement_ratio >= 0.7:
            status = "normal" if score > 80 else "genuine_event"
            rationale = f"Buddy stations corroborate: {supports_event}/{total} consistent readings"
        elif agreement_ratio >= 0.3:
            status = "uncertain"
            rationale = f"Mixed buddy signals: {supports_event} agree, {contradicts} disagree"
        else:
            status = "sensor_fault"
            rationale = f"Buddy stations contradict: {contradicts}/{total} show significant deviation"
        
        # Regional event detection
        regional_event = supports_event >= 1 and agreement_ratio >= 0.6
        
        return {
            "status": status,
            "confidence_score": round(score, 1),
            "title": "Spatial Analysis",
            "metric_label": "Buddy Agreement",
            "metric_value": f"{supports_event}/{total} stations",
            "rationale": rationale,
            "buddies": comparisons,
            "regional_event_detected": regional_event,
            "regional_event_description": (
                f"Regional weather event confirmed across {supports_event} nearby stations"
                if regional_event else None
            ),
        }
    
    def _find_buddies(self, station_id: str) -> List[str]:
        """Find buddy stations for a given station."""
        buddies = []
        for pair in BUDDY_PAIRS:
            if station_id in pair:
                buddy = pair[0] if pair[1] == station_id else pair[1]
                buddies.append(buddy)
        
        # Also include any station within reasonable distance
        station_config = STATIONS.get(station_id, {})
        if not station_config:
            return buddies
        
        for sid, sconfig in STATIONS.items():
            if sid == station_id or sid in buddies:
                continue
            dist = self._haversine_distance(
                station_config.get("lat", 0), station_config.get("lng", 0),
                sconfig.get("lat", 0), sconfig.get("lng", 0),
            )
            if dist < 500:  # Within 500km
                buddies.append(sid)
        
        return buddies
    
    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance in km between two coordinates."""
        R = 6371.0
        lat1_r, lat2_r = np.radians(lat1), np.radians(lat2)
        dlat = np.radians(lat2 - lat1)
        dlon = np.radians(lon2 - lon1)
        a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
        return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    
    def _no_buddies_result(self) -> Dict:
        return {
            "status": "uncertain",
            "confidence_score": 40.0,
            "title": "Spatial Analysis",
            "metric_label": "Buddy Stations",
            "metric_value": "None available",
            "rationale": "No buddy stations available for spatial cross-validation",
            "buddies": [],
            "regional_event_detected": False,
            "regional_event_description": None,
        }
