import type { VehicleBodyStyle } from '../kart/vehicleCatalog';

export interface EngineAudioUpdate {
  isDriving: boolean;
  bodyStyle: VehicleBodyStyle;
  speed: number;
  maxSpeed: number;
  throttle: boolean;
  braking: boolean;
  lateralSlip: number;
  isDrifting: boolean;
  onKerb: boolean;
  onAsphalt: boolean;
  walkingSpeed: number;
}

const ENGINE_TONE_PRESETS: Record<
  VehicleBodyStyle,
  { baseHz: number; maxHz: number; subMult: number; gears: number; filterMaxHz: number }
> = {
  kart: { baseHz: 68, maxHz: 235, subMult: 0.5, gears: 4, filterMaxHz: 1550 },
  formula: { baseHz: 95, maxHz: 390, subMult: 1.5, gears: 6, filterMaxHz: 2600 },
  sport: { baseHz: 56, maxHz: 215, subMult: 0.5, gears: 5, filterMaxHz: 1450 },
  rally: { baseHz: 62, maxHz: 245, subMult: 0.75, gears: 5, filterMaxHz: 1700 },
  cruiser: { baseHz: 46, maxHz: 165, subMult: 0.5, gears: 4, filterMaxHz: 1050 },
};

/**
 * Compute simulated gear (1..N) and normalized RPM [0.18..1.0] for both audio and HUD telemetry.
 */
export function computeSimulatedGearAndRpm(
  absSpeed: number,
  maxSpeed: number,
  gears = 5,
): { gear: number; rpmNorm: number } {
  if (absSpeed < 0.35) {
    return { gear: 1, rpmNorm: 0.18 };
  }
  const ratio = Math.min(1.08, absSpeed / Math.max(1, maxSpeed));
  const scaled = ratio * gears;
  const gear = Math.min(gears, Math.max(1, Math.floor(scaled * 0.92) + 1));
  const gearSpan = 1 / gears;
  const gearFloor = (gear - 1) * gearSpan * 0.86;
  const withinGear = Math.min(1, Math.max(0, (ratio - gearFloor) / (gearSpan * 1.18)));
  const rpmNorm = Math.min(1, 0.28 + withinGear * 0.72);
  return { gear, rpmNorm };
}

/**
 * Lightweight, zero-asset procedural Web Audio engine for vehicle exhaust, tire skid,
 * kerb rumble, footsteps, and race countdown/checkpoint/finish cues.
 * Safely degrades to a no-op when AudioContext is unavailable or muted.
 */
