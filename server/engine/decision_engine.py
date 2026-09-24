"""
SkyGuard AI — 4-Pillar Decision Engine with Event-Aware Dual-Evidence Scoring
Synthesizes temporal, multivariate, physics, and spatial analyses
into a final quality classification aligned with SIH26073.

Core Concept (preserved from V1 EventAwareFusionEngine):
    S_anomaly = evidence that the observation system/sensor/data path is faulty
    S_event   = evidence that unusual weather is genuine

High anomaly evidence must NOT automatically mean sensor fault.
The dual-evidence framework disambiguates sensor failures from real weather.

Final Classification Taxonomy (SIH26073-aligned):
    NORMAL                  - All systems nominal
    GENUINE_EVENT           - Unusual weather confirmed genuine
    SENSOR_FAULT            - Sensor/hardware fault detected
    DATA_COMMUNICATION_FAULT - Missing/NaN data detected
    UNCERTAIN_REVIEW        - Conflicting evidence, manual review needed
"""
import logging
import math
import numpy as np
from typing import Dict, List, Optional
from server.config import PILLAR_WEIGHTS, STATIONS
from server.engine.temporal_analyzer import TemporalAnalyzer
from server.engine.physics_checker import PhysicsChecker
from server.engine.spatial_analyzer import SpatialAnalyzer
from server.engine.multivariate_analyzer import MultivariateAnalyzer

logger = logging.getLogger("skyguard.decision")


# Classification constants (SIH26073-aligned)
QUALITY_NORMAL = "NORMAL"
QUALITY_GENUINE_EVENT = "GENUINE_EVENT"
QUALITY_SENSOR_FAULT = "SENSOR_FAULT"
QUALITY_DATA_COMM_FAULT = "DATA_COMMUNICATION_FAULT"
QUALITY_UNCERTAIN = "UNCERTAIN_REVIEW"


