import {
  BANNER_POST_OFFSET,
  FIELD_HALF,
  PARK_HALF,
  STADIUM_TOWER_OFFSET,
  createTrackCurve,
  getBannerPlacements,
} from '../track/trackLayout';
import { TOWN_PALETTE } from './townSculptor';

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

export const UNIFORM_BLOCK_WIDTH = 44;
export const UNIFORM_BLOCK_DEPTH = 40;

export type TownBlockKind =
  | 'parking'
  | 'market'
  | 'park_fountain'
  | 'park_gazebo'
  | 'pocket_park'
  | 'commercial_res'
  | 'residential';

export interface TownBlockSpec {
  id: string;
  col: number;
  row: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  kind: TownBlockKind;
  pavingStyle: 'cream' | 'sand' | 'cobble' | 'rose' | 'lawn';
}

export const TOWN_BOUNDS = {
  xMin: -180,
  xMax: 180,
  zMin: PARK_HALF, // 212
  zMax: 428,
  groundY: -0.85,
  roadSurfaceY: -0.71,
  sidewalkSurfaceY: -0.64,
} as const;

export const KART_TOWN_SPAWN = {
  x: 7.8,
  z: 296,
  yaw: Math.PI, // Facing North (-Z) along Main Avenue toward the market & stadium gate
} as const;

export const STADIUM_GATE_TRIGGER_Z = 156;
export const STADIUM_GATE_CORRIDOR_HALF_WIDTH = 13.5;

// Wide main avenue (4 lanes) + generous secondary streets + broad neighborhood lanes.
const COL_SPANS: ReadonlyArray<[number, number]> = [
  [-162, -118], // Col 0 (width 44)
  [-110, -66],  // Col 1 (width 44)
  [-54, -10],   // Col 2 (width 44)
  [10, 54],     // Col 3 (width 44)
  [66, 110],    // Col 4 (width 44)
  [118, 162],   // Col 5 (width 44)
];

const ROW_SPANS: ReadonlyArray<[number, number]> = [
  [228, 268], // Row 0 (depth 40)
  [280, 320], // Row 1 (depth 40)
  [328, 368], // Row 2 (depth 40)
  [380, 420], // Row 3 (depth 40)
];

const BLOCK_META: ReadonlyArray<ReadonlyArray<{ kind: TownBlockKind; pavingStyle: TownBlockSpec['pavingStyle'] }>> = [
  // Row 0 (North Market & Stadium Frontage)
  [
    { kind: 'residential', pavingStyle: 'cream' },      // r0 c0
    { kind: 'commercial_res', pavingStyle: 'rose' },    // r0 c1 Corner Patisserie
    { kind: 'parking', pavingStyle: 'sand' },           // r0 c2 Stadium Main Parking
    { kind: 'market', pavingStyle: 'cobble' },          // r0 c3 Farmers' Market Plaza
    { kind: 'parking', pavingStyle: 'sand' },           // r0 c4 East Visitor Parking
    { kind: 'commercial_res', pavingStyle: 'cream' },   // r0 c5 Market Bookshop
  ],
  // Row 1 (Midtown North: Café Row & Botanical Fountain Park flanking Kart Spawn)
  [
    { kind: 'residential', pavingStyle: 'sand' },       // r1 c0
    { kind: 'residential', pavingStyle: 'cream' },      // r1 c1
    { kind: 'commercial_res', pavingStyle: 'rose' },    // r1 c2 Main Ave Café & Bakery
    { kind: 'park_fountain', pavingStyle: 'lawn' },     // r1 c3 Central Botanical Fountain Park
    { kind: 'commercial_res', pavingStyle: 'cream' },   // r1 c4 East Parkside Shops
    { kind: 'residential', pavingStyle: 'sand' },       // r1 c5
  ],
  // Row 2 (Midtown South: Pocket Park, Mart, South Gazebo Park)
  [
    { kind: 'residential', pavingStyle: 'cream' },      // r2 c0
    { kind: 'pocket_park', pavingStyle: 'lawn' },       // r2 c1 West Pocket Clock Park
    { kind: 'commercial_res', pavingStyle: 'cream' },   // r2 c2 Midtown Mart & Residences
    { kind: 'park_gazebo', pavingStyle: 'lawn' },       // r2 c3 South Park & Timber Gazebo
    { kind: 'residential', pavingStyle: 'rose' },       // r2 c4
    { kind: 'residential', pavingStyle: 'cream' },      // r2 c5
  ],
  // Row 3 (South Town Boulevards)
  [
    { kind: 'commercial_res', pavingStyle: 'cobble' },  // r3 c0 West Corner Market & Homes
    { kind: 'residential', pavingStyle: 'sand' },       // r3 c1
    { kind: 'commercial_res', pavingStyle: 'cream' },   // r3 c2 South Avenue Residences
    { kind: 'commercial_res', pavingStyle: 'cobble' },  // r3 c3 South Avenue Market & Homes
    { kind: 'residential', pavingStyle: 'sand' },       // r3 c4
    { kind: 'commercial_res', pavingStyle: 'cream' },   // r3 c5 East Corner Florist & Homes
  ],
];

