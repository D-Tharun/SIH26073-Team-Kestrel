import React, { useEffect, useRef, useMemo, useCallback } from 'react';

export interface RisingParticlesProps {
  /** Speed of rising motes */
  speed?: number;
  /** Number of particles in the field */
  count?: number;
  /** Minimum particle size in fraction of viewport height */
  minSize?: number;
  /** Maximum particle size in fraction of viewport height */
  maxSize?: number;
  /** Horizontal reach multiplier (1 = full viewport) */
  spread?: number;
  /** Amplitude of horizontal sway */
  sway?: number;
  /** Rate/frequency of horizontal oscillation */
  swayRate?: number;
  /** Depth scale variation between near and far particles */
  depth?: number;
  /** Radius ratio of the dense core */
  coreSize?: number;
  /** Softness ratio of the core edge */
  coreSoftness?: number;
  /** Brightness multiplier of outer glow */
  glow?: number;
  /** Steepness of glow falloff (higher = tighter glow) */
  glowFalloff?: number;
  /** Vertical boundary fade margin (top and bottom) */
  fade?: number;
  /** Master brightness gain */
  gain?: number;
  /** Core whitening/bloom intensity */
  bloom?: number;
  /** Color of near particles (Hex or rgb) */
  color?: string;
  /** Color of far particles (Hex or rgb) */
  farColor?: string;
  /** Film grain intensity (0 to 1) */
  grain?: number;
  /** Film grain refresh rate in FPS */
  grainRate?: number;
  /** Corner vignette strength (0 to 1) */
  vignette?: number;
  /** Background canvas fill or 'transparent' */
  backgroundColor?: string;
  /** Master opacity of the component */
  opacity?: number;
  /** Enable mouse interaction push */
  cursorInteraction?: boolean;
  /** Repulsion displacement factor */
  cursorPush?: number;
  /** Reach radius of cursor push */
  cursorRadius?: number;
  /** Freeze particle simulation */
  paused?: boolean;
  /** Automatically adjust scale on frame drops */
  adaptiveQuality?: boolean;
  /** Target frame rate for quality budget */
  targetFps?: number;
  /** Maximum device pixel ratio */
  dpr?: number;
  /** Optional class names for outer container */
  className?: string;
  /** Layered children rendered above particle field */
  children?: React.ReactNode;
}

interface Particle {
  baseX: number;
  x: number;
  y: number;
  z: number;
  size: number;
  swayPhase: number;
  swaySpeed: number;
  speedMultiplier: number;
  pushX: number;
  pushY: number;
}

// Color helper
function parseColor(colorStr: string): [number, number, number] {
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const num = parseInt(hex, 16);
    if (!isNaN(num)) {
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
  } else if (colorStr.startsWith('rgb')) {
    const matches = colorStr.match(/\d+/g);
    if (matches && matches.length >= 3) {
      return [parseInt(matches[0], 10), parseInt(matches[1], 10), parseInt(matches[2], 10)];
    }
  }
  return [39, 56, 68]; // Default SkyGuard Charcoal fallback
}

