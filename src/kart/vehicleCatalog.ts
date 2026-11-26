import { KART_TOWN_SPAWN } from '../scene/townLayout';

export type VehicleBodyStyle = 'kart' | 'sport' | 'rally' | 'formula' | 'cruiser';

export interface VehiclePhysicsStats {
  maxForwardSpeed: number;
  maxReverseSpeed: number;
  offTrackMaxSpeed: number;
  plazaMaxSpeed: number;
  accelRate: number;
  reverseAccelRate: number;
  brakeRate: number;
  coastDrag: number;
  offTrackDrag: number;
  maxTurnRate: number;
  steerResponseRate: number;
  kartRadius: number;
  wheelRadius: number;
}

export interface VehicleSpec {
  id: string;
  name: string;
  tagline: string;
  bodyStyle: VehicleBodyStyle;
  primaryColor: number;
  accentColor: number;
  rimColor: number;
  cockpitEyeY: number;
  cockpitEyeZ: number;
  hoodCamY: number;
  hoodCamZ: number;
  chaseDist: number;
  chaseHeight: number;
  stats: VehiclePhysicsStats;
}

export interface TownVehicleSpawn {
  specId: string;
  instanceId: string;
  x: number;
  z: number;
  yaw: number;
}

export const VEHICLE_CATALOG: Record<string, VehicleSpec> = {
  big_kart: {
    id: 'big_kart',
    name: 'Apex Mega Kart',
    tagline: 'Oversized Twin-Engine Kart',
    bodyStyle: 'kart',
    primaryColor: 0xe63329,
    accentColor: 0xf8fafc,
    rimColor: 0xf4c430,
    cockpitEyeY: 2.02,
    cockpitEyeZ: 0.14,
    hoodCamY: 1.48,
    hoodCamZ: 1.85,
    chaseDist: 13.8,
    chaseHeight: 5.7,
    stats: {
      maxForwardSpeed: 28,
      maxReverseSpeed: 4,
      offTrackMaxSpeed: 13,
      plazaMaxSpeed: 22,
      accelRate: 3.8,
      reverseAccelRate: 2.2,
      brakeRate: 9.0,
      coastDrag: 0.7,
      offTrackDrag: 26,
      maxTurnRate: 2.45,
      steerResponseRate: 6.5,
      kartRadius: 1.38,
      wheelRadius: 0.44,
    },
  },
  sport_gt: {
    id: 'sport_gt',
    name: 'Velocity GT',
    tagline: 'Twin-Stripe Coupe',
    bodyStyle: 'sport',
    primaryColor: 0x294e68,
    accentColor: 0xf8fafc,
    rimColor: 0xe2e8f0,
    cockpitEyeY: 1.52,
    cockpitEyeZ: 0.45,
    hoodCamY: 1.32,
    hoodCamZ: 2.1,
    chaseDist: 14.5,
    chaseHeight: 5.8,
    stats: {
      maxForwardSpeed: 31.5,
      maxReverseSpeed: 4.2,
      offTrackMaxSpeed: 12.5,
      plazaMaxSpeed: 22.5,
      accelRate: 5.2,
      reverseAccelRate: 1.8,
      brakeRate: 9.5,
      coastDrag: 0.6,
      offTrackDrag: 28,
      maxTurnRate: 2.15,
      steerResponseRate: 5.5,
      kartRadius: 1.44,
      wheelRadius: 0.39,
    },
  },
  formula_open: {
    id: 'formula_open',
    name: 'Monza Arrow',
    tagline: 'Open-Wheel GP Racer',
    bodyStyle: 'formula',
    primaryColor: 0x0284c7,
    accentColor: 0xfbbf24,
    rimColor: 0xf8fafc,
    cockpitEyeY: 1.56,
    cockpitEyeZ: 0.12,
    hoodCamY: 1.15,
    hoodCamZ: 2.18,
    chaseDist: 14.2,
    chaseHeight: 5.5,
    stats: {
      maxForwardSpeed: 33.5,
      maxReverseSpeed: 4,
      offTrackMaxSpeed: 11.5,
      plazaMaxSpeed: 23,
      accelRate: 6.4,
      reverseAccelRate: 2.2,
      brakeRate: 11.5,
      coastDrag: 0.75,
      offTrackDrag: 30,
      maxTurnRate: 2.38,
      steerResponseRate: 7,
      kartRadius: 1.42,
      wheelRadius: 0.42,
    },
  },
  rally_hatch: {
    id: 'rally_hatch',
    name: 'Alpine Rally',
    tagline: 'All-Surface Turbo Hatch',
    bodyStyle: 'rally',
    primaryColor: 0xbc8744,
    accentColor: 0x1e3a8a,
    rimColor: 0xfef08a,
    cockpitEyeY: 1.58,
    cockpitEyeZ: 0.44,
    hoodCamY: 1.38,
    hoodCamZ: 1.98,
    chaseDist: 14.2,
    chaseHeight: 5.9,
    stats: {
      maxForwardSpeed: 29.5,
      maxReverseSpeed: 4.5,
      offTrackMaxSpeed: 18.5,
      plazaMaxSpeed: 24,
      accelRate: 4.5,
      reverseAccelRate: 2.1,
      brakeRate: 9.0,
      coastDrag: 0.8,
      offTrackDrag: 18,
      maxTurnRate: 2.35,
      steerResponseRate: 6,
      kartRadius: 1.4,
      wheelRadius: 0.41,
    },
  },
  street_cruiser: {
    id: 'street_cruiser',
    name: 'Town Cruiser',
    tagline: 'Emerald Touring SUV',
    bodyStyle: 'cruiser',
    primaryColor: 0x38534a,
    accentColor: 0xfef3c7,
    rimColor: 0xd1d5db,
    cockpitEyeY: 1.8,
    cockpitEyeZ: 0.55,
    hoodCamY: 1.56,
    hoodCamZ: 2.08,
    chaseDist: 15.0,
    chaseHeight: 6.2,
    stats: {
      maxForwardSpeed: 27.5,
      maxReverseSpeed: 4.2,
      offTrackMaxSpeed: 16.5,
      plazaMaxSpeed: 22.5,
      accelRate: 3.3,
      reverseAccelRate: 1.8,
      brakeRate: 8.4,
      coastDrag: 0.65,
      offTrackDrag: 20,
      maxTurnRate: 2.1,
      steerResponseRate: 5,
      kartRadius: 1.46,
      wheelRadius: 0.43,
    },
  },
  crimson_gt: {
    id: 'crimson_gt',
    name: 'Crimson Strada',
    tagline: 'V8 Street Coupe',
    bodyStyle: 'sport',
    primaryColor: 0x8e302c,
    accentColor: 0xfef08a,
    rimColor: 0xf1f5f9,
    cockpitEyeY: 1.52,
    cockpitEyeZ: 0.45,
    hoodCamY: 1.32,
    hoodCamZ: 2.1,
    chaseDist: 14.5,
    chaseHeight: 5.8,
    stats: {
      maxForwardSpeed: 31.5,
      maxReverseSpeed: 4.2,
      offTrackMaxSpeed: 12.5,
      plazaMaxSpeed: 22.5,
      accelRate: 5.2,
      reverseAccelRate: 1.8,
      brakeRate: 9.5,
      coastDrag: 0.6,
      offTrackDrag: 28,
      maxTurnRate: 2.15,
      steerResponseRate: 5.5,
      kartRadius: 1.44,
      wheelRadius: 0.39,
    },
  },
  violet_rally: {
    id: 'violet_rally',
    name: 'Violet RS',
    tagline: 'Street Rally Spec',
    bodyStyle: 'rally',
    primaryColor: 0x625b70,
    accentColor: 0xf8fafc,
    rimColor: 0xfde047,
    cockpitEyeY: 1.58,
    cockpitEyeZ: 0.44,
    hoodCamY: 1.38,
    hoodCamZ: 1.98,
    chaseDist: 14.2,
    chaseHeight: 5.9,
    stats: {
      maxForwardSpeed: 29.5,
      maxReverseSpeed: 4.5,
      offTrackMaxSpeed: 18.5,
      plazaMaxSpeed: 24,
      accelRate: 4.5,
      reverseAccelRate: 2.1,
      brakeRate: 9.0,
      coastDrag: 0.8,
      offTrackDrag: 18,
      maxTurnRate: 2.35,
      steerResponseRate: 6,
      kartRadius: 1.4,
      wheelRadius: 0.41,
    },
  },
  teal_cruiser: {
    id: 'teal_cruiser',
    name: 'Harbor Wagon',
    tagline: 'Coastal Touring Wagon',
    bodyStyle: 'cruiser',
    primaryColor: 0x356566,
    accentColor: 0xf8fafc,
    rimColor: 0xe2e8f0,
    cockpitEyeY: 1.8,
    cockpitEyeZ: 0.55,
    hoodCamY: 1.56,
    hoodCamZ: 2.08,
    chaseDist: 15.0,
    chaseHeight: 6.2,
    stats: {
      maxForwardSpeed: 27.5,
      maxReverseSpeed: 4.2,
      offTrackMaxSpeed: 16.5,
      plazaMaxSpeed: 22.5,
      accelRate: 3.3,
      reverseAccelRate: 1.8,
      brakeRate: 8.4,
      coastDrag: 0.65,
      offTrackDrag: 20,
      maxTurnRate: 2.1,
      steerResponseRate: 5,
      kartRadius: 1.46,
      wheelRadius: 0.43,
    },
  },
};

