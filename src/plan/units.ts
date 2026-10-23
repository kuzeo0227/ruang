// Unit types A, B and B1, transcribed from the CAD sheets in docs/reference/.

import { buildUnit, type UnitParams } from './generator';
import type { UnitPlan, UnitTypeId } from './types';

const ROWS: UnitParams['rows'] = [750, 3650, 1200, 2700, 2650];

const shared = {
  rows: ROWS,
  balconyDepth: 1200,
  toilet1Width: 1650,
  toilet2Width: 1512,
  kitchenWestOfGrid3: 800,
  ac1Width: 1300,
  ac2Width: 700,
  foyerWidth: 1900,
  foyerDepth: 1000,
} satisfies Partial<UnitParams>;

const daylightCommon = [
  { group: ['bedroom1' as const], area: 3.24 },
  { group: ['bedroom2' as const], area: 2.16 },
  { group: ['study' as const], area: 1.44 },
  { group: ['toilet1' as const], area: 0.36 },
  { group: ['toilet2' as const], area: 0.36 },
];

const typeBRooms = {
  living: 15.66,
  dining: 13.04,
  kitchen: 6.62,
  yard: 6.16,
  bedroom1: 16.97,
  bedroom2: 12.05,
  study: 9.82,
  toilet1: 4.46,
  toilet2: 4.08,
  foyer: 1.9,
  balcony: 4.32,
  corridor: 3.96,
};

export const TYPE_A: UnitParams = {
  ...shared,
  id: 'A',
  name: 'Type A',
  bays: [3100, 2800, 3100],
  yardWidth: 1150,
  livingDiningSplit: 5600,
  schedule: {
    roomAreasM2: {
      living: 13.64,
      dining: 11.5,
      kitchen: 5.3,
      yard: 3.05,
      bedroom1: 15.03,
      bedroom2: 10.22,
      study: 7.39,
      toilet1: 4.46,
      toilet2: 4.08,
      foyer: 1.9,
      balcony: 3.72,
      corridor: 3.36,
    },
    totalM2: 83.66,
    totalSqft: 900,
    daylightM2: [{ group: ['living', 'dining', 'kitchen'], area: 6.31 }, ...daylightCommon],
  },
};

export const TYPE_B: UnitParams = {
  ...shared,
  id: 'B',
  name: 'Type B',
  bays: [3500, 3300, 3600],
  yardWidth: 2325,
  livingDiningSplit: 5550,
  schedule: {
    roomAreasM2: typeBRooms,
    totalM2: 99.04,
    totalSqft: 1065,
    daylightM2: [{ group: ['living', 'dining', 'kitchen'], area: 6.31 }, ...daylightCommon],
  },
};

export const TYPE_B1: UnitParams = {
  ...TYPE_B,
  id: 'B1',
  name: 'Type B1',
  // 0.71 m2 of floor over 1350 mm of facade gives a 526 mm projection.
  bayWindow: { width: 1350, depth: 526, sill: 500, head: 2100 },
  schedule: {
    roomAreasM2: { ...typeBRooms, dining: 13.75 },
    totalM2: 99.75,
    totalSqft: 1073,
    daylightM2: [{ group: ['living', 'dining', 'kitchen'], area: 10.16 }, ...daylightCommon],
  },
};

export const UNITS: Record<UnitTypeId, UnitPlan> = {
  A: buildUnit(TYPE_A),
  B: buildUnit(TYPE_B),
  B1: buildUnit(TYPE_B1),
};
