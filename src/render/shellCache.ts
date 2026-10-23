import type { UnitTypeId } from '../plan/types';
import { UNITS } from '../plan/units';
import { buildShell } from '../shell/build';
import type { ShellData } from '../shell/types';
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
