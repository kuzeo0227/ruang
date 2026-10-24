import type { UnitTypeId } from '../plan/types';
import { UNITS } from '../plan/units';
import { buildShell } from '../shell/build';
import { floorHeightAt } from '../shell/build';
import { pointInPolygon } from '../shell/geom2d';
import type { ShellData, Space, Zone, ZoneId } from '../shell/types';
import type { ZoneLighting } from './daylight';
import { registry } from './registry';

const cache = new Map<UnitTypeId, ShellData>();

/** The built shell for a unit type (built once, shared by every component). */
export function getShell(unit: UnitTypeId): ShellData {
  let shell = cache.get(unit);
  if (!shell) {
    shell = buildShell(UNITS[unit]);
    cache.set(unit, shell);
  }
  registry.shell = shell;
  return shell;
}

/** The openings (with their atlas rows) and downlights that light a zone. */
export function zoneLighting(shell: ShellData, zone: ZoneId): ZoneLighting | null {
  if (zone === 'exterior') return null;
  return {
    zone,
    apertures: shell.apertures.map((aperture, row) => ({ aperture, row })).filter((a) => a.aperture.zone === zone),
    downlights: shell.downlights.filter((d) => d.zone === zone).map((d) => d.position),
  };
}

export function zoneById(shell: ShellData, zone: ZoneId): Zone | null {
  return shell.zones.find((z) => z.id === zone) ?? null;
}

/** The room at a plan point (metres), if any. */
export function spaceAt(shell: ShellData, x: number, z: number): Space | null {
  return shell.spaces.find((s) => pointInPolygon({ x: x * 1000, y: z * 1000 }, s.polygon)) ?? null;
}

export { floorHeightAt };
