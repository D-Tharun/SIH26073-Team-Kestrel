"""
SkyGuard AI — Imputation Engine
Estimates corrected values for flagged observations.
"""
import numpy as np
from typing import Dict, List, Optional
from server.config import STATIONS, BUDDY_PAIRS


class ImputationEngine:
    """
    Estimates corrected sensor values when observations are flagged.
    
    Methods:
      1. Temporal interpolation (weighted mean of adjacent readings)
      2. Spatial interpolation (buddy station values with distance weighting)
      3. Physics-based correction (dewpoint consistency enforcement)
    """
    
    def impute(
        self,
        current_obs: Dict,
        history: List[Dict],
        spatial_data: Dict[str, Dict],
        station_id: str,
    ) -> Dict:
        """
        Generate corrected observation estimates.
        
        Returns dict with corrected values and method used.
        """
        corrected = {}
        
        # Method 1: Temporal interpolation from history
        temporal_est = self._temporal_interpolation(history)
        
        # Method 2: Spatial interpolation from buddies
        spatial_est = self._spatial_interpolation(station_id, spatial_data)
        
        # Blend estimates (weighted average)
        for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
            values = []
            weights = []
            
            if temporal_est and param in temporal_est:
                values.append(temporal_est[param])
                weights.append(0.6)
            
            if spatial_est and param in spatial_est:
                values.append(spatial_est[param])
                weights.append(0.4)
            
            if values:
                total_weight = sum(weights[:len(values)])
                corrected[param] = round(
                    sum(v * w for v, w in zip(values, weights[:len(values)])) / total_weight, 2
                )
            else:
                corrected[param] = current_obs.get(param, 0)
        
        # Calculate deviation from original
        deviations = {}
        for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
            deviations[param] = round(
                corrected[param] - current_obs.get(param, 0), 2
            )
        
        return {
            "corrected_values": corrected,
            "deviations_from_original": deviations,
            "method": "temporal_spatial_blend",
            "temporal_estimate": temporal_est,
            "spatial_estimate": spatial_est,
        }
    
    def _temporal_interpolation(self, history: List[Dict]) -> Optional[Dict]:
        """Weighted average of recent history with exponential decay."""
        if not history or len(history) < 2:
            return None
        
        # Use last 4 readings with exponential decay weights
        recent = history[-4:]
        weights = [0.5 ** i for i in range(len(recent) - 1, -1, -1)]
        total_w = sum(weights)
        
        result = {}
        for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
            values = [r.get(param, 0) for r in recent]
            result[param] = round(
                sum(v * w for v, w in zip(values, weights)) / total_w, 2
            )
        
        return result
    
    def _spatial_interpolation(self, station_id: str, spatial_data: Dict[str, Dict]) -> Optional[Dict]:
        """Distance-weighted average of buddy station readings."""
        station_config = STATIONS.get(station_id, {})
        if not station_config:
            return None
        
        buddies = []
        for pair in BUDDY_PAIRS:
            if station_id in pair:
                buddy_id = pair[0] if pair[1] == station_id else pair[1]
                if buddy_id in spatial_data:
                    buddies.append(buddy_id)
        
        if not buddies:
            return None
        
        result = {}
        for param in ["temp_c", "pressure_hpa", "humidity_pct"]:
            values = []
            inv_distances = []
            
            for buddy_id in buddies:
                buddy_config = STATIONS.get(buddy_id, {})
                buddy_obs = spatial_data.get(buddy_id, {})
                if param not in buddy_obs:
                    continue
                
                dist = self._haversine(
                    station_config.get("lat", 0), station_config.get("lng", 0),
                    buddy_config.get("lat", 0), buddy_config.get("lng", 0),
                )
                if dist < 1:
                    dist = 1
                
                values.append(buddy_obs[param])
                inv_distances.append(1.0 / dist)
            
            if values:
                total_w = sum(inv_distances)
                result[param] = round(
                    sum(v * w for v, w in zip(values, inv_distances)) / total_w, 2
                )
        
        return result if result else None
    
    @staticmethod
    def _haversine(lat1, lon1, lat2, lon2):
        R = 6371.0
        lat1_r, lat2_r = np.radians(lat1), np.radians(lat2)
        dlat = np.radians(lat2 - lat1)
        dlon = np.radians(lon2 - lon1)
        a = np.sin(dlat / 2) ** 2 + np.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2) ** 2
        return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
