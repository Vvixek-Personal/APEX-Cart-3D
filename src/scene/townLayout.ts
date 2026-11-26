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
  zMax: 424,
  groundY: -0.85,
  roadSurfaceY: -0.71,
  sidewalkSurfaceY: -0.64,
} as const;

export const KART_TOWN_SPAWN = {
  x: 2.25,
  z: 294,
  yaw: Math.PI, // Facing North (-Z) along Main Avenue toward the market & stadium gate
} as const;

export const STADIUM_GATE_TRIGGER_Z = 156;
export const STADIUM_GATE_CORRIDOR_HALF_WIDTH = 13.5;

const COL_SPANS: ReadonlyArray<[number, number]> = [
  [-148.5, -104.5], // Col 0 (width 44)
  [-99.0, -55.0],   // Col 1 (width 44)
  [-48.5, -4.5],    // Col 2 (width 44)
  [4.5, 48.5],      // Col 3 (width 44)
  [55.0, 99.0],     // Col 4 (width 44)
  [104.5, 148.5],   // Col 5 (width 44)
];

const ROW_SPANS: ReadonlyArray<[number, number]> = [
  [226.0, 266.0], // Row 0 (depth 40)
  [273.0, 313.0], // Row 1 (depth 40)
  [318.5, 358.5], // Row 2 (depth 40)
  [365.5, 405.5], // Row 3 (depth 40)
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
 * Small multi-lane streets and narrow neighborhood alleys separating every uniform block.
 */
export const TOWN_ROADS: ReadonlyArray<TownRoadRect> = [
  // Central 2-lane Main Avenue connecting town straight through South Gate to track edge
  {
    id: 'main_avenue',
    xMin: -4.5,
    xMax: 4.5,
    zMin: 99,
    zMax: 411.5,
    axis: 'ns',
    lanes: 2,
    isConnector: true,
  },
  // Secondary N-S 2-lane streets (6.5 units wide)
  {
    id: 'west_shop_street',
    xMin: -55.0,
    xMax: -48.5,
    zMin: 218.0,
    zMax: 411.5,
    axis: 'ns',
    lanes: 2,
  },
  {
    id: 'east_park_street',
    xMin: 48.5,
    xMax: 55.0,
    zMin: 218.0,
    zMax: 411.5,
    axis: 'ns',
    lanes: 2,
  },
  // Narrow N-S neighborhood alleys / lanes (5.5 units wide)
  {
    id: 'west_cottage_lane',
    xMin: -104.5,
    xMax: -99.0,
    zMin: 218.0,
    zMax: 411.5,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'east_cottage_lane',
    xMin: 99.0,
    xMax: 104.5,
    zMin: 218.0,
    zMax: 411.5,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'far_west_lane',
    xMin: -154.0,
    xMax: -148.5,
    zMin: 218.0,
    zMax: 411.5,
    axis: 'ns',
    lanes: 1,
  },
  {
    id: 'far_east_lane',
    xMin: 148.5,
    xMax: 154.0,
    zMin: 218.0,
    zMax: 411.5,
    axis: 'ns',
    lanes: 1,
  },
  // E-W 2-lane streets & narrow cross alleys
  {
    id: 'north_ring_road',
    xMin: -154.0,
    xMax: 154.0,
    zMin: 218.0,
    zMax: 226.0,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'midtown_north_st',
    xMin: -154.0,
    xMax: 154.0,
    zMin: 266.0,
    zMax: 273.0,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'blossom_alley',
    xMin: -154.0,
    xMax: 154.0,
    zMin: 313.0,
    zMax: 318.5,
    axis: 'ew',
    lanes: 1,
  },
  {
    id: 'south_market_st',
    xMin: -154.0,
    xMax: 154.0,
    zMin: 358.5,
    zMax: 365.5,
    axis: 'ew',
    lanes: 2,
  },
  {
    id: 'outer_south_lane',
    xMin: -154.0,
    xMax: 154.0,
    zMin: 405.5,
    zMax: 411.5,
    axis: 'ew',
    lanes: 1,
  },
];

export const TOWN_PARKING_LOTS: ReadonlyArray<TownPlazaRect> = [
  // Row 0 Col 2: Stadium Main Parking Lot
  {
    id: 'stadium_main_parking',
    xMin: -46.5,
    xMax: -6.5,
    zMin: 228.0,
    zMax: 264.0,
    kind: 'parking',
  },
  // Row 0 Col 4: East Market Visitor Parking Lot
  {
    id: 'east_market_parking',
    xMin: 57.0,
    xMax: 97.0,
    zMin: 228.0,
    zMax: 264.0,
    kind: 'parking',
  },
];

export const TOWN_PARKS: ReadonlyArray<TownPlazaRect> = [
  // Row 1 Col 3: Central Botanical Fountain Park
  {
    id: 'central_botanical_park',
    xMin: 6.5,
    xMax: 46.5,
    zMin: 275.0,
    zMax: 311.0,
    kind: 'park_path',
  },
  // Row 2 Col 3: South Town Park & Gazebo
  {
    id: 'south_gazebo_park',
    xMin: 6.5,
    xMax: 46.5,
    zMin: 320.5,
    zMax: 356.5,
    kind: 'park_path',
  },
  // Row 2 Col 1: West Pocket Clock Park
  {
    id: 'west_pocket_park',
    xMin: -97.0,
    xMax: -57.0,
    zMin: 320.5,
    zMax: 356.5,
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
      { id: `${prefix}_a`, x: cx - 10.2, z: cz, w: 16.4, d: 24.0, ...a },
      { id: `${prefix}_b`, x: cx + 10.2, z: cz, w: 16.4, d: 24.0, ...b },
    ];
  }
  // North building + South building inside the 44x40 block
  return [
    { id: `${prefix}_a`, x: cx, z: cz - 9.2, w: 26.0, d: 14.4, ...a },
    { id: `${prefix}_b`, x: cx, z: cz + 9.2, w: 26.0, d: 14.4, ...b },
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
      roofStyle: 'mansard',
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
      roofStyle: 'mansard',
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
 * 10 market stalls neatly arranged inside the uniform Row 0 Col 3 Market Plaza (x: 4.5..48.5, z: 226..266)
 * plus 2 East Visitor Parking annex flower/fruit stands inside Row 0 Col 4 corner.
 */
export const TOWN_MARKET_STALLS: ReadonlyArray<MarketStallSpec> = [
  // West row inside Market Plaza (facing East into center promenade x = 26.5)
  { id: 'stall_1', x: 16.5, z: 233.5, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCoral, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_2', x: 16.5, z: 242.0, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningMint, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'flowers' },
  { id: 'stall_3', x: 16.5, z: 250.5, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCobalt, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'bakery' },
  { id: 'stall_4', x: 16.5, z: 259.0, yaw: Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningGold, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'drinks' },
  // East row inside Market Plaza (facing West into center promenade)
  { id: 'stall_5', x: 36.5, z: 233.5, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningGold, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_6', x: 36.5, z: 242.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningPlum, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'textile' },
  { id: 'stall_7', x: 36.5, z: 250.5, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCobalt, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_8', x: 36.5, z: 259.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningMint, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'flowers' },
  // Main Avenue front edge stalls inside Market Plaza facing West toward Main Ave
  { id: 'stall_9', x: 9.2, z: 238.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCoral, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'drinks' },
  { id: 'stall_10', x: 9.2, z: 254.0, yaw: -Math.PI * 0.5, canopyColorA: TOWN_PALETTE.awningCobalt, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'bakery' },
  // South Plaza roadside stalls inside Row 3 Col 2 & Col 3 plazas
  { id: 'stall_11', x: -26.5, z: 373.0, yaw: 0, canopyColorA: TOWN_PALETTE.awningCoral, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'fruit' },
  { id: 'stall_12', x: 26.5, z: 373.0, yaw: 0, canopyColorA: TOWN_PALETTE.awningMint, canopyColorB: TOWN_PALETTE.awningCream, goodsType: 'flowers' },
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
  // Stadium Stand Colliders (leaving South Gate x in [-13.5, 13.5] wide open!)
  { id: 'stadium_north_stand', xMin: -104, xMax: 104, zMin: -176, zMax: -127 },
  { id: 'stadium_west_stand', xMin: -158, xMax: -127, zMin: -90, zMax: 90 },
  { id: 'stadium_east_pavilion', xMin: 131, xMax: 164, zMin: -66, zMax: 66 },
  { id: 'stadium_south_west_wing', xMin: -90, xMax: -13.5, zMin: 130, zMax: 154 },
  { id: 'stadium_south_east_wing', xMin: 13.5, xMax: 90, zMin: 130, zMax: 154 },
  // South Stadium Entrance Archway Piers (x = +-14.2, z = 150.2)
  { id: 'stadium_south_arch_west', xMin: -15.6, xMax: -12.8, zMin: 148.0, zMax: 152.4 },
  { id: 'stadium_south_arch_east', xMin: 12.8, xMax: 15.6, zMin: 148.0, zMax: 152.4 },
  // Town Welcome Archway Piers at z = PARK_HALF (212), clear of Main Ave [-4.5, 4.5]
  { id: 'town_welcome_arch_west', xMin: -7.7, xMax: -5.3, zMin: PARK_HALF - 1.2, zMax: PARK_HALF + 1.2 },
  { id: 'town_welcome_arch_east', xMin: 5.3, xMax: 7.7, zMin: PARK_HALF - 1.2, zMax: PARK_HALF + 1.2 },
  // Overhead START & FINISH Gantry Posts (strictly outside asphalt track edges)
  ..._bannerPostColliders,
  // 4 Corner Floodlight Towers
  ..._floodlightColliders,
  // Stadium Scoreboard & Timing Display Pylon
  { id: 'stadium_scoreboard_nw', xMin: -131.5, xMax: -116.5, zMin: -149.5, zMax: -134.5 },
  { id: 'stadium_timing_pylon', xMin: 133.8, xMax: 138.2, zMin: 81.8, zMax: 86.2 },
  // Town Kiosks, ATMs & Bus Shelter
  { id: 'parking_ticket_kiosk', xMin: -8.6, xMax: -5.8, zMin: 244.4, zMax: 247.6 },
  { id: 'atm_kiosk_east', xMin: 6.4, xMax: 8.0, zMin: 245.2, zMax: 246.8 },
  { id: 'atm_kiosk_west', xMin: -8.0, xMax: -6.4, zMin: 275.7, zMax: 277.3 },
  { id: 'west_bus_shelter', xMin: -48.2, xMax: -46.2, zMin: 335.7, zMax: 341.3 },
  // Central Botanical Fountain Park (Row 1 Col 3 center: x=26.5, z=293)
  { id: 'central_park_fountain', xMin: 21.8, xMax: 31.2, zMin: 288.3, zMax: 297.7 },
  // South Park Timber Gazebo (Row 2 Col 3 center: x=26.5, z=338.5)
  { id: 'south_park_gazebo', xMin: 22.0, xMax: 31.0, zMin: 334.0, zMax: 343.0 },
  // West Pocket Park Clock Obelisk (Row 2 Col 1 center: x=-77, z=338.5)
  { id: 'west_pocket_obelisk', xMin: -79.2, xMax: -74.8, zMin: 336.3, zMax: 340.7 },
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
  if (x >= 4.5 && x <= 48.5 && z >= 226 && z <= 266) return true;
  // Botanical Fountain Park paths (Row 1 Col 3)
  if (x >= 4.5 && x <= 48.5 && z >= 290.5 && z <= 295.5) return true;
  if (x >= 24.0 && x <= 29.0 && z >= 273 && z <= 313) return true;
  // South Gazebo Park paths (Row 2 Col 3)
  if (x >= 4.5 && x <= 48.5 && z >= 336.0 && z <= 341.0) return true;
  if (x >= 24.0 && x <= 29.0 && z >= 318.5 && z <= 358.5) return true;
  return false;
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