/**
 * All 24 uniform city blocks (6 columns x 4 rows), every single block strictly 44 x 40 units.
 */
export const TOWN_BLOCKS: ReadonlyArray<TownBlockSpec> = ROW_SPANS.flatMap(([zMin, zMax], row) =>
  COL_SPANS.map(([xMin, xMax], col) => ({
    id: `block_r${row}_c${col}`,
    col,
    row,
    xMin,
    xMax,
    zMin,
    zMax,
    kind: BLOCK_META[row][col].kind,
    pavingStyle: BLOCK_META[row][col].pavingStyle,
  })),
);

/**
 * Broad multi-lane avenues and wide neighborhood lanes separating every uniform block.
 * Main Avenue is a 20-unit-wide 4-lane boulevard; secondary streets are 12 units wide;
 * neighborhood lanes are a generous 8 units wide.
 */
export const TOWN_ROADS: ReadonlyArray<TownRoadRect> = [
  // Central wide Main Avenue connecting town straight through South Gate to track edge
  {
    id: 'main_avenue',
    xMin: -10,
    xMax: 10,
    zMin: 99,
    zMax: 428,
    axis: 'ns',
    lanes: 2,
    isConnector: true,
  },
  // Secondary N-S 2-lane streets (12 units wide)
  {
    id: 'west_shop_street',
    xMin: -66,
    xMax: -54,
    zMin: 216,
    zMax: 428,
    axis: 'ns',
    lanes: 2,
  },
  {
    id: 'east_park_street',
    xMin: 54,
    xMax: 66,
    zMin: 216,
    zMax: 428,
    axis: 'ns',
    lanes: 2,
  },
  // Wide N-S neighborhood lanes (8 units wide)
  {
    id: 'west_cottage_lane',
    xMin: -118,
    xMax: -110,
    zMin: 216,
    zMax: 428,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'east_cottage_lane',
    xMin: 110,
    xMax: 118,
    zMin: 216,
    zMax: 428,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'far_west_lane',
    xMin: -170,
    xMax: -162,
    zMin: 216,
    zMax: 428,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'far_east_lane',
    xMin: 162,
    xMax: 170,
    zMin: 216,
    zMax: 428,
    axis: 'ns',
    lanes: 1,
  },
  // E-W 2-lane streets & wide cross lanes
  {
    id: 'north_ring_road',
    xMin: -170,
    xMax: 170,
    zMin: 216,
    zMax: 228,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'midtown_north_st',
    xMin: -170,
    xMax: 170,
    zMin: 268,
    zMax: 280,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'blossom_alley',
    xMin: -170,
    xMax: 170,
    zMin: 320,
    zMax: 328,
    axis: 'ew',
    lanes: 1,
  },
  {
    id: 'south_market_st',
    xMin: -170,
    xMax: 170,
    zMin: 368,
    zMax: 380,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'outer_south_lane',
    xMin: -170,
    xMax: 170,
    zMin: 420,
    zMax: 428,
    axis: 'ew',
    lanes: 1,
  },
];

export const TOWN_PARKING_LOTS: ReadonlyArray<TownPlazaRect> = [
  // Row 0 Col 2: Stadium Main Parking Lot
  {
    id: 'stadium_main_parking',
    xMin: -51,
    xMax: -13,
    zMin: 230,
    zMax: 266,
    kind: 'parking',
  },
  // Row 0 Col 4: East Market Visitor Parking Lot
  {
    id: 'east_market_parking',
    xMin: 69,
    xMax: 107,
    zMin: 230,
    zMax: 266,
    kind: 'parking',
  },
];

export const TOWN_PARKS: ReadonlyArray<TownPlazaRect> = [
  // Row 1 Col 3: Central Botanical Fountain Park
  {
    id: 'central_botanical_park',
    xMin: 12,
    xMax: 52,
    zMin: 282,
    zMax: 318,
    kind: 'park_path',
  },
  // Row 2 Col 3: South Town Park & Gazebo
  {
    id: 'south_gazebo_park',
    xMin: 12,
    xMax: 52,
    zMin: 330,
    zMax: 366,
    kind: 'park_path',
  },
  // Row 2 Col 1: West Pocket Clock Park
  {
    id: 'west_pocket_park',
    xMin: -108,
    xMax: -68,
    zMin: 330,
    zMax: 366,
    kind: 'park_path',
  },
];

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
  roofStyle: 'mansard' | 'terracotta';
}

const WIN_PALETTE_A = [
  TOWN_PALETTE.windowWarmLit,
  TOWN_PALETTE.windowSkyGlass,
  TOWN_PALETTE.windowRoseGlass,
  TOWN_PALETTE.windowMintGlass,
];
const WIN_PALETTE_B = [
  TOWN_PALETTE.windowAmberGlass,
  TOWN_PALETTE.windowSkyGlass,
  TOWN_PALETTE.windowMintGlass,
  TOWN_PALETTE.windowWarmLit,
];
const WIN_PALETTE_C = [
  TOWN_PALETTE.windowWarmLit,
  TOWN_PALETTE.windowRoseGlass,
  TOWN_PALETTE.windowSkyGlass,
  TOWN_PALETTE.windowAmberGlass,
];

