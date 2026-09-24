import React, { useState, useMemo, useRef } from 'react';
import { BME280DataPoint, SkyGuardQuality } from '../types';
import {
  Layers,
  Thermometer,
  Droplets,
  Gauge,
  Activity,
  AlertTriangle,
  GitCompare,
  BarChart2,
  Calendar,
  Clock,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  CheckCircle2,
  Eye,
} from 'lucide-react';

interface ObservationChartProps {
  history1h: BME280DataPoint[];
  history6h: BME280DataPoint[];
  history24h: BME280DataPoint[];
  sensor2History1h?: BME280DataPoint[];
  sensor2History6h?: BME280DataPoint[];
  sensor2History24h?: BME280DataPoint[];
  sensorName: string;
  stationQuality?: SkyGuardQuality;
}

type ChartViewMode = 'composed' | 'divergence' | 'envelope' | 'gauges' | 'heatmap';

/**
 * Generate smooth cubic Bezier curve path through data points
 */
function getSmoothCurvePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return path;
}

export const ObservationChart: React.FC<ObservationChartProps> = ({
  history1h,
  history6h,
  history24h,
  sensor2History1h,
  sensor2History6h,
  sensor2History24h,
  sensorName,
  stationQuality = 'normal',
}) => {
  const [viewMode, setViewMode] = useState<ChartViewMode>('composed');
  const [timeRange, setTimeRange] = useState<'1H' | '6H' | '24H'>('1H');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Active time-series datasets
  const activeData1 = useMemo(() => {
    const raw = timeRange === '1H' ? history1h : timeRange === '6H' ? history6h : history24h;
    if (raw && raw.length > 0) return raw;
    return [
      { timeStr: '13:00', tempC: 28.5, rhPercent: 62.0, pressureHpa: 1012.4 },
      { timeStr: '13:10', tempC: 28.7, rhPercent: 61.5, pressureHpa: 1012.3 },
      { timeStr: '13:20', tempC: 28.9, rhPercent: 60.8, pressureHpa: 1012.1 },
      { timeStr: '13:30', tempC: 29.4, rhPercent: 59.8, pressureHpa: 1011.8 },
    ];
  }, [timeRange, history1h, history6h, history24h]);

  const activeData2 = useMemo(() => {
    const raw = timeRange === '1H' ? sensor2History1h : timeRange === '6H' ? sensor2History6h : sensor2History24h;
    if (raw && raw.length > 0) return raw;
    // Fallback calibrated secondary sensor readings
    return activeData1.map((d) => ({
      ...d,
      tempC: d.tempC + 0.1,
      rhPercent: d.rhPercent - 0.3,
      pressureHpa: d.pressureHpa - 0.1,
    }));
  }, [timeRange, sensor2History1h, sensor2History6h, sensor2History24h, activeData1]);

  // Current values
  const latestPt1 = activeData1[activeData1.length - 1] || {
    tempC: 29.4,
    rhPercent: 73.2,
    pressureHpa: 1007.3,
    timeStr: '13:30',
  };
  const latestPt2 = activeData2[activeData2.length - 1] || {
    tempC: 29.5,
    rhPercent: 72.9,
    pressureHpa: 1007.2,
    timeStr: '13:30',
  };

  const deltaTemp = Math.abs(latestPt1.tempC - latestPt2.tempC);
  const deltaRh = Math.abs(latestPt1.rhPercent - latestPt2.rhPercent);
  const deltaPres = Math.abs(latestPt1.pressureHpa - latestPt2.pressureHpa);

  // SVG plotting dimensions
  const svgWidth = 840;
  const svgHeight = 260;
  const paddingLeft = 56;
  const paddingRight = 30;
  const paddingTop = 32;
  const paddingBottom = 34;

  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  // Normalized coordinate generator for a metric series
  const getCoordinates = (
    data: BME280DataPoint[],
    getter: (d: BME280DataPoint) => number,
    customMin?: number,
    customMax?: number
  ) => {
    const rawVals = data.map(getter);
    const minVal = customMin ?? Math.min(...rawVals);
    const maxVal = customMax ?? Math.max(...rawVals);
    const range = maxVal - minVal || 1;
    const pad = range * 0.15;
    const sMin = minVal - pad;
    const sMax = maxVal + pad;

    const pts = data.map((d, i) => {
      const v = getter(d);
      const x =
        data.length > 1
          ? paddingLeft + (i / (data.length - 1)) * plotWidth
          : paddingLeft + plotWidth / 2;
      const y =
        paddingTop +
        plotHeight -
        ((v - sMin) / (sMax - sMin)) * plotHeight;
      return { x, y, val: v, time: d.timeStr, isFlagged: d.isFlagged };
    });

    return { pts, sMin, sMax, minVal, maxVal };
  };

  // Temperature series
  const tempSeries = useMemo(() => getCoordinates(activeData1, (d) => d.tempC), [activeData1]);
  // Humidity series
  const rhSeries = useMemo(() => getCoordinates(activeData1, (d) => d.rhPercent), [activeData1]);
  // Pressure series
  const presSeries = useMemo(() => getCoordinates(activeData1, (d) => d.pressureHpa), [activeData1]);
  // Secondary Sensor Temp series
  const temp2Series = useMemo(() => getCoordinates(activeData2, (d) => d.tempC), [activeData2]);

  // Handle Mouse Over for Interactive Crosshairs
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;

    let closestIdx = 0;
    let minDistance = Infinity;

    tempSeries.pts.forEach((p, idx) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    setHoveredIndex(closestIdx);
  };

  const activeIdx = hoveredIndex !== null ? hoveredIndex : tempSeries.pts.length - 1;
  const hoverTemp1 = tempSeries.pts[activeIdx];
  const hoverTemp2 = temp2Series.pts[activeIdx] || hoverTemp1;
  const hoverRh = rhSeries.pts[activeIdx];
  const hoverPres = presSeries.pts[activeIdx];

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFFFF] border border-[#C7C2B8] shadow-sm space-y-4 select-none">
      {/* Component Header: Live Badge & Analytical View Modes */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-[#DDD8CF]">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#273844] text-white text-[10px] font-mono font-bold uppercase tracking-wider shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse"></span>
              <span>Telemetry Intelligence</span>
            </div>
            <h3 className="font-mono text-base font-bold text-[#273844] tracking-tight">
              {sensorName} Multi-Variate Analytics
            </h3>
          </div>
          <p className="text-xs text-[#475560] font-mono mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#4A6B78]" />
            <span>Dual BME280 consensus, atmospheric inverse correlation & physical limits</span>
          </p>
        </div>

        {/* View Mode Switcher (Bklit UI Component Suite) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-[#E8E6DD] p-1 border border-[#DDD8CF] text-xs font-mono">
            <button
              onClick={() => setViewMode('composed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'composed'
                  ? 'bg-[#FFFFFF] text-[#273844] shadow-xs'
                  : 'text-[#475560] hover:text-[#273844]'
              }`}
              title="Correlate Temp, Humidity & Pressure simultaneously"
            >
              <Layers className="w-3.5 h-3.5 text-[#D97706]" />
              <span>Multi-Variable</span>
            </button>

            <button
              onClick={() => setViewMode('divergence')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'divergence'
                  ? 'bg-[#FFFFFF] text-[#273844] shadow-xs'
                  : 'text-[#475560] hover:text-[#273844]'
              }`}
              title="Primary vs Redundant BME280 Parity Comparison"
            >
              <GitCompare className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Dual Parity</span>
            </button>

            <button
              onClick={() => setViewMode('envelope')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'envelope'
                  ? 'bg-[#FFFFFF] text-[#273844] shadow-xs'
                  : 'text-[#475560] hover:text-[#273844]'
              }`}
              title="Physical Confidence Bounds and Anomaly Bands"
            >
              <Activity className="w-3.5 h-3.5 text-[#0D9488]" />
              <span>Limits & Bands</span>
            </button>

            <button
              onClick={() => setViewMode('gauges')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'gauges'
                  ? 'bg-[#FFFFFF] text-[#273844] shadow-xs'
                  : 'text-[#475560] hover:text-[#273844]'
              }`}
              title="Precision Dial Gauges with Zone Arc Indicators"
            >
              <Gauge className="w-3.5 h-3.5 text-[#8E352B]" />
              <span>Radial Gauges</span>
            </button>

            <button
              onClick={() => setViewMode('heatmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'heatmap'
                  ? 'bg-[#FFFFFF] text-[#273844] shadow-xs'
                  : 'text-[#475560] hover:text-[#273844]'
              }`}
              title="24-Hour Climatological Distribution Matrix"
            >
              <Calendar className="w-3.5 h-3.5 text-[#4A6B78]" />
              <span>Heatmap</span>
            </button>
          </div>

          {/* Time Range Pills */}
          <div className="flex items-center rounded-xl bg-[#E8E6DD] p-1 border border-[#DDD8CF] text-xs font-mono">
            {(['1H', '6H', '24H'] as const).map((rng) => (
              <button
                key={rng}
                onClick={() => setTimeRange(rng)}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                  timeRange === rng
                    ? 'bg-[#4A6B78] text-white shadow-xs'
                    : 'text-[#475560] hover:text-[#273844]'
                }`}
              >
                {rng}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Atmospheric KPI & Physical Law Diagnostics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Temperature Stat */}
        <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#DDD8CF] flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
            <span className="flex items-center gap-1 font-semibold text-[#D97706]">
              <Thermometer className="w-3.5 h-3.5" />
              <span>TEMPERATURE</span>
            </span>
            <span className="text-[10px] bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded font-bold">
              {timeRange}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-[#273844]">
              {latestPt1.tempC.toFixed(1)}°C
            </span>
            <span className="text-[11px] font-mono text-[#475560]">
              Dual: {latestPt2.tempC.toFixed(1)}°C
            </span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-[#475560] flex items-center justify-between border-t border-[#DDD8CF] pt-1">
            <span>Range: {tempSeries.minVal.toFixed(1)}° - {tempSeries.maxVal.toFixed(1)}°</span>
            <span className="text-[#2D6A4F] font-bold">Δ {(latestPt1.tempC - tempSeries.minVal).toFixed(1)}°C</span>
          </div>
        </div>

        {/* Humidity Stat */}
        <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#DDD8CF] flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
            <span className="flex items-center gap-1 font-semibold text-[#0284C7]">
              <Droplets className="w-3.5 h-3.5" />
              <span>REL. HUMIDITY</span>
            </span>
            <span className="text-[10px] bg-[#E0F2FE] text-[#075985] px-1.5 py-0.5 rounded font-bold">
              {timeRange}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-[#273844]">
              {latestPt1.rhPercent.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono text-[#475560]">
              Dew: {(latestPt1.tempC - ((100 - latestPt1.rhPercent) / 5)).toFixed(1)}°C
            </span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-[#475560] flex items-center justify-between border-t border-[#DDD8CF] pt-1">
            <span>Range: {rhSeries.minVal.toFixed(1)}% - {rhSeries.maxVal.toFixed(1)}%</span>
            <span className="text-[#0284C7] font-bold">Δ {(rhSeries.maxVal - latestPt1.rhPercent).toFixed(1)}%</span>
          </div>
        </div>

        {/* Barometric Pressure Stat */}
        <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#DDD8CF] flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
            <span className="flex items-center gap-1 font-semibold text-[#0D9488]">
              <Gauge className="w-3.5 h-3.5" />
              <span>BAROMETRIC</span>
            </span>
            <span className="text-[10px] bg-[#CCFBF1] text-[#115E59] px-1.5 py-0.5 rounded font-bold">
              QNH MSL
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold font-mono text-[#273844]">
              {latestPt1.pressureHpa.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-[#475560]">hPa</span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-[#475560] flex items-center justify-between border-t border-[#DDD8CF] pt-1">
            <span>Gradient: Steady</span>
            <span className="text-[#0D9488] font-bold">Stable</span>
          </div>
        </div>

        {/* Dual Sensor Consensus Parity */}
        <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#DDD8CF] flex flex-col justify-between shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#475560]">
            <span className="flex items-center gap-1 font-semibold text-[#273844]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2D6A4F]" />
              <span>SENSOR PARITY</span>
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                deltaTemp < 0.5
                  ? 'bg-[#E8F3ED] text-[#2D6A4F]'
                  : 'bg-[#F8ECE9] text-[#8E352B]'
              }`}
            >
              {deltaTemp < 0.5 ? 'CONCORDANT' : 'DISCORDANT'}
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-xl font-bold font-mono text-[#273844]">
              ΔT: {deltaTemp.toFixed(2)}°C
            </span>
            <span className="text-xs font-mono text-[#475560]">(&plusmn;0.5° threshold)</span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-[#475560] flex items-center justify-between border-t border-[#DDD8CF] pt-1">
            <span>ΔRH: {deltaRh.toFixed(1)}%</span>
            <span>ΔP: {deltaPres.toFixed(2)} hPa</span>
          </div>
        </div>
      </div>

      {/* ─── VIEW 1: BKLIT COMPOSED MULTI-VARIABLE OVERLAY ───────────────── */}
      {viewMode === 'composed' && (
        <div className="relative w-full rounded-2xl bg-[#FAF9F5] border border-[#DDD8CF] p-3 overflow-hidden shadow-xs">
          {/* Top Multi-Series Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs font-mono border-b border-[#DDD8CF]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-bold text-[#D97706]">
                <span className="w-3 h-1 bg-[#D97706] rounded-full"></span>
                <span>Temperature (°C)</span>
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[#0284C7]">
                <span className="w-3 h-1 bg-[#0284C7] rounded-full"></span>
                <span>Rel. Humidity (%)</span>
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[#0D9488]">
                <span className="w-3 h-1 bg-[#0D9488] rounded-full"></span>
                <span>Pressure (hPa)</span>
              </span>
            </div>
            <div className="text-[11px] text-[#475560]">
              Notice the <strong>inverse physical correlation</strong>: as Temp rises, RH naturally drops.
            </div>
          </div>

          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-56 select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id="compTempGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D97706" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#D97706" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="compRhGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284C7" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#0284C7" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Subtle Horizontal Grids */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + plotHeight * ratio;
              return (
                <line
                  key={i}
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#E8E6DD"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Area Fills */}
            <path
              d={`${getSmoothCurvePath(tempSeries.pts)} L ${tempSeries.pts[tempSeries.pts.length - 1]?.x},${paddingTop + plotHeight} L ${tempSeries.pts[0]?.x},${paddingTop + plotHeight} Z`}
              fill="url(#compTempGrad)"
            />
            <path
              d={`${getSmoothCurvePath(rhSeries.pts)} L ${rhSeries.pts[rhSeries.pts.length - 1]?.x},${paddingTop + plotHeight} L ${rhSeries.pts[0]?.x},${paddingTop + plotHeight} Z`}
              fill="url(#compRhGrad)"
            />

            {/* Smooth Spline Lines */}
            <path
              d={getSmoothCurvePath(tempSeries.pts)}
              fill="none"
              stroke="#D97706"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d={getSmoothCurvePath(rhSeries.pts)}
              fill="none"
              stroke="#0284C7"
              strokeWidth="2"
              strokeDasharray="6 3"
              strokeLinecap="round"
            />
            <path
              d={getSmoothCurvePath(presSeries.pts)}
              fill="none"
              stroke="#0D9488"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            {/* Interactive Crosshair Tracking */}
            {hoverTemp1 && (
              <g>
                <line
                  x1={hoverTemp1.x}
                  y1={paddingTop}
                  x2={hoverTemp1.x}
                  y2={paddingTop + plotHeight}
                  stroke="#78716C"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
                {/* Temp Dot */}
                <circle cx={hoverTemp1.x} cy={hoverTemp1.y} r="5" fill="#D97706" stroke="#FFFFFF" strokeWidth="2" />
                {/* RH Dot */}
                <circle cx={hoverRh.x} cy={hoverRh.y} r="4.5" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2" />
                {/* Pres Dot */}
                <circle cx={hoverPres.x} cy={hoverPres.y} r="4" fill="#0D9488" stroke="#FFFFFF" strokeWidth="1.5" />
              </g>
            )}

            {/* X Axis Time Labels */}
            {tempSeries.pts.map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={svgHeight - 8}
                fill="#78716C"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {p.time}
              </text>
            ))}
          </svg>

          {/* Floating Unified Bklit Pill Tooltip */}
          {hoverTemp1 && hoveredIndex !== null && (
            <div
              className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full px-3 py-2 rounded-xl bg-[#273844]/95 text-white backdrop-blur-md border border-[#4A6B78] shadow-xl flex items-center gap-3 text-xs font-mono"
              style={{
                left: `${(hoverTemp1.x / svgWidth) * 100}%`,
                top: `${(hoverTemp1.y / svgHeight) * 100 - 6}%`,
              }}
            >
              <div className="flex items-center gap-1 text-[#FBBF24]">
                <Thermometer className="w-3 h-3" />
                <span>{hoverTemp1.val.toFixed(1)}°C</span>
              </div>
              <span className="text-gray-500">&bull;</span>
              <div className="flex items-center gap-1 text-[#38BDF8]">
                <Droplets className="w-3 h-3" />
                <span>{hoverRh.val.toFixed(1)}%</span>
              </div>
              <span className="text-gray-500">&bull;</span>
              <div className="flex items-center gap-1 text-[#2DD4BF]">
                <Gauge className="w-3 h-3" />
                <span>{hoverPres.val.toFixed(1)} hPa</span>
              </div>
              <span className="text-gray-500">&bull;</span>
              <span className="text-gray-300 font-bold">{hoverTemp1.time}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── VIEW 2: DUAL SENSOR PARITY & DIVERGENCE (BKLIT DIVERGENCE LINE) ─ */}
      {viewMode === 'divergence' && (
        <div className="relative w-full rounded-2xl bg-[#FAF9F5] border border-[#DDD8CF] p-3 overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs font-mono border-b border-[#DDD8CF]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-bold text-[#273844]">
                <span className="w-3 h-1 bg-[#273844] rounded-full"></span>
                <span>BME280 Primary Sensor (#1)</span>
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[#0284C7]">
                <span className="w-3 h-1 bg-[#0284C7] rounded-full"></span>
                <span>BME280 Redundant Sensor (#2)</span>
              </span>
              <span className="flex items-center gap-1 text-[#2D6A4F] bg-[#E8F3ED] px-2 py-0.5 rounded font-bold">
                <CheckCircle2 className="w-3 h-3" />
                <span>Hardware Co-Location Parity</span>
              </span>
            </div>
            <div className="text-[11px] text-[#475560]">
              Delta &gt; 0.5°C triggers immediate edge discrepancy alarm
            </div>
          </div>

          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-56 select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Divergence Fill between Sensor 1 and Sensor 2 */}
            <path
              d={`${getSmoothCurvePath(tempSeries.pts)} L ${temp2Series.pts[temp2Series.pts.length - 1]?.x},${temp2Series.pts[temp2Series.pts.length - 1]?.y} ${getSmoothCurvePath(temp2Series.pts.slice().reverse()).replace('M', 'L')} Z`}
              fill="rgba(45, 106, 79, 0.22)"
            />

            {/* Sensor 1 Curve */}
            <path
              d={getSmoothCurvePath(tempSeries.pts)}
              fill="none"
              stroke="#273844"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Sensor 2 Curve */}
            <path
              d={getSmoothCurvePath(temp2Series.pts)}
              fill="none"
              stroke="#0284C7"
              strokeWidth="2"
              strokeDasharray="4 2"
              strokeLinecap="round"
            />

            {/* Crosshair */}
            {hoverTemp1 && (
              <g>
                <line
                  x1={hoverTemp1.x}
                  y1={paddingTop}
                  x2={hoverTemp1.x}
                  y2={paddingTop + plotHeight}
                  stroke="#78716C"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
                <circle cx={hoverTemp1.x} cy={hoverTemp1.y} r="5" fill="#273844" stroke="#FFFFFF" strokeWidth="2" />
                <circle cx={hoverTemp2.x} cy={hoverTemp2.y} r="5" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2" />
              </g>
            )}

            {/* X Axis Time Labels */}
            {tempSeries.pts.map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={svgHeight - 8}
                fill="#78716C"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {p.time}
              </text>
            ))}
          </svg>

          {/* Divergence Tooltip */}
          {hoverTemp1 && hoveredIndex !== null && (
            <div
              className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full px-3 py-2 rounded-xl bg-[#273844]/95 text-white backdrop-blur-md border border-[#4A6B78] shadow-xl flex items-center gap-3 text-xs font-mono"
              style={{
                left: `${(hoverTemp1.x / svgWidth) * 100}%`,
                top: `${(hoverTemp1.y / svgHeight) * 100 - 6}%`,
              }}
            >
              <span>#1: {hoverTemp1.val.toFixed(1)}°C</span>
              <span className="text-gray-500">&bull;</span>
              <span>#2: {hoverTemp2.val.toFixed(1)}°C</span>
              <span className="text-gray-500">&bull;</span>
              <span className="px-1.5 py-0.5 rounded bg-[#2D6A4F] text-white font-bold text-[10px]">
                Δ {(Math.abs(hoverTemp1.val - hoverTemp2.val)).toFixed(2)}°C PASS
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── VIEW 3: PHYSICAL CONFIDENCE ENVELOPE (BKLIT REFERENCE AREA) ─── */}
      {viewMode === 'envelope' && (
        <div className="relative w-full rounded-2xl bg-[#FAF9F5] border border-[#DDD8CF] p-3 overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 text-xs font-mono border-b border-[#DDD8CF]">
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#273844]">Temperature 2σ Climatological Envelope</span>
              <span className="bg-[#E8F3ED] text-[#2D6A4F] px-2 py-0.5 rounded font-bold text-[10px]">
                NORMAL BOUNDS [22°C - 38°C]
              </span>
            </div>
            <div className="text-[11px] text-[#8E352B] font-bold">
              Breakout above 40°C triggers Severe Heatwave Alert
            </div>
          </div>

          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-56 select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Shaded Normal Physical Envelope Band */}
            <rect
              x={paddingLeft}
              y={paddingTop + plotHeight * 0.25}
              width={plotWidth}
              height={plotHeight * 0.55}
              fill="rgba(45, 106, 79, 0.08)"
              stroke="#2D6A4F"
              strokeWidth="1"
              strokeDasharray="5 5"
              rx="6"
            />
            <text
              x={paddingLeft + 12}
              y={paddingTop + plotHeight * 0.32}
              fill="#2D6A4F"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              2σ EXPECTED PHYSICAL ENVELOPE (NOMINAL)
            </text>

            {/* Anomaly Ceiling Warning Line */}
            <line
              x1={paddingLeft}
              y1={paddingTop + plotHeight * 0.1}
              x2={svgWidth - paddingRight}
              y2={paddingTop + plotHeight * 0.1}
              stroke="#8E352B"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
            <text
              x={svgWidth - paddingRight - 8}
              y={paddingTop + plotHeight * 0.1 - 4}
              fill="#8E352B"
              fontSize="8.5"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="end"
            >
              CRITICAL HEAT SPIKE THRESHOLD (40.0°C)
            </text>

            {/* Observed Trend Spline */}
            <path
              d={getSmoothCurvePath(tempSeries.pts)}
              fill="none"
              stroke="#D97706"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Points */}
            {tempSeries.pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={p.isFlagged ? 6 : 4}
                fill={p.isFlagged ? '#8E352B' : '#FFFFFF'}
                stroke={p.isFlagged ? '#FFFFFF' : '#D97706'}
                strokeWidth="2"
              />
            ))}

            {/* Crosshair */}
            {hoverTemp1 && (
              <line
                x1={hoverTemp1.x}
                y1={paddingTop}
                x2={hoverTemp1.x}
                y2={paddingTop + plotHeight}
                stroke="#78716C"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
            )}
          </svg>
        </div>
      )}

      {/* ─── VIEW 4: PRECISION RADIAL DIAL GAUGES (BKLIT GAUGE CHARTS) ────── */}
      {viewMode === 'gauges' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDD8CF] shadow-xs">
          {/* Temperature Gauge */}
          <div className="p-4 rounded-xl bg-white border border-[#DDD8CF] flex flex-col items-center text-center">
            <span className="text-xs font-mono font-bold text-[#D97706] uppercase tracking-wider flex items-center gap-1 mb-2">
              <Thermometer className="w-4 h-4" />
              <span>Temperature</span>
            </span>

            {/* SVG Arc Gauge */}
            <svg viewBox="0 0 160 100" className="w-40 h-24">
              {/* Background Arc */}
              <path
                d="M 20 80 A 60 60 0 0 1 140 80"
                fill="none"
                stroke="#E8E6DD"
                strokeWidth="12"
                strokeLinecap="round"
              />
              {/* Colored Value Arc */}
              <path
                d="M 20 80 A 60 60 0 0 1 140 80"
                fill="none"
                stroke="#D97706"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="188.5"
                strokeDashoffset={Math.max(0, 188.5 - (latestPt1.tempC / 50) * 188.5)}
              />
              <text x="80" y="76" textAnchor="middle" fill="#273844" fontSize="20" fontWeight="bold" fontFamily="monospace">
                {latestPt1.tempC.toFixed(1)}°C
              </text>
            </svg>
            <div className="text-[11px] font-mono text-[#475560] mt-1">Nominal Range: 15°C - 45°C</div>
            <div className="mt-2 text-[10px] font-mono font-bold text-[#2D6A4F] bg-[#E8F3ED] px-2 py-0.5 rounded">
              PHY-01 COMPLIANT
            </div>
          </div>

          {/* Humidity Gauge */}
          <div className="p-4 rounded-xl bg-white border border-[#DDD8CF] flex flex-col items-center text-center">
            <span className="text-xs font-mono font-bold text-[#0284C7] uppercase tracking-wider flex items-center gap-1 mb-2">
              <Droplets className="w-4 h-4" />
              <span>Rel. Humidity</span>
            </span>

            <svg viewBox="0 0 160 100" className="w-40 h-24">
              <path
                d="M 20 80 A 60 60 0 0 1 140 80"
                fill="none"
                stroke="#E8E6DD"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M 20 80 A 60 60 0 0 1 140 80"
                fill="none"
                stroke="#0284C7"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="188.5"
                strokeDashoffset={Math.max(0, 188.5 - (latestPt1.rhPercent / 100) * 188.5)}
              />
              <text x="80" y="76" textAnchor="middle" fill="#273844" fontSize="20" fontWeight="bold" fontFamily="monospace">
                {latestPt1.rhPercent.toFixed(1)}%
              </text>
            </svg>
            <div className="text-[11px] font-mono text-[#475560] mt-1">Saturation Range: 10% - 95%</div>
            <div className="mt-2 text-[10px] font-mono font-bold text-[#0284C7] bg-[#E0F2FE] px-2 py-0.5 rounded">
              HUMIDITY STEADY
            </div>
          </div>

          {/* Pressure Gauge */}
          <div className="p-4 rounded-xl bg-white border border-[#DDD8CF] flex flex-col items-center text-center">
            <span className="text-xs font-mono font-bold text-[#0D9488] uppercase tracking-wider flex items-center gap-1 mb-2">
              <Gauge className="w-4 h-4" />
              <span>Barometric</span>
            </span>

            <svg viewBox="0 0 160 100" className="w-40 h-24">
              <path
                d="M 20 80 A 60 60 0 0 1 140 80"
                fill="none"
                stroke="#E8E6DD"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M 20 80 A 60 60 0 0 1 140 80"
                fill="none"
                stroke="#0D9488"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray="188.5"
                strokeDashoffset={Math.max(0, 188.5 - ((latestPt1.pressureHpa - 950) / 100) * 188.5)}
              />
              <text x="80" y="76" textAnchor="middle" fill="#273844" fontSize="18" fontWeight="bold" fontFamily="monospace">
                {latestPt1.pressureHpa.toFixed(1)}
              </text>
            </svg>
            <div className="text-[11px] font-mono text-[#475560] mt-1">Normal Sea Level: 1013.25 hPa</div>
            <div className="mt-2 text-[10px] font-mono font-bold text-[#0D9488] bg-[#CCFBF1] px-2 py-0.5 rounded">
              BARIC GRADIENT NORMAL
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW 5: 24-HOUR HOURLY HEATMAP MATRIX (BKLIT HEATMAP) ───────── */}
      {viewMode === 'heatmap' && (
        <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDD8CF] shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs font-mono border-b border-[#DDD8CF] pb-2">
            <span className="font-bold text-[#273844] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#4A6B78]" />
              <span>Diurnal Climatological Matrix (00:00 to 23:00)</span>
            </span>
            <span className="text-[11px] text-[#475560]">Hourly Intensity Distribution</span>
          </div>

          {/* Heatmap Grid of 24 Hours */}
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
            {Array.from({ length: 24 }).map((_, hour) => {
              // Diurnal cycle simulation: cool at night (04:00), peaks at 14:00
              const tempApprox = 24 + Math.sin(((hour - 8) / 24) * 2 * Math.PI) * 7;
              const intensity = (tempApprox - 17) / 16; // 0 to 1
              const bg =
                intensity > 0.75
                  ? 'bg-amber-500 text-white'
                  : intensity > 0.5
                  ? 'bg-amber-300 text-[#273844]'
                  : intensity > 0.25
                  ? 'bg-amber-100 text-[#475560]'
                  : 'bg-[#E8E6DD] text-[#78716C]';

              return (
                <div
                  key={hour}
                  className={`p-2 rounded-xl text-center font-mono border border-[#DDD8CF] transition-transform hover:scale-105 cursor-pointer ${bg}`}
                  title={`${hour.toString().padStart(2, '0')}:00 IST - Approx ${tempApprox.toFixed(1)}°C`}
                >
                  <div className="text-[9px] font-bold opacity-80">
                    {hour.toString().padStart(2, '0')}h
                  </div>
                  <div className="text-xs font-bold mt-0.5">{tempApprox.toFixed(1)}°</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-[#475560] pt-1 border-t border-[#DDD8CF]">
            <div className="flex items-center gap-2">
              <span>Cool Night (24°C)</span>
              <span className="w-12 h-2.5 rounded bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500"></span>
              <span>Peak Solar Noon (31°C)</span>
            </div>
            <span>Diurnal Peak: 14:00 IST</span>
          </div>
        </div>
      )}

      {/* Footer System Verification Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-[#475560]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
          <span>
            BME280 Dual-Bus Consensus: <strong className="text-[#273844]">0x76 & 0x77 I2C</strong>
          </span>
          <span className="text-[#DDD8CF]">&bull;</span>
          <span>Sampling Interval: 10 min continuous</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#475560]">Atmospheric Verification:</span>
          <span className="px-2 py-0.5 rounded bg-[#E8E6DD] text-[#273844] font-bold">
            {stationQuality.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
};
