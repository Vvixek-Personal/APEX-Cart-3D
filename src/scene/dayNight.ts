import * as THREE from 'three';

/**
 * Smooth procedural daylight cycle: drives sun/moon direction, sky gradient,
 * fog, lighting rig, exposure, and street-lamp glow from a single clock.
 * One full day-night cycle lasts `cycleLength` seconds (6 minutes), starting
 * shortly after sunrise for pleasant first-impression lighting.
 */

const SKY_TEX_WIDTH = 8;
const SKY_TEX_HEIGHT = 256;

const c = (hex: number) => new THREE.Color(hex);

const PHASES = {
  night: {
    skyTop: c(0x060b18),
    skyHorizon: c(0x0e1626),
    fog: c(0x0e1626),
    sun: c(0x1d2c4a),
    hemiSky: c(0x1c2a42),
    hemiGround: c(0x11151a),
    fill: c(0x8aa2d8),
  },
  dawn: {
    skyTop: c(0x41538f),
    skyHorizon: c(0xf2a45c),
    fog: c(0xd9a06c),
    sun: c(0xff9a4d),
    hemiSky: c(0x8e97b0),
    hemiGround: c(0x5a4a38),
    fill: c(0xc9d7ef),
  },
  day: {
    skyTop: c(0x3f8fdd),
    skyHorizon: c(0xcfe9fb),
    fog: c(0xcce9fb),
    sun: c(0xfff2dc),
    hemiSky: c(0xdce5ec),
    hemiGround: c(0x716951),
    fill: c(0xdceeff),
  },
  dusk: {
    skyTop: c(0x2c3a72),
    skyHorizon: c(0xff8e4f),
    fog: c(0xcf8a5e),
    sun: c(0xff8c3c),
    hemiSky: c(0x7e819c),
    hemiGround: c(0x4f4234),
    fill: c(0xc0cbe6),
  },
} as const;

const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