/** Extra scale factor applied to every building so the town reads grand and realistic. */
const BUILDING_HEIGHT_SCALE = 1.18;

/**
 * Helper to generate a clean pair of distinct European townhouses inside any 44 x 40 uniform block.
 */
function makeBlockPair(
  prefix: string,
  colIdx: number,
  rowIdx: number,
  orientation: 'ns-split' | 'ew-split',
  a: Omit<TownBuildingSpec, 'id' | 'x' | 'z' | 'w' | 'd'>,
  b: Omit<TownBuildingSpec, 'id' | 'x' | 'z' | 'w' | 'd'>,
): TownBuildingSpec[] {
  const [xMin, xMax] = COL_SPANS[colIdx];
  const [zMin, zMax] = ROW_SPANS[rowIdx];
  const cx = (xMin + xMax) * 0.5;
  const cz = (zMin + zMax) * 0.5;

  if (orientation === 'ew-split') {
    // Left building + Right building with inner courtyard setback inside the 44x40 block
    return [
      { ...a, id: `${prefix}_a`, x: cx - 10.2, z: cz, w: 16.4, d: 24.0, h: a.h * BUILDING_HEIGHT_SCALE },
      { ...b, id: `${prefix}_b`, x: cx + 10.2, z: cz, w: 16.4, d: 24.0, h: b.h * BUILDING_HEIGHT_SCALE },
    ];
  }
  // North building + South building inside the 44x40 block
  return [
    { ...a, id: `${prefix}_a`, x: cx, z: cz - 9.2, w: 26.0, d: 14.4, h: a.h * BUILDING_HEIGHT_SCALE },
    { ...b, id: `${prefix}_b`, x: cx, z: cz + 9.2, w: 26.0, d: 14.4, h: b.h * BUILDING_HEIGHT_SCALE },
  ];
}

