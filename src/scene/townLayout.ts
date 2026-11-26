import { FIELD_HALF, PARK_HALF } from '../track/trackLayout';

export interface TownRoadRect {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  axis: 'ns' | 'ew';
  lanes: 1 | 2;
  isConnector?: boolean;
}

export interface TownPlazaRect {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  kind: 'parking' | 'market' | 'park_path' | 'sidewalk';
}

export interface TownColliderBox {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export const TOWN_BOUNDS = {
  xMin: -180,
  xMax: 180,
  zMin: PARK_HALF, // 212
  zMax: 422,
  groundY: -0.85,
  roadSurfaceY: -0.71,
  sidewalkSurfaceY: -0.64,
} as const;

export const KART_TOWN_SPAWN = {
  x: 2.4,
  z: 318,
  yaw: Math.PI, // Facing North (-Z) along Main Avenue toward the stadium gate
} as const;

/**
 * Threshold Z coordinate for entering the stadium bowl through the South Gate.
 * South Stand gate is centered around z = 150; crossing z < 156 means the kart
 * has physically entered the stadium and starts the race countdown.
 */
export const STADIUM_GATE_TRIGGER_Z = 156;
export const STADIUM_GATE_CORRIDOR_HALF_WIDTH = 13.5;

/**
 * All driveable roads in the town + connector road into the stadium.
 * Main avenues are 8.4-9.6 units wide (two narrow lanes), and neighborhood
 * side streets / alleys are 4.4-6.0 units wide ("small small roads").
 */
export const TOWN_ROADS: ReadonlyArray<TownRoadRect> = [
  // Central 2-lane Main Avenue connecting town straight through South Gate to track edge
  {
    id: 'main_avenue',
    xMin: -4.8,
    xMax: 4.8,
    zMin: 99,
    zMax: 412,
    axis: 'ns',
    lanes: 2,
    isConnector: true,
  },
  // East-West 2-lane streets
  {
    id: 'north_ring_road',
    xMin: -152,
    xMax: 152,
    zMin: 223,
    zMax: 232,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'midtown_blvd',
    xMin: -152,
    xMax: 152,
    zMin: 288,
    zMax: 297,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'south_town_road',
    xMin: -152,
    xMax: 152,
    zMin: 370,
    zMax: 379,
    axis: 'ew',
    lanes: 2,
  },
  // Small outer south lane
  {
    id: 'outer_south_lane',
    xMin: -152,
    xMax: 152,
    zMin: 406,
    zMax: 412,
    axis: 'ew',
    lanes: 1,
  },
  // Small North-South side streets
  {
    id: 'west_shop_street',
    xMin: -79,
    xMax: -73,
    zMin: 223,
    zMax: 412,
    axis: 'ns',
    lanes: 2,
  },
  {
    id: 'east_park_street',
    xMin: 73,
    xMax: 79,
    zMin: 223,
    zMax: 412,
    axis: 'ns',
    lanes: 2,
  },
  {
    id: 'far_west_lane',
    xMin: -152,
    xMax: -146.5,
    zMin: 223,
    zMax: 412,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'far_east_lane',
    xMin: 146.5,
    xMax: 152,
    zMin: 223,
    zMax: 412,
    axis: 'ns',
    lanes: 1,
  },
  // Small neighborhood alleys & cross lanes ("small small roads")
  {
    id: 'market_bazaar_alley',
    xMin: 36.5,
    xMax: 41.5,
    zMin: 232,
    zMax: 288,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'parking_drive_aisle',
    xMin: -73,
    xMax: -4.8,
    zMin: 257,
    zMax: 263,
    axis: 'ew',
    lanes: 1,
  },
  {
    id: 'west_townhouse_alley',
    xMin: -115.5,
    xMax: -110.5,
    zMin: 232,
    zMax: 406,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'east_townhouse_alley',
    xMin: 110.5,
    xMax: 115.5,
    zMin: 232,
    zMax: 406,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'mid_west_cross_lane',
    xMin: -146.5,
    xMax: -4.8,
    zMin: 332,
    zMax: 337,
    axis: 'ew',
    lanes: 1,
  },
  {
    id: 'mid_east_cross_lane',
    xMin: 79,
    xMax: 146.5,
    zMin: 332,
    zMax: 337,
    axis: 'ew',
    lanes: 1,
  },
  {
    id: 'outer_west_cross_lane',
    xMin: -146.5,
    xMax: -79,
    zMin: 257,
    zMax: 262,
    axis: 'ew',
    lanes: 1,
  },
];

export const TOWN_PARKING_LOTS: ReadonlyArray<TownPlazaRect> = [
  // Main Stadium Parking Lot (NW inner block)
  {
    id: 'stadium_main_parking',
    xMin: -69,
    xMax: -9,
    zMin: 236,
    zMax: 284,
    kind: 'parking',
  },
  // East Market Visitor Parking Lot
  {
    id: 'east_market_parking',
    xMin: 82,
    xMax: 108,
    zMin: 236,
    zMax: 284,
    kind: 'parking',
  },
];

export const TOWN_PARKS: ReadonlyArray<TownPlazaRect> = [
  // Central Town Park (Mid-East block)
  {
    id: 'central_town_park',
    xMin: 8,
    xMax: 70,
    zMin: 300,
    zMax: 367,
    kind: 'park_path',
  },
  // West Pocket Neighborhood Park
  {
    id: 'west_pocket_park',
    xMin: -108,
    xMax: -82,
    zMin: 340,
    zMax: 367,
    kind: 'park_path',
  },
];

/**
 * Building & major structure specs shared between 3D mesh generation and kart collision.
 */
export interface TownBuildingSpec {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  wallColor: number;
  accentColor: number;
  windowPalette: ReadonlyArray<number>;
  facing: 'n' | 's' | 'e' | 'w';
  hasShopFront: boolean;
  awningColor?: number;
  signText?: string;
}

export const TOWN_BUILDINGS: ReadonlyArray<TownBuildingSpec> = [
  // Mid-West Upper Block (facing Main Ave & Midtown Blvd)
  {
    id: 'res_mw_1',
    x: -21,
    z: 314,
    w: 22,
    d: 22,
    h: 19,
    wallColor: 0xf7efe4,
    accentColor: 0x3b4d63,
    windowPalette: [0xffe082, 0x7dd3fc, 0xfda4af, 0xa7f3d0],
    facing: 'e',
    hasShopFront: true,
    awningColor: 0xe11d48,
    signText: 'CAFE',
  },
  {
    id: 'res_mw_2',
    x: -54,
    z: 314,
    w: 24,
    d: 22,
    h: 23,
    wallColor: 0xe6eff6,
    accentColor: 0x334155,
    windowPalette: [0xfef08a, 0x93c5fd, 0xfecdd3, 0x86efac],
    facing: 'n',
    hasShopFront: true,
    awningColor: 0x0284c7,
    signText: 'MART',
  },
  // Mid-West Lower Block
  {
    id: 'res_mw_3',
    x: -21,
    z: 353,
    w: 22,
    d: 20,
    h: 22,
    wallColor: 0xfde8d7,
    accentColor: 0x6b4226,
    windowPalette: [0xfde047, 0x67e8f9, 0xfb7185, 0xfdba74],
    facing: 'e',
    hasShopFront: true,
    awningColor: 0x16a34a,
    signText: 'BAKERY',
  },
  {
    id: 'res_mw_4',
    x: -54,
    z: 353,
    w: 24,
    d: 20,
    h: 17,
    wallColor: 0xeaf4e6,
    accentColor: 0x2f4f4f,
    windowPalette: [0xfef08a, 0x7dd3fc, 0xf9a8d4, 0xfde68a],
    facing: 's',
    hasShopFront: false,
  },
  // Outer West North Block
  {
    id: 'res_ow_1',
    x: -95,
    z: 244,
    w: 20,
    d: 16,
    h: 16,
    wallColor: 0xfef3c7,
    accentColor: 0x78350f,
    windowPalette: [0xfde047, 0x38bdf8, 0xfb7185, 0x4ade80],
    facing: 'e',
    hasShopFront: true,
    awningColor: 0xd97706,
  },
  {
    id: 'res_ow_2',
    x: -95,
    z: 274,
    w: 20,
    d: 16,
    h: 20,
    wallColor: 0xf1f5f9,
    accentColor: 0x1e293b,
    windowPalette: [0xfef08a, 0x60a5fa, 0xf472b6, 0x34d399],
    facing: 'e',
    hasShopFront: false,
  },
  {
    id: 'res_ow_3',
    x: -130,
    z: 244,
    w: 22,
    d: 16,
    h: 21,
    wallColor: 0xfce7f3,
    accentColor: 0x6d28d9,
    windowPalette: [0xfde047, 0x7dd3fc, 0xfda4af, 0xa5b4fc],
    facing: 'n',
    hasShopFront: false,
  },
  {
    id: 'res_ow_4',
    x: -130,
    z: 274,
    w: 22,
    d: 16,
    h: 18,
    wallColor: 0xdbeafe,
    accentColor: 0x1e3a8a,
    windowPalette: [0xfef08a, 0x93c5fd, 0xfca5a5, 0x6ee7b7],
    facing: 's',
    hasShopFront: true,
    awningColor: 0x2563eb,
  },
  // Outer West Mid Block
  {
    id: 'res_ow_5',
    x: -95,
    z: 314,
    w: 20,
    d: 20,
    h: 24,
    wallColor: 0xfed7aa,
    accentColor: 0x9a3412,
    windowPalette: [0xfef08a, 0x38bdf8, 0xfb7185, 0x4ade80],
    facing: 'e',
    hasShopFront: false,
  },
  {
    id: 'res_ow_6',
    x: -130,
    z: 314,
    w: 22,
    d: 20,
    h: 19,
    wallColor: 0xecfccb,
    accentColor: 0x3f6212,
    windowPalette: [0xfde047, 0x67e8f9, 0xfca5a5, 0xfdba74],
    facing: 'w',
    hasShopFront: false,
  },
  {
    id: 'res_ow_7',
    x: -130,
    z: 353,
    w: 22,
    d: 20,
    h: 22,
    wallColor: 0xf5f3ff,
    accentColor: 0x4c1d95,
    windowPalette: [0xfef08a, 0x7dd3fc, 0xf9a8d4, 0x86efac],
    facing: 's',
    hasShopFront: true,
    awningColor: 0x7c3aed,
  },
  // Outer East North-West & East Blocks
  {
    id: 'res_oe_1',
    x: 130,
    z: 248,
    w: 22,
    d: 20,
    h: 21,
    wallColor: 0xfef2f2,
    accentColor: 0x991b1b,
    windowPalette: [0xfde047, 0x38bdf8, 0xfb7185, 0x6ee7b7],
    facing: 'w',
    hasShopFront: true,
    awningColor: 0xdc2626,
  },
  {
    id: 'res_oe_2',
    x: 130,
    z: 274,
    w: 22,
    d: 16,
    h: 17,
    wallColor: 0xe0f2fe,
    accentColor: 0x075985,
    windowPalette: [0xfef08a, 0x7dd3fc, 0xfda4af, 0xfde68a],
    facing: 's',
    hasShopFront: false,
  },
  // Outer East Mid Block
  {
    id: 'res_oe_3',
    x: 95,
    z: 314,
    w: 20,
    d: 20,
    h: 22,
    wallColor: 0xfef9c3,
    accentColor: 0x854d0e,
    windowPalette: [0xfef08a, 0x60a5fa, 0xf472b6, 0x4ade80],
    facing: 'w',
    hasShopFront: true,
    awningColor: 0x0d9488,
  },
  {
    id: 'res_oe_4',
    x: 130,
    z: 314,
    w: 22,
    d: 20,
    h: 25,
    wallColor: 0xf3e8ff,
    accentColor: 0x581c87,
    windowPalette: [0xfde047, 0x38bdf8, 0xfb7185, 0xa7f3d0],
    facing: 'e',
    hasShopFront: false,
  },
  {
    id: 'res_oe_5',
    x: 95,
    z: 353,
    w: 20,
    d: 20,
    h: 18,
    wallColor: 0xffe4e6,
    accentColor: 0x9f1239,
    windowPalette: [0xfef08a, 0x7dd3fc, 0xfca5a5, 0x86efac],
    facing: 'w',
    hasShopFront: false,
  },
  {
    id: 'res_oe_6',
    x: 130,
    z: 353,
    w: 22,
    d: 20,
    h: 20,
    wallColor: 0xdcfce7,
    accentColor: 0x166534,
    windowPalette: [0xfde047, 0x93c5fd, 0xf9a8d4, 0xfdba74],
    facing: 's',
    hasShopFront: true,
    awningColor: 0xea580c,
  },
  // South Town Edge Residences
  {
    id: 'res_s_1',
    x: -24,
    z: 392,
    w: 24,
    d: 16,
    h: 18,
    wallColor: 0xeff6ff,
    accentColor: 0x1d4ed8,
    windowPalette: [0xfef08a, 0x38bdf8, 0xfb7185, 0x4ade80],
    facing: 'n',
    hasShopFront: true,
    awningColor: 0x2563eb,
  },
  {
    id: 'res_s_2',
    x: 24,
    z: 392,
    w: 24,
    d: 16,
    h: 19,
    wallColor: 0xfff7ed,
    accentColor: 0xc2410c,
    windowPalette: [0xfde047, 0x67e8f9, 0xf9a8d4, 0x86efac],
    facing: 'n',
    hasShopFront: true,
    awningColor: 0xe11d48,
  },
  {
    id: 'res_s_3',
    x: -55,
    z: 392,
    w: 22,
    d: 16,
    h: 16,
    wallColor: 0xfdf2f8,
    accentColor: 0x9d174d,
    windowPalette: [0xfef08a, 0x7dd3fc, 0xfda4af, 0xa7f3d0],
    facing: 'n',
    hasShopFront: false,
  },
  {
    id: 'res_s_4',
    x: 55,
    z: 392,
    w: 22,
    d: 16,
    h: 17,
    wallColor: 0xf0fdf4,
    accentColor: 0x15803d,
    windowPalette: [0xfde047, 0x93c5fd, 0xfca5a5, 0xfde68a],
    facing: 'n',
    hasShopFront: false,
  },
  {
    id: 'res_s_5',
    x: -95,
    z: 392,
    w: 20,
    d: 16,
    h: 19,
    wallColor: 0xfefce8,
    accentColor: 0x854d0e,
    windowPalette: [0xfef08a, 0x38bdf8, 0xfb7185, 0x6ee7b7],
    facing: 'n',
    hasShopFront: false,
  },
  {
    id: 'res_s_6',
    x: 95,
    z: 392,
    w: 20,
    d: 16,
    h: 21,
    wallColor: 0xf1f5f9,
    accentColor: 0x334155,
    windowPalette: [0xfde047, 0x7dd3fc, 0xf9a8d4, 0x4ade80],
    facing: 'n',
    hasShopFront: false,
  },
];

export interface MarketStallSpec {
  id: string;
  x: number;
  z: number;
  yaw: number;
  canopyColorA: number;
  canopyColorB: number;
  goodsType: 'fruit' | 'flowers' | 'bakery' | 'textile' | 'drinks';
}

export const TOWN_MARKET_STALLS: ReadonlyArray<MarketStallSpec> = [
  // West row of NE Market Square (facing East into Market Alley)
  { id: 'stall_1', x: 26, z: 242, yaw: Math.PI * 0.5, canopyColorA: 0xef4444, canopyColorB: 0xffffff, goodsType: 'fruit' },
  { id: 'stall_2', x: 26, z: 254, yaw: Math.PI * 0.5, canopyColorA: 0x16a34a, canopyColorB: 0xfef08a, goodsType: 'flowers' },
  { id: 'stall_3', x: 26, z: 266, yaw: Math.PI * 0.5, canopyColorA: 0x2563eb, canopyColorB: 0xffffff, goodsType: 'bakery' },
  { id: 'stall_4', x: 26, z: 278, yaw: Math.PI * 0.5, canopyColorA: 0xf59e0b, canopyColorB: 0xfffbeb, goodsType: 'drinks' },
  // East row of NE Market Square (facing West into Market Alley)
  { id: 'stall_5', x: 52, z: 242, yaw: -Math.PI * 0.5, canopyColorA: 0xd97706, canopyColorB: 0xffffff, goodsType: 'fruit' },
  { id: 'stall_6', x: 52, z: 254, yaw: -Math.PI * 0.5, canopyColorA: 0xdb2777, canopyColorB: 0xfce7f3, goodsType: 'textile' },
  { id: 'stall_7', x: 52, z: 266, yaw: -Math.PI * 0.5, canopyColorA: 0x0891b2, canopyColorB: 0xffffff, goodsType: 'fruit' },
  { id: 'stall_8', x: 52, z: 278, yaw: -Math.PI * 0.5, canopyColorA: 0x65a30d, canopyColorB: 0xffffff, goodsType: 'flowers' },
  // Roadside market stalls facing Main Ave / South Market plaza
  { id: 'stall_9', x: 13, z: 246, yaw: -Math.PI * 0.5, canopyColorA: 0xe11d48, canopyColorB: 0xffffff, goodsType: 'drinks' },
  { id: 'stall_10', x: 13, z: 274, yaw: -Math.PI * 0.5, canopyColorA: 0x0284c7, canopyColorB: 0xfef08a, goodsType: 'bakery' },
  // South Town roadside stalls
  { id: 'stall_11', x: -129, z: 392, yaw: 0, canopyColorA: 0xef4444, canopyColorB: 0xfef9c3, goodsType: 'fruit' },
  { id: 'stall_12', x: 129, z: 392, yaw: 0, canopyColorA: 0x16a34a, canopyColorB: 0xffffff, goodsType: 'flowers' },
];

export const TOWN_COLLIDERS: ReadonlyArray<TownColliderBox> = [
  // Stadium Stand Colliders (leaving South Gate x in [-13.5, 13.5] wide open!)
  { id: 'stadium_north_stand', xMin: -104, xMax: 104, zMin: -176, zMax: -127 },
  { id: 'stadium_west_stand', xMin: -158, xMax: -127, zMin: -90, zMax: 90 },
  { id: 'stadium_east_pavilion', xMin: 131, xMax: 164, zMin: -66, zMax: 66 },
  { id: 'stadium_south_west_wing', xMin: -90, xMax: -13.5, zMin: 130, zMax: 154 },
  { id: 'stadium_south_east_wing', xMin: 13.5, xMax: 90, zMin: 130, zMax: 154 },
  // Central Town Park Fountain collider
  { id: 'central_park_fountain', xMin: 34.5, xMax: 43.5, zMin: 329, zMax: 338 },
  // Gazebo collider in Central Town Park NE corner
  { id: 'central_park_gazebo', xMin: 56, xMax: 65, zMin: 306, zMax: 315 },
  // All town buildings
  ...TOWN_BUILDINGS.map((b) => ({
    id: b.id,
    xMin: b.x - b.w * 0.5 - 0.35,
    xMax: b.x + b.w * 0.5 + 0.35,
    zMin: b.z - b.d * 0.5 - 0.35,
    zMax: b.z + b.d * 0.5 + 0.35,
  })),
  // Market stall counters
  ...TOWN_MARKET_STALLS.map((s) => ({
    id: s.id,
    xMin: s.x - 2.6,
    xMax: s.x + 2.6,
    zMin: s.z - 2.6,
    zMax: s.z + 2.6,
  })),
];

export function isPointInRect(
  x: number,
  z: number,
  r: { xMin: number; xMax: number; zMin: number; zMax: number },
): boolean {
  return x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax;
}

export function isPositionOnTownRoad(x: number, z: number): boolean {
  for (let i = 0; i < TOWN_ROADS.length; i++) {
    if (isPointInRect(x, z, TOWN_ROADS[i])) return true;
  }
  for (let i = 0; i < TOWN_PARKING_LOTS.length; i++) {
    if (isPointInRect(x, z, TOWN_PARKING_LOTS[i])) return true;
  }
  return false;
}

export function isPositionInMarketOrParkPath(x: number, z: number): boolean {
  // NE market plaza area
  if (x >= 8 && x <= 70 && z >= 234 && z <= 286) return true;
  // Park paved cross paths
  if (x >= 8 && x <= 70 && z >= 330 && z <= 337) return true;
  if (x >= 35.5 && x <= 42.5 && z >= 300 && z <= 367) return true;
  return false;
}

/**
 * Smooth ground elevation at any world (x, z) coordinate across:
 * - Stadium inner 240x240 field (y = 0)
 * - Stadium concourse apron & South Entrance smooth ramp (z = 120..212)
 * - Town roads / parking lots (y = -0.71) & town ground (y = -0.85)
 */
export function getWorldGroundY(x: number, z: number): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);

  // Inside 240x240 grass field / race track
  if (ax <= FIELD_HALF && az <= FIELD_HALF) {
    return 0;
  }

  // Smooth ramp along South Stadium Entrance Corridor (x in [-14, 14], z in [120, 212])
  if (ax <= 14 && z > FIELD_HALF && z <= PARK_HALF) {
    const t = (z - FIELD_HALF) / (PARK_HALF - FIELD_HALF); // 0 at field edge -> 1 at park edge
    return t * TOWN_BOUNDS.roadSurfaceY;
  }

  // Town district (z > 212)
  if (z > PARK_HALF) {
    if (isPositionOnTownRoad(x, z)) {
      return TOWN_BOUNDS.roadSurfaceY;
    }
    if (isPositionInMarketOrParkPath(x, z)) {
      return TOWN_BOUNDS.sidewalkSurfaceY;
    }
    return TOWN_BOUNDS.groundY;
  }

  // Stadium concourse & park apron
  if (ax <= 178 && az <= 178) {
    return -0.35;
  }
  if (ax <= PARK_HALF && az <= PARK_HALF) {
    return -0.85;
  }
  return -0.85;
}
