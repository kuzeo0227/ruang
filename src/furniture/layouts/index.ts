// Default layouts per unit type and style.

import type { StyleId } from '../../catalogue/styles';
import type { UnitTypeId } from '../../plan/types';
import { UNITS } from '../../plan/units';
import type { Placement } from '../types';
import { defaultLayout as recipe } from './default';

export function defaultLayout(unit: UnitTypeId, style: StyleId): Placement[] {
  return recipe(UNITS[unit], style);
}