export const TOWN_BUILDINGS: ReadonlyArray<TownBuildingSpec> = [
  // Row 0 Col 0: West Courtyard Residences
  ...makeBlockPair(
    'r0c0',
    0,
    0,
    'ns-split',
    {
      h: 16.5,
      wallColor: TOWN_PALETTE.wallButtercup,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_A,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
    {
      h: 19.5,
      wallColor: TOWN_PALETTE.wallPeriwinkle,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_B,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
  ),
  // Row 0 Col 1: Corner Patisserie & Café Terrace (faces East toward Stadium Parking)
  ...makeBlockPair(
    'r0c1',
    1,
    0,
    'ns-split',
    {
      h: 18.0,
      wallColor: TOWN_PALETTE.wallApricot,
      accentColor: TOWN_PALETTE.parisGreen,
      windowPalette: WIN_PALETTE_C,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningCoral,
      signText: 'PATISSERIE',
      roofStyle: 'mansard',
    },
    {
      h: 15.5,
      wallColor: TOWN_PALETTE.wallMint,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_A,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningMint,
      signText: 'BISTRO',
      roofStyle: 'terracotta',
    },
  ),
  // Row 0 Col 5: Market Bookshop & Residences
  ...makeBlockPair(
    'r0c5',
    5,
    0,
    'ns-split',
    {
      h: 19.0,
      wallColor: TOWN_PALETTE.wallCoral,
      accentColor: TOWN_PALETTE.parisGreen,
      windowPalette: WIN_PALETTE_B,
      facing: 'w',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningGold,
      signText: 'BOOKSHOP',
      roofStyle: 'mansard',
    },
    {
      h: 16.0,
      wallColor: TOWN_PALETTE.wallCreamTrim,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_A,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  // Row 1 Col 0
  ...makeBlockPair(
    'r1c0',
    0,
    1,
    'ew-split',
    {
      h: 17.5,
      wallColor: TOWN_PALETTE.wallSage,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_C,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
    {
      h: 20.5,
      wallColor: TOWN_PALETTE.wallOchre,
      accentColor: TOWN_PALETTE.shutterRose,
      windowPalette: WIN_PALETTE_A,
      facing: 'e',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  // Row 1 Col 1
  ...makeBlockPair(
    'r1c1',
    1,
    1,
    'ew-split',
    {
      h: 18.5,
      wallColor: TOWN_PALETTE.wallLavender,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_B,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
    {
      h: 16.5,
      wallColor: TOWN_PALETTE.wallButtercup,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_A,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningCobalt,
      roofStyle: 'mansard',
    },
  ),
  // Row 1 Col 2: Main Ave Café & Bakery Row (immediately West of Kart Spawn!)
  ...makeBlockPair(
    'r1c2',
    2,
    1,
    'ns-split',
    {
      h: 19.5,
      wallColor: TOWN_PALETTE.wallApricot,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_A,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningCoral,
      signText: 'CAFE',
      roofStyle: 'mansard',
    },
    {
      h: 17.5,
      wallColor: TOWN_PALETTE.wallCreamTrim,
      accentColor: TOWN_PALETTE.parisGreen,
      windowPalette: WIN_PALETTE_C,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningMint,
      signText: 'BAKERY',
      roofStyle: 'terracotta',
    },
  ),
  // Row 1 Col 4: East Parkside Gelato & Residences
  ...makeBlockPair(
    'r1c4',
    4,
    1,
    'ns-split',
    {
      h: 17.0,
      wallColor: TOWN_PALETTE.wallPeriwinkle,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_B,
      facing: 'w',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningGold,
      signText: 'GELATO',
      roofStyle: 'terracotta',
    },
    {
      h: 20.5,
      wallColor: TOWN_PALETTE.wallCoral,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_A,
      facing: 'w',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
  ),
  // Row 1 Col 5
  ...makeBlockPair(
    'r1c5',
    5,
    1,
    'ew-split',
    {
      h: 16.5,
      wallColor: TOWN_PALETTE.wallMint,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_C,
      facing: 'w',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
    {
      h: 19.0,
      wallColor: TOWN_PALETTE.wallButtercup,
      accentColor: TOWN_PALETTE.shutterRose,
      windowPalette: WIN_PALETTE_A,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  // Row 2 Col 0
  ...makeBlockPair(
    'r2c0',
    0,
    2,
    'ns-split',
    {
      h: 18.0,
      wallColor: TOWN_PALETTE.wallCoral,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_B,
      facing: 'e',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
    {
      h: 16.0,
      wallColor: TOWN_PALETTE.wallLavender,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_A,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
  ),
  // Row 2 Col 2: Midtown Mart & Townhouses
  ...makeBlockPair(
    'r2c2',
    2,
    2,
    'ns-split',
    {
      h: 20.0,
      wallColor: TOWN_PALETTE.wallPeriwinkle,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_A,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningCobalt,
      signText: 'MART',
      roofStyle: 'mansard',
    },
    {
      h: 17.5,
      wallColor: TOWN_PALETTE.wallOchre,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_C,
      facing: 'e',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  // Row 2 Col 4
  ...makeBlockPair(
    'r2c4',
    4,
    2,
    'ew-split',
    {
      h: 18.5,
      wallColor: TOWN_PALETTE.wallApricot,
      accentColor: TOWN_PALETTE.shutterRose,
      windowPalette: WIN_PALETTE_B,
      facing: 'w',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
    {
      h: 16.5,
      wallColor: TOWN_PALETTE.wallSage,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_A,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  // Row 2 Col 5
  ...makeBlockPair(
    'r2c5',
    5,
    2,
    'ns-split',
    {
      h: 21.0,
      wallColor: TOWN_PALETTE.wallCreamTrim,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_C,
      facing: 'w',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
    {
      h: 17.0,
      wallColor: TOWN_PALETTE.wallMint,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_A,
      facing: 's',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  // Row 3 Col 0..5 South Boulevards
  ...makeBlockPair(
    'r3c0',
    0,
    3,
    'ew-split',
    {
      h: 17.5,
      wallColor: TOWN_PALETTE.wallButtercup,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_A,
      facing: 'n',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningCoral,
      roofStyle: 'terracotta',
    },
    {
      h: 15.5,
      wallColor: TOWN_PALETTE.wallPeriwinkle,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_B,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'mansard',
    },
  ),
  ...makeBlockPair(
    'r3c1',
    1,
    3,
    'ew-split',
    {
      h: 18.0,
      wallColor: TOWN_PALETTE.wallCoral,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_C,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
    {
      h: 16.5,
      wallColor: TOWN_PALETTE.wallCreamTrim,
      accentColor: TOWN_PALETTE.shutterRose,
      windowPalette: WIN_PALETTE_A,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  ...makeBlockPair(
    'r3c2',
    2,
    3,
    'ew-split',
    {
      h: 17.0,
      wallColor: TOWN_PALETTE.wallSage,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_B,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
    {
      h: 19.0,
      wallColor: TOWN_PALETTE.wallApricot,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_A,
      facing: 'e',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningPlum,
      signText: 'ATELIER',
      roofStyle: 'mansard',
    },
  ),
  ...makeBlockPair(
    'r3c3',
    3,
    3,
    'ew-split',
    {
      h: 18.5,
      wallColor: TOWN_PALETTE.wallOchre,
      accentColor: TOWN_PALETTE.parisGreen,
      windowPalette: WIN_PALETTE_C,
      facing: 'w',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningGold,
      signText: 'FLORIST',
      roofStyle: 'mansard',
    },
    {
      h: 16.5,
      wallColor: TOWN_PALETTE.wallMint,
      accentColor: TOWN_PALETTE.shutterOlive,
      windowPalette: WIN_PALETTE_A,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  ...makeBlockPair(
    'r3c4',
    4,
    3,
    'ew-split',
    {
      h: 17.5,
      wallColor: TOWN_PALETTE.wallLavender,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_B,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
    {
      h: 19.5,
      wallColor: TOWN_PALETTE.wallCoral,
      accentColor: TOWN_PALETTE.shutterTeal,
      windowPalette: WIN_PALETTE_A,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
  ...makeBlockPair(
    'r3c5',
    5,
    3,
    'ew-split',
    {
      h: 18.0,
      wallColor: TOWN_PALETTE.wallButtercup,
      accentColor: TOWN_PALETTE.shutterRose,
      windowPalette: WIN_PALETTE_C,
      facing: 'n',
      hasShopFront: true,
      awningColor: TOWN_PALETTE.awningMint,
      roofStyle: 'mansard',
    },
    {
      h: 16.0,
      wallColor: TOWN_PALETTE.wallPeriwinkle,
      accentColor: TOWN_PALETTE.shutterCobalt,
      windowPalette: WIN_PALETTE_B,
      facing: 'n',
      hasShopFront: false,
      roofStyle: 'terracotta',
    },
  ),
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

/**
 * Market stalls arranged inside the uniform Row 0 Col 3 Market Plaza (x: 10..54, z: 228..268)
 * plus two South Plaza roadside stalls inside Row 3.
 */
export const TOWN_MARKET_STALLS: ReadonlyArray<MarketStallSpec> = [
  // West row inside Market Plaza (facing East into center promenade x = 32)
  { id: 'stall_1', x: 22, z: 235.5, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCoral, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_2', x: 22, z: 244.0, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningMint, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'flowers' },
  { id: 'stall_3', x: 22, z: 252.5, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCobalt, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'bakery' },
  { id: 'stall_4', x: 22, z: 261.0, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningGold, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'drinks' },
  // East row inside Market Plaza (facing West into center promenade)
  { id: 'stall_5', x: 42, z: 235.5, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningGold, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_6', x: 42, z: 244.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningPlum, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'textile' },
  { id: 'stall_7', x: 42, z: 252.5, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCobalt, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_8', x: 42, z: 261.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningMint, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'flowers' },
  // Main Avenue front edge stalls inside Market Plaza facing West toward Main Ave
  { id: 'stall_9', x: 14.7, z: 240.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCoral, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'drinks' },
  { id: 'stall_10', x: 14.7, z: 256.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCobalt, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'bakery' },
  // South Plaza roadside stalls inside Row 3 Col 2 & Col 3 plazas
  { id: 'stall_11', x: -32, z: 387.5, yaw: 0, canopyColorA: TOWN_PALETTE.awningCoral, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_12', x: 32, z: 387.5, yaw: 0, canopyColorA: TOWN_PALETTE.awningMint, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'flowers' },
];

export interface TreeSpotSpec {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  kind: 'oak' | 'sakura' | 'ginkgo';
}

/** Organic street & park tree placements (shared by rendering and solid collision). */
export const TOWN_TREE_SPOTS: ReadonlyArray<TreeSpotSpec> = [
  // Botanical Fountain Park (Row 1 Col 3) corners
  { x: 17, z: 286, scale: 1.02, yaw: 0.4, kind: 'sakura' },
  { x: 47, z: 286, scale: 0.96, yaw: 1.5, kind: 'oak' },
  { x: 17, z: 314, scale: 1.0, yaw: 2.3, kind: 'ginkgo' },
  { x: 47, z: 314, scale: 1.05, yaw: 0.9, kind: 'sakura' },
  // South Gazebo Park (Row 2 Col 3)
  { x: 17, z: 334.5, scale: 0.98, yaw: 1.1, kind: 'oak' },
  { x: 47, z: 334.5, scale: 0.95, yaw: 2.7, kind: 'ginkgo' },
  { x: 17, z: 362.5, scale: 1.04, yaw: 0.2, kind: 'sakura' },
  { x: 47, z: 362.5, scale: 1.0, yaw: 1.9, kind: 'oak' },
  // West Pocket Park (Row 2 Col 1)
  { x: -102.5, z: 334.5, scale: 0.95, yaw: 0.8, kind: 'sakura' },
  { x: -73.5, z: 334.5, scale: 1.0, yaw: 2.1, kind: 'oak' },
  { x: -102.5, z: 362.5, scale: 0.96, yaw: 1.4, kind: 'ginkgo' },
  { x: -73.5, z: 362.5, scale: 1.02, yaw: 2.9, kind: 'oak' },
  // Courtyard & Avenue Street Trees
  { x: -126.5, z: 250, scale: 0.92, yaw: 0.6, kind: 'sakura' },
  { x: -88, z: 250, scale: 0.9, yaw: 1.7, kind: 'ginkgo' },
  { x: 126.5, z: 250, scale: 0.94, yaw: 2.4, kind: 'oak' },
  { x: 88, z: 300, scale: 0.92, yaw: 0.5, kind: 'sakura' },
  { x: 88, z: 348, scale: 0.95, yaw: 1.8, kind: 'oak' },
  { x: -126.5, z: 348, scale: 0.92, yaw: 2.2, kind: 'ginkgo' },
  { x: -126.5, z: 400, scale: 0.96, yaw: 0.9, kind: 'oak' },
  { x: 126.5, z: 400, scale: 0.98, yaw: 2.6, kind: 'sakura' },
];

export interface BenchSpotSpec {
  x: number;
  z: number;
  yaw: number;
}

/** Curved-slat park bench placements (shared by rendering and solid collision). */
export const TOWN_BENCH_SPOTS: ReadonlyArray<BenchSpotSpec> = [
  { x: 25.7, z: 296.8, yaw: Math.PI * 0.25 },
  { x: 38.3, z: 296.8, yaw: -Math.PI * 0.25 },
  { x: 25.7, z: 309.2, yaw: Math.PI * 0.75 },
  { x: 38.3, z: 309.2, yaw: -Math.PI * 0.75 },
  { x: 19, z: 300.0, yaw: 0 },
  { x: 45, z: 300.0, yaw: 0 },
  { x: 24, z: 343.0, yaw: Math.PI * 0.5 },
  { x: 40, z: 354.0, yaw: -Math.PI * 0.5 },
  { x: -81.5, z: 344.0, yaw: Math.PI * 0.5 },
  { x: -93.5, z: 353.0, yaw: -Math.PI * 0.5 },
];

export interface CartSpotSpec {
  x: number;
  z: number;
  yaw: number;
  canopyColor: number;
}

/** Market vendor push-cart placements (shared by rendering and solid collision). */
export const TOWN_CART_SPOTS: ReadonlyArray<CartSpotSpec> = [
  { x: 32, z: 239.5, yaw: 0.25, canopyColor: TOWN_PALETTE.awningCoral },
  { x: 32, z: 257.0, yaw: -0.35, canopyColor: TOWN_PALETTE.awningCobalt },
  { x: 48.7, z: 248.0, yaw: -Math.PI * 0.5, canopyColor: TOWN_PALETTE.awningGold },
];

export interface PlanterSpotSpec {
  x: number;
  z: number;
  tone: 'sage' | 'sunlit';
}

/** Brick street planters along Main Avenue & side streets (solid). */
export const TOWN_PLANTER_SPOTS: ReadonlyArray<PlanterSpotSpec> = [
  { x: -11.7, z: 234, tone: 'sunlit' },
  { x: 11.7, z: 234, tone: 'sage' },
  { x: -11.7, z: 262, tone: 'sage' },
  { x: 11.7, z: 262, tone: 'sunlit' },
  { x: 11.7, z: 280, tone: 'sage' },
  { x: 11.7, z: 308, tone: 'sunlit' },
  { x: -11.7, z: 308, tone: 'sage' },
  { x: -11.7, z: 328, tone: 'sunlit' },
  { x: 11.7, z: 328, tone: 'sage' },
  { x: -11.7, z: 350, tone: 'sage' },
  { x: 11.7, z: 350, tone: 'sunlit' },
  { x: -11.7, z: 376, tone: 'sunlit' },
  { x: 11.7, z: 376, tone: 'sage' },
  { x: -11.7, z: 398, tone: 'sage' },
  { x: 11.7, z: 398, tone: 'sunlit' },
];

const _bannerCurve = createTrackCurve();
const _banners = getBannerPlacements(_bannerCurve);
const _bannerPostColliders: TownColliderBox[] = (['start', 'finish'] as const).flatMap((key) => {
  const placement = _banners[key];
  return ([-1, 1] as const).map((side) => {
    const px = placement.position.x + placement.normal.x * side * BANNER_POST_OFFSET;
    const pz = placement.position.z + placement.normal.z * side * BANNER_POST_OFFSET;
    return {
      id: `banner_${key}_post_${side < 0 ? 'inner' : 'outer'}`,
      xMin: px - 0.65,
      xMax: px + 0.65,
      zMin: pz - 0.65,
      zMax: pz + 0.65,
    };
  });
});

const _floodlightColliders: TownColliderBox[] = (
  [
    [-STADIUM_TOWER_OFFSET, -STADIUM_TOWER_OFFSET, 'nw'],
    [STADIUM_TOWER_OFFSET, -STADIUM_TOWER_OFFSET, 'ne'],
    [-STADIUM_TOWER_OFFSET, STADIUM_TOWER_OFFSET, 'sw'],
    [STADIUM_TOWER_OFFSET, STADIUM_TOWER_OFFSET, 'se'],
  ] as const
).map(([tx, tz, tag]) => ({
  id: `floodlight_tower_${tag}`,
  xMin: tx - 3.5,
  xMax: tx + 3.5,
  zMin: tz - 3.5,
  zMax: tz + 3.5,
}));

export const STADIUM_CONCOURSE_HALF = 178;
export const STADIUM_CONCOURSE_Y = -0.35;

export const TOWN_COLLIDERS: ReadonlyArray<TownColliderBox> = [
  // Stadium Stand Colliders (leaving wide South Gate x in [-13.5, 13.5] open!)
  { id: 'stadium_north_stand', xMin: -104, xMax: 104, zMin: -176, zMax: -127 },
  { id: 'stadium_west_stand', xMin: -158, xMax: -127, zMin: -90, zMax: 90 },
  { id: 'stadium_east_pavilion', xMin: 131, xMax: 164, zMin: -66, zMax: 66 },
  { id: 'stadium_south_west_wing', xMin: -90, xMax: -13.5, zMin: 130, zMax: 154 },
  { id: 'stadium_south_east_wing', xMin: 13.5, xMax: 90, zMin: 130, zMax: 154 },
  // South Stadium Entrance Archway Piers (x = +-14.2, z = 150.2)
  { id: 'stadium_south_arch_west', xMin: -15.6, xMax: -12.8, zMin: 148.0, zMax: 152.4 },
  { id: 'stadium_south_arch_east', xMin: 12.8, xMax: 15.6, zMin: 148.0, zMax: 152.4 },
  // Town Welcome Archway Piers at z = PARK_HALF (212), clear of wide Main Ave [-10, 10]
  { id: 'town_welcome_arch_west', xMin: -13.2, xMax: -10.8, zMin: PARK_HALF - 1.2, zMax: PARK_HALF + 1.2 },
  { id: 'town_welcome_arch_east', xMin: 10.8, xMax: 13.2, zMin: PARK_HALF - 1.2, zMax: PARK_HALF + 1.2 },
  // Overhead START & FINISH Gantry Posts (strictly outside asphalt track edges)
  ..._bannerPostColliders,
  // 4 Corner Floodlight Towers
  ..._floodlightColliders,
  // Stadium Scoreboard & Timing Display Pylon
  { id: 'stadium_scoreboard_nw', xMin: -131.5, xMax: -116.5, zMin: -149.5, zMax: -134.5 },
  { id: 'stadium_timing_pylon', xMin: 133.8, xMax: 138.2, zMin: 81.8, zMax: 86.2 },
  // Town Kiosks, ATMs & Bus Shelter (all on sidewalks clear of the wide avenues)
  { id: 'parking_ticket_kiosk', xMin: -14.1, xMax: -11.3, zMin: 246.4, zMax: 249.6 },
  { id: 'atm_kiosk_east', xMin: 11.9, xMax: 13.5, zMin: 247.2, zMax: 248.8 },
  { id: 'atm_kiosk_west', xMin: -13.5, xMax: -11.9, zMin: 282.7, zMax: 284.3 },
  { id: 'west_bus_shelter', xMin: -53.9, xMax: -51.7, zMin: 345.2, zMax: 350.8 },
  // Central Botanical Fountain Park (Row 1 Col 3 center: x=32, z=300)
  { id: 'central_park_fountain', xMin: 27.3, xMax: 36.7, zMin: 295.3, zMax: 304.7 },
  // South Park Timber Gazebo (Row 2 Col 3 center: x=32, z=348)
  { id: 'south_park_gazebo', xMin: 27.5, xMax: 36.5, zMin: 343.5, zMax: 352.5 },
  // West Pocket Park Clock Obelisk (Row 2 Col 1 center: x=-88, z=348)
  { id: 'west_pocket_obelisk', xMin: -90.2, xMax: -85.8, zMin: 345.8, zMax: 350.2 },
  // All sculpted townhouses & shops
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
  // Street trees are solid: vehicles and pedestrians cannot drive through trunks
  ...TOWN_TREE_SPOTS.map((t, i) => ({
    id: `tree_${i}`,
    xMin: t.x - 0.55,
    xMax: t.x + 0.55,
    zMin: t.z - 0.55,
    zMax: t.z + 0.55,
  })),
  // Park benches are solid
  ...TOWN_BENCH_SPOTS.map((b, i) => ({
    id: `bench_${i}`,
    xMin: b.x - 1.45,
    xMax: b.x + 1.45,
    zMin: b.z - 0.75,
    zMax: b.z + 0.75,
  })),
  // Market vendor carts are solid
  ...TOWN_CART_SPOTS.map((c, i) => ({
    id: `cart_${i}`,
    xMin: c.x - 1.1,
    xMax: c.x + 1.1,
    zMin: c.z - 0.85,
    zMax: c.z + 0.85,
  })),
  // Brick street planters are solid
  ...TOWN_PLANTER_SPOTS.map((p, i) => ({
    id: `planter_${i}`,
    xMin: p.x - 0.7,
    xMax: p.x + 0.7,
    zMin: p.z - 0.7,
    zMax: p.z + 0.7,
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
  // Market Plaza (Row 0 Col 3)
  if (x >= 10 && x <= 54 && z >= 228 && z <= 268) return true;
  // Botanical Fountain Park cross paths (Row 1 Col 3)
  if (x >= 29.5 && x <= 34.5 && z >= 282 && z <= 318) return true;
  if (x >= 12 && x <= 52 && z >= 297.5 && z <= 302.5) return true;
  // South Gazebo Park cross paths (Row 2 Col 3)
  if (x >= 29.5 && x <= 34.5 && z >= 328 && z <= 368) return true;
  if (x >= 12 && x <= 52 && z >= 345.5 && z <= 350.5) return true;
  // West Pocket Park cross paths (Row 2 Col 1)
  if (x >= -90.5 && x <= -85.5 && z >= 328 && z <= 368) return true;
  if (x >= -108 && x <= -68 && z >= 345.5 && z <= 350.5) return true;
  return false;
}

/**
 * True when (x, z) is over turf/grass. Everything else (roads, parking lots,
 * block sidewalks, market plaza, park stone paths, concourse apron, connector
 * ramp corridor) is paved and does NOT slow vehicles — only grass does.
 */
export function isPositionOnGrass(x: number, z: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);

  // Stadium infield: everything that is not the asphalt circuit is turf
  if (ax <= FIELD_HALF && az <= FIELD_HALF) {
    return true;
  }

  // Stadium concourse apron & entrance plaza are paved
  if (ax <= STADIUM_CONCOURSE_HALF && az <= STADIUM_CONCOURSE_HALF) {
    return false;
  }

  // Wide sloped connector corridor between stadium and town is paved
  if (ax <= 11 && z > FIELD_HALF && z <= PARK_HALF) {
    return false;
  }

  if (z > PARK_HALF) {
    if (isPositionOnTownRoad(x, z)) return false;

    // Park lawns are grass, except their stone cross paths
    for (let i = 0; i < TOWN_PARKS.length; i++) {
      const park = TOWN_PARKS[i];
      if (isPointInRect(x, z, park)) {
        return !isPositionInMarketOrParkPath(x, z);
      }
    }

    // Uniform block pads (sidewalks, plazas, market square) are paved
    for (let i = 0; i < TOWN_BLOCKS.length; i++) {
      if (isPointInRect(x, z, TOWN_BLOCKS[i])) return false;
    }

    if (isPositionInMarketOrParkPath(x, z)) return false;

    return true;
  }

  // Landscaped outer lawn between the stadium apron and the town gate
  return true;
}

/**
 * Smooth ground elevation at any world (x, z) coordinate across:
 * - Stadium inner 240x240 field (y = 0)
 * - Stadium concourse apron & South Entrance smooth ramp (z = 120..212)
 * - Town roads / parking lots (y = -0.71) & uniform block sidewalks (y = -0.64)
 */
export function getWorldGroundY(x: number, z: number): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);

  if (ax <= FIELD_HALF && az <= FIELD_HALF) {
    return 0;
  }

  if (ax <= 14 && z > FIELD_HALF && z <= PARK_HALF) {
    const t = (z - FIELD_HALF) / (PARK_HALF - FIELD_HALF);
    return t * TOWN_BOUNDS.roadSurfaceY;
  }

  if (z > PARK_HALF) {
    if (isPositionOnTownRoad(x, z)) {
      return TOWN_BOUNDS.roadSurfaceY;
    }
    for (let i = 0; i < TOWN_BLOCKS.length; i++) {
      if (isPointInRect(x, z, TOWN_BLOCKS[i])) {
        return TOWN_BOUNDS.sidewalkSurfaceY;
      }
    }
    return TOWN_BOUNDS.groundY;
  }

  if (ax <= STADIUM_CONCOURSE_HALF && az <= STADIUM_CONCOURSE_HALF) {
    return STADIUM_CONCOURSE_Y;
  }
  return TOWN_BOUNDS.groundY;
}

/**
 * Samples local ground pitch (positive = nose up) and roll (positive = right side down)
 * along a vehicle's heading `yaw` so vehicles align naturally to ramps and curbs.
 */
export function getWorldGroundSlope(
  x: number,
  z: number,
  yaw: number,
  wheelbaseHalf = 1.6,
  trackHalf = 1.05,
): { pitch: number; roll: number } {
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  const sideX = Math.cos(yaw);
  const sideZ = -Math.sin(yaw);

  const yFront = getWorldGroundY(x + fwdX * wheelbaseHalf, z + fwdZ * wheelbaseHalf);
  const yRear = getWorldGroundY(x - fwdX * wheelbaseHalf, z - fwdZ * wheelbaseHalf);
  const yLeft = getWorldGroundY(x + sideX * trackHalf, z + sideZ * trackHalf);
  const yRight = getWorldGroundY(x - sideX * trackHalf, z - sideZ * trackHalf);

  // In Three.js local +Z forward, negative rotation.x pitches nose (+Z) upward
  const pitch = -Math.atan2(yFront - yRear, wheelbaseHalf * 2);
  const roll = Math.atan2(yLeft - yRight, trackHalf * 2);
  return {
    pitch: Math.max(-0.18, Math.min(0.18, pitch)),
    roll: Math.max(-0.14, Math.min(0.14, roll)),
  };
}
