import React, { useEffect, useRef, useMemo } from 'react';

export interface NeuralFlashProps {
  /** Animation speed multiplier */
  speed?: number;
  /** Number of folding iterations (detail level) */
  iterations?: number;
  /** Coordinate scale factor */
  scale?: number;
  /** Radial reach of the filament field */
  radius?: number;
  /** Softness of the outer boundary falloff */
  edgeSoftness?: number;
  /** Filament line and energy intensity */
  intensity?: number;
  /** Contrast power curve applied to filaments */
  contrast?: number;
  /** Electrical pulse / flicker amplitude */
  flicker?: number;
  /** Sub-octave harmonic complexity */
  complexity?: number;
  /** Spatial displacement and distortion turbulence */
  turbulence?: number;
  /** Spiral and rotational angular twist */
  twist?: number;
  /** Spatial frequency / density of the filaments */
  density?: number;
  /** Primary filament glow color (Hex or RGB) */
  color?: string;
  /** Core / peak filament hot color (Hex or RGB) */
  hotColor?: string;
  /** Canvas backdrop color (Hex or RGB, or 'transparent') */
  background?: string;
  /** Master opacity (0.0 to 1.0) */
  opacity?: number;
  /** Interactive pointer push / distortion */
  cursorInteraction?: boolean;
  /** Pause animation loop */
  paused?: boolean;
  /** Device pixel ratio cap */
  dpr?: number;
  /** Optional className for outer container */
  className?: string;
  /** Content layered above the neural shader */
  children?: React.ReactNode;
}

// Color parser utility
function hexToRgb(colorStr: string): [number, number, number] {
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const num = parseInt(hex, 16);
    if (!isNaN(num)) {
      return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
    }
  } else if (colorStr.startsWith('rgb')) {
    const matches = colorStr.match(/\d+/g);
    if (matches && matches.length >= 3) {
      return [
        parseInt(matches[0], 10) / 255,
        parseInt(matches[1], 10) / 255,
        parseInt(matches[2], 10) / 255,
      ];
    }
  }
  return [0.137, 0.286, 0.251]; // Default #234940
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_speed;
uniform float u_scale;
uniform float u_radius;
uniform float u_edgeSoftness;
uniform float u_intensity;
uniform float u_contrast;
uniform float u_flicker;
uniform float u_complexity;
uniform float u_turbulence;
uniform float u_twist;
uniform float u_density;
uniform vec3 u_color;
uniform vec3 u_hotColor;
uniform vec3 u_background;
uniform float u_opacity;
uniform bool u_cursorInteraction;
uniform int u_iterations;

mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = rot2(0.37);
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.0;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
    float r = length(st);
    
    // Boundary radial mask
    float edgeMask = 1.0 - smoothstep(max(0.01, u_radius * (1.0 - u_edgeSoftness * 0.75)), u_radius, r);
    
    float t = u_time * u_speed;
    float flickerMod = 1.0 + (sin(t * 14.0) * cos(t * 22.0) + sin(t * 31.0) * 0.5) * (u_flicker * 0.35);
    
    // Scaled & twisted coordinates
    vec2 p = st * (1.0 / max(0.01, u_scale * 1.2));
    float spiral = r * u_twist * 0.75 + t * 0.12;
    p = rot2(spiral) * p;
    
    // Pointer repulsion
    if (u_cursorInteraction) {
        vec2 m = (u_mouse - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
        vec2 d = p - m * (1.0 / max(0.01, u_scale * 1.2));
        float mDist = length(d);
        if (mDist < 0.75) {
            p += normalize(d) * ((0.75 - mDist) * 0.2);
        }
    }
    
    // Domain warping: stage 1
    vec2 q = vec2(
        fbm(p * (u_density * 0.6) + vec2(0.0, 0.0) + t * 0.25),
        fbm(p * (u_density * 0.6) + vec2(5.2, 1.3) - t * 0.22)
    );
    
    // Domain warping: stage 2
    vec2 warp = p + (q - 0.5) * (u_turbulence * 1.3);
    warp = rot2(t * 0.08 + (q.x - 0.5) * (u_twist * 0.8)) * warp;
    
    vec2 r_warp = vec2(
        fbm(warp * (u_density * 0.75) + 3.5 * q + vec2(1.7, 9.2) + t * 0.18),
        fbm(warp * (u_density * 0.75) + 3.5 * q + vec2(8.3, 2.8) - t * 0.14)
    );
    
    vec2 finalCoord = p + (r_warp - 0.5) * (u_turbulence * 1.6);
    
    // Central energy envelope: concentrates dark filaments into organic neural synapse
    float centerEnvelope = exp(-r * r * 4.2);
    float outerEnvelope = exp(-r * 1.5);
    
    // Primary diagonal synaptic lightning trunk
    float trunkDist = abs(finalCoord.y - finalCoord.x * 0.75 + (q.x - 0.5) * 0.85);
    float mainVein = exp(-trunkDist * (14.0 / max(0.1, u_intensity * 0.45)));
    mainVein = pow(clamp(mainVein, 0.0, 1.0), max(1.0, u_contrast * 0.85));
    
    // Secondary branching neural filaments
    float filament1 = abs(sin(finalCoord.x * u_density * 2.2 + finalCoord.y * u_density * 1.6 + t * 0.35));
    float filament2 = abs(cos(finalCoord.y * u_density * 2.0 - finalCoord.x * u_density * 1.4 - t * 0.28));
    float ridgeDist = min(filament1, filament2);
    float sideVeins = exp(-ridgeDist * (18.0 / max(0.1, u_intensity * 0.5)));
    sideVeins = pow(clamp(sideVeins, 0.0, 1.0), max(1.0, u_contrast));
    
    // Total filament intensity in the center
    float totalFilament = max(mainVein, sideVeins * 0.75) * centerEnvelope * (u_intensity * 0.55) * flickerMod;
    totalFilament = clamp(totalFilament, 0.0, 1.0);
    
    // Soft ambient pine teal haze surrounding the neural core
    float cloudHaze = smoothstep(0.2, 0.85, (r_warp.x + r_warp.y) * 0.5) * centerEnvelope * 0.55;
    
    // Delicate peripheral spark nodes along faint outer orbital waves
    float orbital = sin(r * 14.0 * (u_density * 0.45) - t * 0.5);
    float nodes = pow(clamp(orbital, 0.0, 1.0), 18.0) * noise(st * 14.0) * outerEnvelope * (1.0 - centerEnvelope) * 0.35;
    
    totalFilament *= edgeMask;
    cloudHaze *= edgeMask;
    nodes *= edgeMask;
    
    // Color composition:
    // Base: Clean bright white canvas (u_background)
    vec3 col = u_background;
    
    // 1. Soft pine teal cloud in center (#234940)
    col = mix(col, u_color, cloudHaze);
    
    // 2. Filament teal boundary (#234940)
    col = mix(col, u_color, smoothstep(0.06, 0.45, totalFilament));
    
    // 3. Deep black synaptic core veins (#000000)
    col = mix(col, u_hotColor, smoothstep(0.38, 0.88, totalFilament));
    
    // 4. Subtle peripheral nodes
    col = mix(col, u_hotColor, clamp(nodes, 0.0, 0.5));
    
    gl_FragColor = vec4(col, u_opacity);
}
`;

export function NeuralFlash({
  speed = 0.55,
  iterations = 24,
  scale = 0.55,
  radius = 2.0,
  edgeSoftness = 0.95,
  intensity = 3.0,
  contrast = 4.0,
  flicker = 0.13,
  complexity = 0.0,
  turbulence = 1.8,
  twist = 2.0,
  density = 2.45,
  color = '#234940',
  hotColor = '#000000',
  background = '#ffffff',
  opacity = 1.0,
  cursorInteraction = false,
  paused = false,
  dpr = 1.5,
  className = '',
  children,
}: NeuralFlashProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animFrameIdRef = useRef<number | null>(null);

  const colorRgb = useMemo(() => hexToRgb(color), [color]);
  const hotColorRgb = useMemo(() => hexToRgb(hotColor), [hotColor]);
  const backgroundRgb = useMemo(() => hexToRgb(background), [background]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const uTimeLoc = gl.getUniformLocation(program, 'u_time');
    const uMouseLoc = gl.getUniformLocation(program, 'u_mouse');
    const uSpeedLoc = gl.getUniformLocation(program, 'u_speed');
    const uScaleLoc = gl.getUniformLocation(program, 'u_scale');
    const uRadiusLoc = gl.getUniformLocation(program, 'u_radius');
    const uEdgeSoftnessLoc = gl.getUniformLocation(program, 'u_edgeSoftness');
    const uIntensityLoc = gl.getUniformLocation(program, 'u_intensity');
    const uContrastLoc = gl.getUniformLocation(program, 'u_contrast');
    const uFlickerLoc = gl.getUniformLocation(program, 'u_flicker');
    const uComplexityLoc = gl.getUniformLocation(program, 'u_complexity');
    const uTurbulenceLoc = gl.getUniformLocation(program, 'u_turbulence');
    const uTwistLoc = gl.getUniformLocation(program, 'u_twist');
    const uDensityLoc = gl.getUniformLocation(program, 'u_density');
    const uColorLoc = gl.getUniformLocation(program, 'u_color');
    const uHotColorLoc = gl.getUniformLocation(program, 'u_hotColor');
    const uBackgroundLoc = gl.getUniformLocation(program, 'u_background');
    const uOpacityLoc = gl.getUniformLocation(program, 'u_opacity');
    const uCursorInteractionLoc = gl.getUniformLocation(program, 'u_cursorInteraction');
    const uIterationsLoc = gl.getUniformLocation(program, 'u_iterations');

    let currentWidth = 0;
    let currentHeight = 0;

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.round(rect.width || window.innerWidth || 1920);
      const h = Math.round(rect.height || window.innerHeight || 1080);
      const effDpr = Math.min(window.devicePixelRatio || 1, dpr);

      currentWidth = Math.floor(w * effDpr);
      currentHeight = Math.floor(h * effDpr);

      if (canvas.width !== currentWidth || canvas.height !== currentHeight) {
        canvas.width = currentWidth;
        canvas.height = currentHeight;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        gl.viewport(0, 0, currentWidth, currentHeight);
      }
    };

    handleResize();
    const resizeObserver = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', handleResize);

    const startTime = performance.now();

    const render = () => {
      if (!paused) {
        const time = (performance.now() - startTime) * 0.001;

        gl.useProgram(program);

        gl.uniform2f(uResolutionLoc, currentWidth, currentHeight);
        gl.uniform1f(uTimeLoc, time);
        gl.uniform2f(uMouseLoc, mouseRef.current.x, mouseRef.current.y);
        gl.uniform1f(uSpeedLoc, speed);
        gl.uniform1f(uScaleLoc, scale);
        gl.uniform1f(uRadiusLoc, radius);
        gl.uniform1f(uEdgeSoftnessLoc, edgeSoftness);
        gl.uniform1f(uIntensityLoc, intensity);
        gl.uniform1f(uContrastLoc, contrast);
        gl.uniform1f(uFlickerLoc, flicker);
        gl.uniform1f(uComplexityLoc, complexity);
        gl.uniform1f(uTurbulenceLoc, turbulence);
        gl.uniform1f(uTwistLoc, twist);
        gl.uniform1f(uDensityLoc, density);
        gl.uniform3fv(uColorLoc, colorRgb);
        gl.uniform3fv(uHotColorLoc, hotColorRgb);
        gl.uniform3fv(uBackgroundLoc, backgroundRgb);
        gl.uniform1f(uOpacityLoc, opacity);
        gl.uniform1i(uCursorInteractionLoc, cursorInteraction ? 1 : 0);
        gl.uniform1i(uIterationsLoc, Math.min(36, Math.max(1, Math.round(iterations))));

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);

      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (program) gl.deleteProgram(program);
      if (vertShader) gl.deleteShader(vertShader);
      if (fragShader) gl.deleteShader(fragShader);
    };
  }, [
    speed,
    iterations,
    scale,
    radius,
    edgeSoftness,
    intensity,
    contrast,
    flicker,
    complexity,
    turbulence,
    twist,
    density,
    colorRgb,
    hotColorRgb,
    backgroundRgb,
    opacity,
    cursorInteraction,
    paused,
    dpr,
  ]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cursorInteraction || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const effDpr = Math.min(window.devicePixelRatio || 1, dpr);
    mouseRef.current = {
      x: (e.clientX - rect.left) * effDpr,
      y: (rect.height - (e.clientY - rect.top)) * effDpr,
    };
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      className={`relative w-full h-full overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none block"
      />
      {children && <div className="relative z-10 w-full h-full">{children}</div>}
    </div>
  );
}

export default NeuralFlash;