export function RisingParticles({
  speed = 1,
  count = 85,
  minSize = 0.015,
  maxSize = 0.045,
  spread = 1,
  sway = 0.04,
  swayRate = 0.6,
  depth = 0.65,
  coreSize = 0.35,
  coreSoftness = 0.85,
  glow = 1.2,
  glowFalloff = 2,
  fade = 0.2,
  gain = 1.0,
  bloom = 0.15,
  color = '#273844',
  farColor = '#4A6B78',
  grain = 0.02,
  grainRate = 24,
  vignette = 0.12,
  backgroundColor = 'transparent',
  opacity = 0.8,
  cursorInteraction = true,
  cursorPush = 0.12,
  cursorRadius = 0.3,
  paused = false,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 2,
  className = '',
  children,
}: RisingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1, y: -1, active: false });
  const particlesRef = useRef<Particle[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const grainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastGrainTimeRef = useRef<number>(0);

  // Parsed RGB values
  const nearRgb = useMemo(() => parseColor(color), [color]);
  const farRgb = useMemo(() => parseColor(farColor), [farColor]);

  // Initialize particles
  const initParticles = useCallback((particleCount: number) => {
    const list: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const z = Math.random(); // 0 = far, 1 = near
      const sizeLerp = minSize + (maxSize - minSize) * (0.35 * (1 - z) + 0.65 * z + (Math.random() * 0.15 - 0.075));
      const speedMult = 0.5 + 0.5 * (1 - (1 - z) * depth);
      const baseX = (Math.random() - 0.5) * spread + 0.5;

      list.push({
        baseX,
        x: baseX,
        y: Math.random() * 1.2 - 0.1, // evenly distributed across screen
        z,
        size: Math.max(0.008, sizeLerp),
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: swayRate * (0.8 + Math.random() * 0.4),
        speedMultiplier: speedMult,
        pushX: 0,
        pushY: 0,
      });
    }
    particlesRef.current = list;
  }, [minSize, maxSize, spread, depth, swayRate]);

  // Pre-generate / update film grain
  const updateGrainCanvas = useCallback((width: number, height: number) => {
    if (grain <= 0 || width <= 0 || height <= 0) return;
    if (!grainCanvasRef.current) {
      grainCanvasRef.current = document.createElement('canvas');
    }
    const gCanvas = grainCanvasRef.current;
    const gWidth = Math.min(256, Math.floor(width / 4));
    const gHeight = Math.min(256, Math.floor(height / 4));
    if (gCanvas.width !== gWidth || gCanvas.height !== gHeight) {
      gCanvas.width = gWidth;
      gCanvas.height = gHeight;
    }
    const gCtx = gCanvas.getContext('2d');
    if (!gCtx) return;

    const imgData = gCtx.createImageData(gWidth, gHeight);
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const noise = (Math.random() - 0.5) * 255 * grain;
      data[i] = 128 + noise;
      data[i + 1] = 128 + noise;
      data[i + 2] = 128 + noise;
      data[i + 3] = Math.abs(noise) * 0.5;
    }
    gCtx.putImageData(imgData, 0, 0);
  }, [grain]);

  useEffect(() => {
    initParticles(count);
  }, [count, initParticles]);

  // Global mouse tracking so interaction works even with pointer-events-none on canvas
  useEffect(() => {
    if (!cursorInteraction) return;

    const handlePointerMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1920;
      const h = window.innerHeight || 1080;
      mouseRef.current = {
        x: e.clientX / w,
        y: e.clientY / h,
        active: true,
      };
    };

    const handlePointerLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', handlePointerLeave);
    document.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', handlePointerLeave);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [cursorInteraction]);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let effectiveDpr = 1;

    const handleResize = () => {
      if (!canvas) return;
      const rect = containerRef.current?.getBoundingClientRect();
      const w = Math.round(rect?.width || window.innerWidth || 1920);
      const h = Math.round(rect?.height || window.innerHeight || 1080);
      if (w <= 0 || h <= 0) return;

      width = w;
      height = h;
      effectiveDpr = Math.min(window.devicePixelRatio || 1, dpr);

      canvas.width = Math.floor(w * effectiveDpr);
      canvas.height = Math.floor(h * effectiveDpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      // Absolute transform reset to avoid compounding scaling
      ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
      updateGrainCanvas(w, h);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', handleResize);

    // Animation frame
    const render = (now: number) => {
      if (paused) {
        animFrameIdRef.current = requestAnimationFrame(render);
        return;
      }

      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min(48, now - lastTimeRef.current);
      lastTimeRef.current = now;
      const timeSec = now * 0.001;

      // Ensure valid dimensions
      if (width <= 0 || height <= 0) {
        handleResize();
      }

      // Update grain on timer
      if (grain > 0 && now - lastGrainTimeRef.current > 1000 / grainRate) {
        lastGrainTimeRef.current = now;
        updateGrainCanvas(width, height);
      }

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      if (backgroundColor && backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      const aspect = height > 0 ? width / height : 1;
      const mouse = mouseRef.current;
      const particles = particlesRef.current;

      // Render each particle
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Vertical climb (scaled by speed & individual depth speedMultiplier)
        const climbRate = speed * 0.00028 * p.speedMultiplier * (dt / 16.67);
        p.y -= climbRate;

        // Wrap around smoothly
        if (p.y < -0.08) {
          p.y = 1.08;
          p.baseX = (Math.random() - 0.5) * spread + 0.5;
          p.swayPhase = Math.random() * Math.PI * 2;
        }

        // Horizontal sway oscillation
        const swayOffset = Math.sin(timeSec * p.swaySpeed + p.swayPhase) * sway;
        let targetX = p.baseX + swayOffset;

        // Cursor push interaction
        if (cursorInteraction && mouse.active) {
          const dx = targetX - mouse.x;
          const dy = (p.y - mouse.y) / aspect;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < cursorRadius && dist > 0.0001) {
            const force = (1 - dist / cursorRadius) * cursorPush;
            p.pushX += (dx / dist) * force * 0.12;
            p.pushY += (dy / dist) * force * 0.12;
          }
        }

        // Smooth damping on push
        p.pushX *= 0.94;
        p.pushY *= 0.94;

        p.x = targetX + p.pushX;
        const currentY = p.y + p.pushY;

        // Position in screen pixels
        const px = p.x * width;
        const py = currentY * height;
        const pRadius = Math.max(2.5, p.size * height * 0.5);

        // Boundary vertical fade
        let edgeAlpha = 1;
        if (currentY < fade) {
          edgeAlpha = Math.max(0, currentY / fade);
        } else if (currentY > 1 - fade) {
          edgeAlpha = Math.max(0, (1 - currentY) / fade);
        }

        // Depth-based color interpolation
        const z = p.z;
        const r = Math.round(farRgb[0] + (nearRgb[0] - farRgb[0]) * z);
        const g = Math.round(farRgb[1] + (nearRgb[1] - farRgb[1]) * z);
        const b = Math.round(farRgb[2] + (nearRgb[2] - farRgb[2]) * z);

        // Calculate core highlight
        const bloomR = Math.min(255, Math.round(r + (255 - r) * bloom * z));
        const bloomG = Math.min(255, Math.round(g + (255 - g) * bloom * z));
        const bloomB = Math.min(255, Math.round(b + (255 - b) * bloom * z));

        // Master alpha calculation
        const baseAlpha = edgeAlpha * opacity * gain * (0.45 + 0.55 * z);
        const particleAlpha = Math.min(1, Math.max(0, baseAlpha));
        if (particleAlpha <= 0.01) continue;

        const haloRadius = pRadius * Math.max(1.5, glowFalloff);
        const coreRadius = Math.max(1, pRadius * Math.max(0.2, coreSize));

        // 1. Draw outer soft glowing halo
        const haloGrad = ctx.createRadialGradient(px, py, coreRadius * 0.5, px, py, haloRadius);
        const haloAlpha = particleAlpha * Math.min(1, glow * 0.45);
        haloGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${haloAlpha})`);
        haloGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${haloAlpha * 0.4})`);
        haloGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Draw defined luminous center core
        const coreGrad = ctx.createRadialGradient(
          px,
          py,
          0,
          px,
          py,
          coreRadius
        );
        const coreAlpha = particleAlpha * 0.95;
        coreGrad.addColorStop(0, `rgba(${bloomR}, ${bloomG}, ${bloomB}, ${coreAlpha})`);
        coreGrad.addColorStop(Math.max(0, 1 - coreSoftness), `rgba(${r}, ${g}, ${b}, ${coreAlpha * 0.9})`);
        coreGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${coreAlpha * 0.2})`);

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(px, py, coreRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vignette effect
      if (vignette > 0) {
        const cx = width / 2;
        const cy = height / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        const vigGrad = ctx.createRadialGradient(cx, cy, maxDist * 0.5, cx, cy, maxDist);
        vigGrad.addColorStop(0, 'rgba(39, 56, 68, 0)');
        vigGrad.addColorStop(1, `rgba(39, 56, 68, ${vignette * 0.18})`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // Film grain overlay
      if (grain > 0 && grainCanvasRef.current) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.3, grain * 2);
        ctx.drawImage(grainCanvasRef.current, 0, 0, width, height);
        ctx.restore();
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
    };
  }, [
    speed,
    minSize,
    maxSize,
    spread,
    sway,
    depth,
    coreSize,
    coreSoftness,
    glow,
    glowFalloff,
    fade,
    gain,
    bloom,
    nearRgb,
    farRgb,
    grain,
    grainRate,
    vignette,
    backgroundColor,
    opacity,
    cursorInteraction,
    cursorPush,
    cursorRadius,
    paused,
    dpr,
    updateGrainCanvas,
  ]);

  return (
    <div
      ref={containerRef}
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

export default RisingParticles;
