// Sun position for Kuala Lumpur (NOAA solar position algorithm) and its light colour.
// Scene axes: +x east, -z north, +y up (the balcony side of the plans faces north).

export const SITE = { latitude: 3.139, longitude: 101.687, utcOffset: 8 };

const rad = Math.PI / 180;

export interface SunPosition {
  /** Degrees clockwise from north. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  /** Unit vector from the scene towards the sun. */
  direction: [number, number, number];
}

/** Day of year for the 15th of a month (non-leap year). */
export function dayOfYear(month: number, day = 15): number {
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return starts[month - 1]! + day;
}

export function sunPosition(month: number, hours: number, day = 15): SunPosition {
  const n = dayOfYear(month, day);
  const g = ((2 * Math.PI) / 365) * (n - 1 + (hours - 12) / 24);
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const timeOffset = eqTime + 4 * SITE.longitude - 60 * SITE.utcOffset;
  const trueSolarMinutes = hours * 60 + timeOffset;
  const hourAngle = (trueSolarMinutes / 4 - 180) * rad;
  const lat = SITE.latitude * rad;
  const cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const elevation = 90 - zenith / rad;
  // Azimuth clockwise from north.
  const sinAz = -Math.sin(hourAngle) * Math.cos(decl);
  const cosAz = Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.sin(lat) * Math.cos(hourAngle);
  const azimuth = (Math.atan2(sinAz, cosAz) / rad + 360) % 360;
  const el = elevation * rad;
  const az = azimuth * rad;
  return { azimuth, elevation, direction: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)] };
}

/** Sunrise and sunset (local hours) for a month, found by scanning the elevation. */
export function sunTimes(month: number): { sunrise: number; sunset: number } {
  let sunrise = 7;
  let sunset = 19;
  let prev = sunPosition(month, 4).elevation;
  for (let h = 4.01; h < 21; h += 0.01) {
    const e = sunPosition(month, h).elevation;
    if (prev < -0.83 && e >= -0.83) sunrise = h;
    if (prev >= -0.83 && e < -0.83) sunset = h;
    prev = e;
  }
  return { sunrise, sunset };
}

export function formatHours(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(mm === 60 ? hh + 1 : hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}

/**
 * Direct sunlight colour and strength (relative units) after the atmosphere, from elevation.
 * Low sun is dimmer and warmer; below the horizon it fades out over civil twilight.
 */
export function sunLight(elevation: number): { color: [number, number, number]; intensity: number } {
  if (elevation <= -1) return { color: [1, 0.55, 0.3], intensity: 0 };
  const e = Math.max(elevation, 0.5) * rad;
  // Relative air mass (Kasten-Young) and simple wavelength-dependent extinction.
  const airMass = 1 / (Math.sin(e) + 0.50572 * Math.pow(elevation + 6.07995, -1.6364));
  const tau = [0.065, 0.11, 0.21];
  const color = tau.map((t) => Math.exp(-t * airMass)) as [number, number, number];
  const peak = Math.max(...color);
  const fade = Math.min(1, (elevation + 1) / 4);
  return { color: color.map((c) => c / peak) as [number, number, number], intensity: peak * fade };
}