export class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscSecondary: OscillatorNode | null = null;

  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

  private kerbOsc: OscillatorNode | null = null;
  private kerbGain: GainNode | null = null;

  private muted = false;
  private disposed = false;
  private stepAccum = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.03);
    }
  }

  /**
   * Lazily initializes or resumes Web Audio upon a user gesture.
   */
  public unlock(): void {
    if (this.disposed || this.muted) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.28;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Engine synth chain: two detuned oscillators -> lowpass -> gain -> master
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 500;
      engFilter.Q.value = 2.4;

      const engGain = ctx.createGain();
      engGain.gain.value = 0;
      engFilter.connect(engGain);
      engGain.connect(master);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 60;
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 30;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.65;
      osc1.connect(engFilter);
      osc2.connect(subGain);
      subGain.connect(engFilter);

      osc1.start();
      osc2.start();

      this.engineFilter = engFilter;
      this.engineGain = engGain;
      this.oscPrimary = osc1;
      this.oscSecondary = osc2;

      // Looping white-noise buffer for tire screech / gravel scrub
      const bufSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;

      const skidFilt = ctx.createBiquadFilter();
      skidFilt.type = 'bandpass';
      skidFilt.frequency.value = 1250;
      skidFilt.Q.value = 4.2;

      const skidG = ctx.createGain();
      skidG.gain.value = 0;

      noise.connect(skidFilt);
      skidFilt.connect(skidG);
      skidG.connect(master);
      noise.start();

      this.noiseSource = noise;
      this.skidFilter = skidFilt;
      this.skidGain = skidG;

      // Kerb rumble oscillator
      const kOsc = ctx.createOscillator();
      kOsc.type = 'square';
      kOsc.frequency.value = 38;
      const kFilter = ctx.createBiquadFilter();
      kFilter.type = 'lowpass';
      kFilter.frequency.value = 140;
      const kGain = ctx.createGain();
      kGain.gain.value = 0;
      kOsc.connect(kFilter);
      kFilter.connect(kGain);
      kGain.connect(master);
      kOsc.start();

      this.kerbOsc = kOsc;
      this.kerbGain = kGain;
    } catch {
      this.ctx = null;
    }
  }

  public update(state: EngineAudioUpdate, dt: number): void {
    if (!this.ctx || !this.engineGain || !this.oscPrimary || !this.oscSecondary || !this.engineFilter) {
      return;
    }
    if (this.ctx.state !== 'running' || this.muted) {
      return;
    }

    const now = this.ctx.currentTime;

    if (state.isDriving) {
      const preset = ENGINE_TONE_PRESETS[state.bodyStyle] ?? ENGINE_TONE_PRESETS.kart;
      const absSpeed = Math.abs(state.speed);
      const { rpmNorm } = computeSimulatedGearAndRpm(absSpeed, state.maxSpeed, preset.gears);

      const loadBoost = state.throttle ? 1.0 : 0.76;
      const targetHz = (preset.baseHz + (preset.maxHz - preset.baseHz) * rpmNorm) * loadBoost;
      const targetFilter = 260 + (preset.filterMaxHz - 260) * rpmNorm * (state.throttle ? 1.0 : 0.62);
      const targetVol = 0.08 + rpmNorm * (state.throttle ? 0.16 : 0.09);

      this.oscPrimary.frequency.setTargetAtTime(targetHz, now, 0.045);
      this.oscSecondary.frequency.setTargetAtTime(targetHz * preset.subMult, now, 0.045);
      this.engineFilter.frequency.setTargetAtTime(targetFilter, now, 0.05);
      this.engineGain.gain.setTargetAtTime(targetVol, now, 0.05);

      // Tire skid / drift screech or grass scrub
      if (this.skidGain && this.skidFilter) {
        const hardBrake = state.braking && state.speed > 9;
        const slipRatio = Math.min(1, Math.abs(state.lateralSlip) / 6.5);
        let skidLevel = 0;
        if (state.onAsphalt) {
          if (state.isDrifting) skidLevel = 0.12 + slipRatio * 0.16;
          else if (hardBrake) skidLevel = 0.14;
          else if (slipRatio > 0.35) skidLevel = (slipRatio - 0.35) * 0.15;
          this.skidFilter.frequency.setTargetAtTime(1180 + slipRatio * 420, now, 0.04);
          this.skidFilter.Q.setTargetAtTime(4.8, now, 0.04);
        } else if (absSpeed > 2.5) {
          // Off-track grass/gravel tire hiss
          skidLevel = Math.min(0.11, (absSpeed / 18) * 0.1);
          this.skidFilter.frequency.setTargetAtTime(520, now, 0.05);
          this.skidFilter.Q.setTargetAtTime(1.2, now, 0.05);
        }
        this.skidGain.gain.setTargetAtTime(skidLevel, now, 0.04);
      }

      // Kerb rumble strip vibration
      if (this.kerbGain && this.kerbOsc) {
        const kerbLevel = state.onKerb && absSpeed > 3 ? Math.min(0.15, (absSpeed / 25) * 0.15) : 0;
        this.kerbOsc.frequency.setTargetAtTime(24 + absSpeed * 1.45, now, 0.03);
        this.kerbGain.gain.setTargetAtTime(kerbLevel, now, 0.03);
      }
    } else {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      if (this.skidGain) this.skidGain.gain.setTargetAtTime(0, now, 0.04);
      if (this.kerbGain) this.kerbGain.gain.setTargetAtTime(0, now, 0.04);

      // Subtle walking/sprinting footsteps
      const wSpeed = Math.abs(state.walkingSpeed);
      if (wSpeed > 1.0) {
        this.stepAccum += wSpeed * dt * 0.32;
        if (this.stepAccum >= 1) {
          this.stepAccum %= 1;
          this.playTone(115 + Math.random() * 25, 0.045, 'triangle', 0.05);
        }
      } else {
        this.stepAccum = 0;
      }
    }
  }

  public silenceLooping(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.04);
    this.skidGain?.gain.setTargetAtTime(0, now, 0.04);
    this.kerbGain?.gain.setTargetAtTime(0, now, 0.04);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (isGo) {
      this.playTone(880, 0.28, 'triangle', 0.22);
      this.playTone(1318.5, 0.32, 'sine', 0.16);
    } else {
      this.playTone(440, 0.14, 'triangle', 0.18);
    }
  }

  public playCheckpointChime(): void {
    this.playTone(659.25, 0.11, 'sine', 0.14);
    setTimeout(() => this.playTone(880, 0.14, 'sine', 0.14), 55);
  }

  public playFinishFanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((hz, idx) => {
      setTimeout(() => this.playTone(hz, 0.26, 'triangle', 0.18), idx * 85);
    });
  }

  public playLapChime(): void {
    this.playTone(587.33, 0.12, 'triangle', 0.16);
    setTimeout(() => this.playTone(880, 0.2, 'triangle', 0.18), 70);
  }

  public playWrongWayAlert(): void {
    this.playTone(220, 0.18, 'sawtooth', 0.14);
    setTimeout(() => this.playTone(174.61, 0.24, 'sawtooth', 0.14), 130);
  }

  public playVehicleDoor(entering: boolean): void {
    this.playTone(entering ? 150 : 190, 0.08, 'triangle', 0.12);
    setTimeout(() => this.playTone(entering ? 240 : 130, 0.09, 'sine', 0.1), 50);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public dispose(): void {
    this.disposed = true;
    try {
      this.oscPrimary?.stop();
      this.oscSecondary?.stop();
      this.noiseSource?.stop();
      this.kerbOsc?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close().catch(() => {});
      }
    } catch {
      // Ignore already-stopped audio nodes
    }
    this.ctx = null;
  }
}