function mixColors(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  out.copy(a);
  return out.lerp(b, THREE.MathUtils.clamp(t, 0, 1));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export interface DayNightSample {
  /** 0 = full daylight, 1 = deep night. */
  nightFactor: number;
  /** Warm glow strength near sunrise/sunset (bell curve). */
  duskGlow: number;
  /** Simulated clock label, e.g. "09:40" (for the pause menu). */
  clockLabel: string;
}

export class DayNightCycle {
  public readonly cycleLength = 360; // seconds per full day
  public timeOfDay: number; // seconds into the cycle

  public readonly sunDirection = new THREE.Vector3(0, 1, 0);
  public readonly sunColor = new THREE.Color();
  public readonly hemiSkyColor = new THREE.Color();
  public readonly hemiGroundColor = new THREE.Color();
  public readonly fogColor = new THREE.Color();
  public readonly skyTopColor = new THREE.Color();
  public readonly skyHorizonColor = new THREE.Color();
  public readonly fillColor = new THREE.Color();

  public sunIntensity = 1.45;
  public hemiIntensity = 0.8;
  public fillIntensity = 0.25;
  public exposure = 0.88;
  public environmentIntensity = 0.45;
  public sunOpacity = 1;
  public moonOpacity = 0;

  /** Dynamic vertical-gradient sky texture used as scene.background. */
  public readonly skyTexture: THREE.CanvasTexture;
  private readonly skyCanvas: HTMLCanvasElement;
  private readonly skyCtx: CanvasRenderingContext2D;
  private lastPaintedKey = -1;

  constructor(startPhase = 0.07) {
    this.timeOfDay = startPhase * this.cycleLength;

    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = SKY_TEX_WIDTH;
    this.skyCanvas.height = SKY_TEX_HEIGHT;
    this.skyCtx = this.skyCanvas.getContext('2d')!;
    this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.skyTexture.magFilter = THREE.LinearFilter;
    this.skyTexture.minFilter = THREE.LinearFilter;
    this.skyTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.skyTexture.wrapT = THREE.ClampToEdgeWrapping;
  }

  /** Sun elevation in [-1, 1]; positive above the horizon. */
  public get sunElevation(): number {
    const phase = (this.timeOfDay / this.cycleLength) % 1;
    return Math.sin(phase * Math.PI * 2);
  }

  public sample(out?: DayNightSample): DayNightSample {
    const phase = (this.timeOfDay / this.cycleLength) % 1;
    const elev = Math.sin(phase * Math.PI * 2);

    const daylight = smoothstep(-0.12, 0.24, elev);
    const nightFactor = 1 - daylight;
    const duskGlow = Math.exp(-Math.pow(elev / 0.16, 2)) * (elev > -0.35 ? 1 : 0);

    // Blend palettes: night -> (dawn|dusk by phase) -> day
    const rising = phase < 0.5;
    const horizonPhase = rising ? PHASES.dawn : PHASES.dusk;
    const horizonBlend = Math.max(duskGlow, smoothstep(-0.28, -0.02, elev) * (1 - smoothstep(0.06, 0.35, elev)));

    mixColors(this.skyTopColor, PHASES.night.skyTop, PHASES.day.skyTop, daylight);
    mixColors(_tmpA, horizonPhase.skyTop, PHASES.day.skyTop, daylight);
    this.skyTopColor.lerp(_tmpA, horizonBlend * 0.75);

    mixColors(this.skyHorizonColor, PHASES.night.skyHorizon, PHASES.day.skyHorizon, daylight);
    this.skyHorizonColor.lerp(horizonPhase.skyHorizon, horizonBlend * 0.85);

    mixColors(this.fogColor, PHASES.night.fog, PHASES.day.fog, daylight);
    this.fogColor.lerp(horizonPhase.fog, horizonBlend * 0.7);

    mixColors(this.sunColor, horizonPhase.sun, PHASES.day.sun, smoothstep(0.08, 0.42, elev));

    mixColors(this.hemiSkyColor, PHASES.night.hemiSky, PHASES.day.hemiSky, daylight);
    mixColors(this.hemiGroundColor, PHASES.night.hemiGround, PHASES.day.hemiGround, daylight);
    mixColors(this.fillColor, PHASES.night.fill, PHASES.day.fill, daylight);

    this.sunIntensity = 0.04 + daylight * 1.42;
    this.hemiIntensity = 0.16 + daylight * 0.64;
    this.fillIntensity = 0.14 + daylight * 0.13;
    this.exposure = 0.62 + daylight * 0.27;
    this.environmentIntensity = 0.12 + daylight * 0.33;

    // Sun sprite follows the sun disc; moon rises opposite
    const sunAngle = phase * Math.PI * 2;
    this.sunDirection
      .set(Math.cos(sunAngle) * 0.72, Math.sin(sunAngle), 0.42)
      .normalize();
    this.sunOpacity = THREE.MathUtils.clamp(daylight * 1.15 + duskGlow * 0.4, 0, 1);
    this.moonOpacity = nightFactor * 0.9;

    if (out) {
      out.nightFactor = nightFactor;
      out.duskGlow = duskGlow;
      const totalMinutes = Math.floor(((phase + 0.5) % 1) * 24 * 60);
      const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');
      out.clockLabel = `${hh}:${mm}`;
      return out;
    }

    const totalMinutes = Math.floor(((phase + 0.5) % 1) * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return {
      nightFactor,
      duskGlow,
      clockLabel: `${hh}:${mm}`,
    };
  }

  public update(dt: number, out?: DayNightSample): DayNightSample {
    this.timeOfDay = (this.timeOfDay + dt) % this.cycleLength;
    return this.sample(out);
  }

  /** Redraws the sky gradient texture only when its colors actually changed. */
  public paintSky(): void {
    const key = Math.round(this.skyTopColor.getHex() / 8) * 1000003 +
      Math.round(this.skyHorizonColor.getHex() / 8);
    if (key === this.lastPaintedKey) return;
    this.lastPaintedKey = key;

    const grad = this.skyCtx.createLinearGradient(0, 0, 0, SKY_TEX_HEIGHT);
    grad.addColorStop(0, `#${this.skyTopColor.getHexString()}`);
    grad.addColorStop(0.62, `#${_tmpB.copy(this.skyTopColor).lerp(this.skyHorizonColor, 0.55).getHexString()}`);
    grad.addColorStop(1, `#${this.skyHorizonColor.getHexString()}`);
    this.skyCtx.fillStyle = grad;
    this.skyCtx.fillRect(0, 0, SKY_TEX_WIDTH, SKY_TEX_HEIGHT);
    this.skyTexture.needsUpdate = true;
  }

  public dispose(): void {
    this.skyTexture.dispose();
  }
}