class DecisionEngine:
    """
    4-Pillar Decision Engine with Event-Aware Dual-Evidence Scoring.
    
    Synthesizes:
      1. Temporal analysis (rate-of-change, frozen, trends)
      2. Multivariate analysis (cross-parameter Mahalanobis distance)
      3. Physics consistency (Clausius-Clapeyron, dewpoint, altitude)
      4. Spatial buddy analysis (cross-station correlation)
    
    Produces two evidence scores:
      S_anomaly = evidence the observation is suspicious (sensor/data fault)
      S_event   = evidence that unusual weather is genuine
    
    Final classification:
      - NORMAL: S_anomaly low AND S_event low — validated observation
      - GENUINE_EVENT: S_event elevated, spatially/physically corroborated
      - SENSOR_FAULT: S_anomaly elevated, NOT corroborated as real weather
      - DATA_COMMUNICATION_FAULT: Missing/NaN data detected
      - UNCERTAIN_REVIEW: Conflicting evidence, insufficient data
    """
    
    def __init__(self):
        self.temporal = TemporalAnalyzer()
        self.physics = PhysicsChecker()
        self.spatial = SpatialAnalyzer()
        self.multivariate = MultivariateAnalyzer()
    
    def evaluate(
        self,
        station_id: str,
        current_obs: Dict,
        history: List[Dict],
        ml_result: Dict,
        all_station_data: Dict[str, Dict],
    ) -> Dict:
        """
        Run full 4-pillar evaluation and produce final decision.
        
        Args:
            station_id: AWS station ID
            current_obs: Current observation dict (temp_c, pressure_hpa, humidity_pct)
            history: List of recent observation dicts
            ml_result: Output from EnsembleDetector.detect()
            all_station_data: Dict of station_id → latest observation for spatial analysis
        
        Returns:
            SkyGuard decision dict with quality classification, pillars,
            S_anomaly, S_event, and confidence
        """
        # ── Check for DATA_COMMUNICATION_FAULT (NaN/missing) ──
        data_fault = self._check_data_communication_fault(current_obs)
        if data_fault:
            return data_fault
        
        station_config = STATIONS.get(station_id, {})
        elevation = station_config.get("elevation_m", 0)
        
        # ── Run each pillar ──
        temporal_result = self.temporal.analyze(history, current_obs)
        
        physics_result = self.physics.analyze(
            temp_c=current_obs.get("temp_c", 25),
            pressure_hpa=current_obs.get("pressure_hpa", 1013),
            humidity_pct=current_obs.get("humidity_pct", 50),
            elevation_m=elevation,
        )
        
        spatial_result = self.spatial.analyze(
            station_id=station_id,
            current=current_obs,
            all_station_data=all_station_data,
        )
        
        multivariate_result = self.multivariate.analyze(
            temp_c=current_obs.get("temp_c", 25),
            pressure_hpa=current_obs.get("pressure_hpa", 1013),
            humidity_pct=current_obs.get("humidity_pct", 50),
            history=history,
        )
        
        # ── Weighted pillar synthesis ──
        pillar_scores = {
            "temporal": temporal_result["confidence_score"],
            "multivariate": multivariate_result["confidence_score"],
            "physics": physics_result["confidence_score"],
            "spatial": spatial_result["confidence_score"],
        }
        
        weighted_score = sum(
            pillar_scores[k] * PILLAR_WEIGHTS[k]
            for k in PILLAR_WEIGHTS
        )
        
        # ── Compute dual evidence scores ──
        S_anomaly = self._compute_anomaly_evidence(
            ml_result=ml_result,
            temporal_result=temporal_result,
            physics_result=physics_result,
            multivariate_result=multivariate_result,
            spatial_result=spatial_result,
        )
        
        S_event = self._compute_event_evidence(
            ml_result=ml_result,
            temporal_result=temporal_result,
            physics_result=physics_result,
            spatial_result=spatial_result,
            current_obs=current_obs,
            history=history,
        )
        
        # ── Classification logic using dual evidence ──
        quality = self._classify(
            S_anomaly=S_anomaly,
            S_event=S_event,
            weighted_score=weighted_score,
            ml_result=ml_result,
            temporal_result=temporal_result,
            physics_result=physics_result,
            spatial_result=spatial_result,
            multivariate_result=multivariate_result,
        )
        
        # ── Confidence ──
        confidence_pct = self._compute_confidence(
            S_anomaly, S_event, weighted_score, ml_result, quality
        )
        
        # ── Evidence text ──
        evidence = self._build_evidence(
            quality, S_anomaly, S_event,
            temporal_result, physics_result,
            spatial_result, multivariate_result, ml_result
        )
        
        # ── Corrected values if fault detected ──
        corrected_observation = None
        if quality in (QUALITY_SENSOR_FAULT, QUALITY_UNCERTAIN):
            from server.engine.imputation_engine import ImputationEngine
            imputer = ImputationEngine()
            corrected_observation = imputer.impute(
                current_obs=current_obs,
                history=history,
                spatial_data=all_station_data,
                station_id=station_id,
            )
        
        return {
            "quality": quality,
            "confidence_pct": round(confidence_pct, 1),
            "weighted_pillar_score": round(weighted_score, 1),
            "S_anomaly": round(S_anomaly, 4),
            "S_event": round(S_event, 4),
            "evidence_summary": evidence,
            "corrected_observation": corrected_observation,
            "pillars": {
                "temporal": temporal_result,
                "physics": physics_result,
                "spatial": spatial_result,
                "multivariate": multivariate_result,
            },
            "ml_ensemble": {
                "is_anomaly": ml_result.get("is_anomaly", False),
                "ensemble_score": ml_result.get("ensemble_score", 0),
                "severity": ml_result.get("severity", "NORMAL"),
                "vae_score": ml_result.get("vae_score", 0),
                "at_score": ml_result.get("at_score", 0),
                "if_score": ml_result.get("if_score", 0),
            },
        }
    
    def _check_data_communication_fault(self, current_obs: Dict) -> Optional[Dict]:
        """
        Check for missing/NaN data in the observation payload.
        Returns a full decision dict if fault detected, else None.
        """
        required_fields = ["temp_c", "pressure_hpa", "humidity_pct"]
        missing = []
        for field in required_fields:
            val = current_obs.get(field)
            if val is None:
                missing.append(field)
            elif isinstance(val, float) and math.isnan(val):
                missing.append(field)
        
        if not missing:
            return None
        
        return {
            "quality": QUALITY_DATA_COMM_FAULT,
            "confidence_pct": 99.0,
            "weighted_pillar_score": 0.0,
            "S_anomaly": 1.0,
            "S_event": 0.0,
            "evidence_summary": (
                f"⚠ Data communication fault: missing or NaN values in {', '.join(missing)}. "
                "Observation cannot be validated."
            ),
            "corrected_observation": None,
            "pillars": {},
            "ml_ensemble": {
                "is_anomaly": True,
                "ensemble_score": 1.0,
                "severity": "HIGH",
                "vae_score": 0, "at_score": 0, "if_score": 0,
            },
        }
    
    def _compute_anomaly_evidence(
        self,
        ml_result: Dict,
        temporal_result: Dict,
        physics_result: Dict,
        multivariate_result: Dict,
        spatial_result: Dict,
    ) -> float:
        """
        Compute S_anomaly: evidence that the observation system is faulty.
        
        Higher S_anomaly = stronger evidence of sensor/data fault.
        Uses max-of-signals approach (like V1) so that any single strong
        detector signal isn't diluted by averaging.
        
        Components:
          - ML ensemble anomaly score (strongest signal)
          - Pillar fault signals (temporal, physics, multivariate deviations)
        """
        signals = []
        
        # ML ensemble score is the primary anomaly signal
        ml_score = ml_result.get("ensemble_score", 0.0)
        signals.append(ml_score)
        
        # Temporal fault: convert confidence (100 = good) to fault signal (0-1)
        temporal_fault = max(0.0, (100.0 - temporal_result.get("confidence_score", 100.0)) / 100.0)
        # Hard signal for frozen/stuck sensors
        if temporal_result.get("status") == "sensor_fault":
            temporal_fault = max(temporal_fault, 0.85)
        signals.append(temporal_fault)
        
        # Physics violation
        physics_fault = max(0.0, (100.0 - physics_result.get("confidence_score", 100.0)) / 100.0)
        if physics_result.get("status") == "sensor_fault":
            physics_fault = max(physics_fault, 0.8)
        signals.append(physics_fault)
        
        # Multivariate deviation
        multi_fault = max(0.0, (100.0 - multivariate_result.get("confidence_score", 100.0)) / 100.0)
        signals.append(multi_fault)
        
        # Spatial contradiction: buddy stations disagree
        if spatial_result.get("status") == "sensor_fault":
            spatial_fault = max(0.0, (100.0 - spatial_result.get("confidence_score", 100.0)) / 100.0)
            spatial_fault = max(spatial_fault, 0.80)
            signals.append(spatial_fault)
        
        # S_anomaly = max of all signals (one strong detector is enough)
        S_anomaly = max(signals) if signals else 0.0
        
        return float(np.clip(S_anomaly, 0.0, 1.0))
    
    def _compute_event_evidence(
        self,
        ml_result: Dict,
        temporal_result: Dict,
        physics_result: Dict,
        spatial_result: Dict,
        current_obs: Dict,
        history: List[Dict],
    ) -> float:
        """
        Compute S_event: evidence that unusual weather is genuine.
        
        Higher S_event = stronger evidence of real weather event.
        
        Components:
          - Spatial buddy agreement (strongest signal — regional corroboration)
          - Physics consistency (unusual but physically plausible)
          - Temporal graduality (genuine events develop gradually, not as spikes)
        """
        S_event = 0.0
        
        # 1. Spatial buddy agreement (most powerful event evidence)
        # If buddy stations show similar anomalous readings, it's likely real
        if spatial_result.get("regional_event_detected", False):
            S_event += 0.50
        elif spatial_result.get("status") == "normal":
            # Even without regional event flag, normal spatial = some event support
            spatial_conf = spatial_result.get("confidence_score", 0.0)
            if spatial_conf >= 70:
                S_event += 0.25
        
        # 2. Physics consistency — genuine events are unusual but physically valid
        # If physics score is high (no violations) despite ML flagging anomaly,
        # the reading is likely genuine
        if ml_result.get("is_anomaly", False):
            physics_conf = physics_result.get("confidence_score", 0.0)
            if physics_conf >= 80 and physics_result.get("status") == "normal":
                S_event += 0.20
        
        # 3. Temporal graduality — genuine events develop over hours, not instantly
        if len(history) >= 3:
            temps = [r.get("temp_c", 0) for r in history[-3:]] + [current_obs.get("temp_c", 0)]
            if len(temps) >= 4:
                # 1-step and 3-step changes
                diff_1h = abs(temps[-1] - temps[-2])
                diff_3h = abs(temps[-1] - temps[0])
                
                # Genuine events: gradual multi-step change, not a spike
                # (large 3-step change but moderate 1-step change)
                if diff_3h > 2.0 and diff_1h <= 5.0:
                    S_event += 0.15
        
        return float(np.clip(S_event, 0.0, 1.0))
    
    def _classify(
        self,
        S_anomaly: float,
        S_event: float,
        weighted_score: float,
        ml_result: Dict,
        temporal_result: Dict,
        physics_result: Dict,
        spatial_result: Dict,
        multivariate_result: Dict,
    ) -> str:
        """
        Synthesize all evidence into final quality classification.
        
        Uses the V1 dual-evidence framework:
          - S_anomaly >= 0.5 AND S_event < 0.5   → SENSOR_FAULT
          - S_event >= 0.5 AND S_anomaly < 0.5    → GENUINE_EVENT
          - Both >= 0.5                            → Conflict resolution
          - Both < 0.5                             → NORMAL
        
        With additional hard overrides for physics violations and frozen sensors.
        """
        physics_status = physics_result.get("status", "normal")
        temporal_status = temporal_result.get("status", "normal")
        spatial_status = spatial_result.get("status", "uncertain")
        buddies_agree = spatial_result.get("regional_event_detected", False)
        
        # ── HARD OVERRIDE: Physics violations or frozen sensors ──
        # These are always sensor faults regardless of event evidence
        if temporal_status == "sensor_fault" and temporal_result.get("confidence_score", 100) <= 25:
            # Only hard-override for very clear temporal faults (e.g. frozen sensor)
            return QUALITY_SENSOR_FAULT
        
        if physics_status == "sensor_fault" and physics_result.get("confidence_score", 100) < 25:
            # Only hard-override for extreme physics violations (e.g. -100°C)
            return QUALITY_SENSOR_FAULT
        
        # ── DUAL EVIDENCE FRAMEWORK ──
        
        # Case 1: NORMAL — both scores low
        if S_anomaly < 0.4 and S_event < 0.5:
            if weighted_score >= 70:
                return QUALITY_NORMAL
            elif weighted_score >= 50:
                return QUALITY_NORMAL  # Mildly degraded but still acceptable
            else:
                return QUALITY_UNCERTAIN
        
        # Case 2: SENSOR_FAULT — high anomaly, low event evidence
        if S_anomaly >= 0.4 and S_event < 0.5:
            return QUALITY_SENSOR_FAULT
        
        # Case 3: GENUINE_EVENT — high event, low anomaly evidence
        if S_event >= 0.5 and S_anomaly < 0.4:
            return QUALITY_GENUINE_EVENT
        
        # Case 4: CONFLICT — both S_anomaly and S_event elevated
        if S_anomaly >= 0.4 and S_event >= 0.5:
            # Resolution: use spatial data as tiebreaker
            if buddies_agree:
                # Buddy stations corroborate
                # Distinguish ML false positive on normal baseline vs real event
                # Real events have temporal graduality, boosting S_event >= 0.80
                if S_event < 0.75:
                    return QUALITY_NORMAL
                return QUALITY_GENUINE_EVENT
            elif spatial_status == "sensor_fault":
                # Spatial contradiction → sensor fault
                return QUALITY_SENSOR_FAULT
            else:
                # Cannot resolve → flag for manual review
                return QUALITY_UNCERTAIN
        
        # Default fallback
        return QUALITY_UNCERTAIN
    
    def _compute_confidence(
        self, S_anomaly: float, S_event: float,
        weighted_score: float, ml_result: Dict, quality: str
    ) -> float:
        """Compute overall confidence percentage."""
        ml_confidence = ml_result.get("confidence_pct", 50)
        
        if quality == QUALITY_NORMAL:
            # High confidence when both anomaly and event evidence are low
            base = min(99.0, (weighted_score * 0.6 + ml_confidence * 0.4))
            # Boost confidence when S_anomaly is very low
            return min(99.0, base + (1 - S_anomaly) * 5)
        
        elif quality == QUALITY_SENSOR_FAULT:
            # Confidence scales with how clearly S_anomaly exceeds S_event
            separation = S_anomaly - S_event
            return min(99.0, max(60.0, 65 + separation * 30 + S_anomaly * 10))
        
        elif quality == QUALITY_GENUINE_EVENT:
            # Confidence scales with event evidence and spatial support
            return min(95.0, max(55.0, 55 + S_event * 25 + (1 - S_anomaly) * 10))
        
        elif quality == QUALITY_DATA_COMM_FAULT:
            return 99.0
        
        else:  # UNCERTAIN_REVIEW
            # Low confidence when evidence is conflicting
            conflict = abs(S_anomaly - S_event)
            return min(70.0, max(30.0, 35 + conflict * 20))
    
    def _build_evidence(
        self, quality: str, S_anomaly: float, S_event: float,
        temporal: Dict, physics: Dict, spatial: Dict,
        multivariate: Dict, ml_result: Dict,
    ) -> str:
        """Build human-readable evidence summary."""
        parts = []
        
        if quality == QUALITY_NORMAL:
            parts.append("All validation pillars confirm normal atmospheric conditions.")
            if not ml_result.get("is_anomaly"):
                parts.append("ML ensemble agrees — observation validated.")
            parts.append(f"S_anomaly={S_anomaly:.2f}, S_event={S_event:.2f}.")
        
        elif quality == QUALITY_SENSOR_FAULT:
            parts.append("⚠ Sensor fault detected.")
            parts.append(f"Anomaly evidence S_anomaly={S_anomaly:.2f} exceeds event evidence S_event={S_event:.2f}.")
            if temporal["status"] == "sensor_fault":
                parts.append(f"Temporal: {temporal['rationale']}")
            if physics["status"] == "sensor_fault":
                parts.append(f"Physics: {physics['rationale']}")
            if spatial["status"] == "sensor_fault":
                parts.append(f"Spatial: {spatial['rationale']}")
        
        elif quality == QUALITY_GENUINE_EVENT:
            parts.append("🌦 Genuine weather event detected.")
            parts.append(f"Event evidence S_event={S_event:.2f} confirms unusual but real atmospheric conditions.")
            if spatial.get("regional_event_detected"):
                parts.append(f"Confirmed by {spatial['metric_value']} buddy stations.")
            parts.append("Readings are anomalous but physically consistent and spatially corroborated.")
        
        elif quality == QUALITY_DATA_COMM_FAULT:
            parts.append("⚠ Data communication fault — missing or NaN values detected.")
        
        else:  # UNCERTAIN_REVIEW
            parts.append("⚡ Uncertain classification — conflicting evidence.")
            parts.append(f"S_anomaly={S_anomaly:.2f}, S_event={S_event:.2f} — both elevated.")
            parts.append("Recommend manual review or extended monitoring.")
        
        return " ".join(parts)