/**
 * Interactive drivable vehicles positioned along Main Avenue (right beside spawn)
 * and in both Stadium Parking Lots so every visible car can be walked up to & driven.
 */
export const TOWN_VEHICLE_SPAWNS: ReadonlyArray<TownVehicleSpawn> = [
  // Main Avenue showcase line right beside player spawn
  {
    instanceId: 'veh_mega_kart',
    specId: 'big_kart',
    x: KART_TOWN_SPAWN.x,
    z: KART_TOWN_SPAWN.z,
    yaw: KART_TOWN_SPAWN.yaw,
  },
  {
    instanceId: 'veh_main_gt',
    specId: 'sport_gt',
    x: -2.4,
    z: 285.5,
    yaw: Math.PI,
  },
  {
    instanceId: 'veh_main_formula',
    specId: 'formula_open',
    x: 2.4,
    z: 278.0,
    yaw: Math.PI,
  },
  // Row 0 Col 2: Stadium Main Parking (xMin -46.5..-6.5, zMin 228..264)
  {
    instanceId: 'veh_lot1_rally',
    specId: 'rally_hatch',
    x: -18.2,
    z: 234.5,
    yaw: 0,
  },
  {
    instanceId: 'veh_lot1_gt',
    specId: 'crimson_gt',
    x: -12.8,
    z: 257.5,
    yaw: Math.PI,
  },
  {
    instanceId: 'veh_lot1_cruiser',
    specId: 'teal_cruiser',
    x: -34.4,
    z: 257.5,
    yaw: Math.PI,
  },
  {
    instanceId: 'veh_lot1_formula',
    specId: 'formula_open',
    x: -39.8,
    z: 234.5,
    yaw: 0,
  },
  // Row 0 Col 4: East Visitor Parking (xMin 57..97, zMin 228..264)
  {
    instanceId: 'veh_lot2_cruiser',
    specId: 'street_cruiser',
    x: 90.8,
    z: 234.5,
    yaw: 0,
  },
  {
    instanceId: 'veh_lot2_rally',
    specId: 'violet_rally',
    x: 69.2,
    z: 257.5,
    yaw: Math.PI,
  },
  {
    instanceId: 'veh_lot2_kart2',
    specId: 'big_kart',
    x: 74.6,
    z: 234.5,
    yaw: 0,
  },
];
