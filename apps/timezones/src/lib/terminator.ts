// Solar day/night terminator.
// Computes the subsolar point (where the sun is directly overhead) from UTC
// time, then shades the hemisphere opposite the sun as "night". This replaces
// the old crude single-meridian terminator that ignored seasonal declination.
//
// Reference: standard astronomical equations (NOAA solar calculater derivation).
// Accuracy: a few tenths of a degree — more than enough for a 800x400 world map.

import type { DateTime } from "luxon";

export interface SubsolarPoint {
  /** Latitude of the subsolar point, degrees [-90, 90]. */
  lat: number;
  /** Longitude of the subsolar point, degrees [-180, 180]. */
  lon: number;
}

/**
 * Compute the subsolar point for a given UTC time.
 * Returns lat (declination) and lon (where local solar time is noon).
 */
export function subsolarPoint(utcTime: DateTime): SubsolarPoint {
  // Use the UT instant — millis since epoch drives all solar geometry.
  const t = utcTime.toUTC().toMillis();
  const dayMs = 86_400_000;
  const unixDays = t / dayMs;

  // Julian day (TT is not needed at this precision; use JD - 2451545.0).
  const jd = unixDays + 2440587.5;
  const n = jd - 2451545.0;

  // Mean longitude of the sun (degrees), corrected for aberration.
  const L = (280.466 + 0.9856474 * n) % 360;
  // Mean anomaly of the sun (degrees).
  const g = ((357.528 + 0.9856003 * n) % 360 + 360) % 360;
  const gRad = (g * Math.PI) / 180;

  // Ecliptic longitude of the sun (degrees).
  const lambda = (L + 1.915 * Math.sin(gRad) + 0.02 * Math.sin(2 * gRad)) * (Math.PI / 180);

  // Obliquity of the ecliptic (degrees).
  const epsilon = (23.439 - 0.0000004 * n) * (Math.PI / 180);

  // Solar declination = subsolar latitude.
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

  // Equation of time (minutes): difference between apparent solar time and mean solar time.
  // EOT ≈ -1.915 sin g - 0.02 sin 2g + ... (already partly in lambda); use the standard form.
  const eotMinutes =
    -1.915 * Math.sin(gRad) - 0.02 * Math.sin(2 * gRad) + 0.488 * Math.sin(2 * lambda);
  const eotHours = eotMinutes / 60;

  // UTC hour (fractional).
  const utcHour = (t % dayMs) / dayMs; // 0..1 within the day
  // Apparent solar time fraction of day.
  const solarDayFrac = (utcHour - 0.5 + eotHours / 24 + 1) % 1;
  // Subsolar longitude: 0 at apparent solar noon (when solarDayFrac = 0.5).
  // localSolarTimeHours = 12 means sun is overhead at this longitude.
  const localSolarHours = solarDayFrac * 24;
  // Longitude where it is localSolarHours: lon = (12 - localSolarHours) * 15.
  let lon = (12 - localSolarHours) * 15;
  // Normalize to [-180, 180].
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;

  return { lat: (decl * 180) / Math.PI, lon };
}

/**
 * Is a given point in daylight at this UTC time?
 * Returns true if the sun is above the horizon.
 * The sun is above the horizon when the solar altitude > 0, i.e. when the
 * angular distance from the subsolar point is less than 90 degrees.
 */
export function isDaylight(lat: number, lon: number, utcTime: DateTime): boolean {
  const { lat: subLat, lon: subLon } = subsolarPoint(utcTime);
  // Angular separation using spherical law of cosines.
  const latR = (lat * Math.PI) / 180;
  const subLatR = (subLat * Math.PI) / 180;
  const dLon = ((lon - subLon) * Math.PI) / 180;
  const cosC =
    Math.sin(latR) * Math.sin(subLatR) +
    Math.cos(latR) * Math.cos(subLatR) * Math.cos(dLon);
  // cosC > 0 means separation < 90deg -> daylight.
  return cosC > 0;
}

/**
 * Solar elevation angle in degrees at a point, 0 = horizon, 90 = overhead.
 * Used to weight the day overlay intensity (brighter near the subsolar point,
 * fading toward the terminator).
 */
export function solarElevation(lat: number, lon: number, utcTime: DateTime): number {
  const { lat: subLat, lon: subLon } = subsolarPoint(utcTime);
  const latR = (lat * Math.PI) / 180;
  const subLatR = (subLat * Math.PI) / 180;
  const dLon = ((lon - subLon) * Math.PI) / 180;
  const cosC =
    Math.sin(latR) * Math.sin(subLatR) +
    Math.cos(latR) * Math.cos(subLatR) * Math.cos(dLon);
  const c = Math.acos(Math.min(1, Math.max(-1, cosC)));
  // Solar altitude = 90 - angular distance from subsolar point.
  return 90 - (c * 180) / Math.PI;
}

/**
 * For equirectangular rendering: returns a set of x-fractions (0..1 across
 * the map width) for each y-fraction (0..1 down the map) that should be
 * shaded as night. We approximate the terminator as a great circle and
 * sample it densely along the vertical axis.
 *
 * Returns an array of { y, xLeft, xRight } bands, where xLeft..xRight is the
 * night span (potentially wrapping). For an equirectangular map this is an
 * approximation but visually correct at world-map scale.
 *
 * Simpler and faster: sample along latitude rows. For each latitude, the
 * night-longitude range is the half-circle opposite the subsolar point.
 */
export interface TerminatorBand {
  /** y fraction 0..1 (top to bottom). */
  y: number;
  /** x fraction where night begins (left edge of night span), 0..1. */
  xStart: number;
  /** x fraction where night ends, 0..1. May be < xStart if night wraps. */
  xEnd: number;
}

/**
 * Produce day bands sampled at `steps` latitude rows across the map.
 * Each band describes the longitude range that is in DAYLIGHT at that latitude.
 * Day is centered on the subsolar meridian. Polar day = full row lit (0..1),
 * polar night = no day (NaN). This is the complement of terminatorBands.
 */
export function dayBands(utcTime: DateTime, steps = 48): TerminatorBand[] {
  const { lat: subLat, lon: subLon } = subsolarPoint(utcTime);
  const subLatR = (subLat * Math.PI) / 180;
  const subLonR = (subLon * Math.PI) / 180;
  const bands: TerminatorBand[] = [];

  for (let i = 0; i < steps; i++) {
    const yFrac = (i + 0.5) / steps;
    const lat = 90 - yFrac * 180; // north at top
    const latR = (lat * Math.PI) / 180;

    const cosH = -Math.tan(latR) * Math.tan(subLatR);

    if (cosH > 1) {
      // Polar night: no day at all.
      bands.push({ y: yFrac, xStart: NaN, xEnd: NaN });
      continue;
    }
    if (cosH < -1) {
      // Polar day: entire row is lit.
      bands.push({ y: yFrac, xStart: 0, xEnd: 1 });
      continue;
    }

    const H = Math.acos(cosH); // hour angle of sunrise/sunset
    // Day is centered on the subsolar meridian, spanning 2*H.
    let dayStart = subLonR - H;
    let dayEnd = subLonR + H;

    const radToX = (r: number): number => {
      let x = r;
      while (x > Math.PI) x -= 2 * Math.PI;
      while (x < -Math.PI) x += 2 * Math.PI;
      return ((x * 180) / Math.PI + 180) / 360;
    };
    let xStart = radToX(dayStart);
    let xEnd = radToX(dayEnd);
    if (xEnd < xStart) xEnd += 1;
    bands.push({ y: yFrac, xStart, xEnd });
  }
  return bands;
}

/**
 * Produce night bands sampled at `steps` latitude rows across the map.
 * Each band describes the longitude range that is in night at that latitude.
 */
export function terminatorBands(utcTime: DateTime, steps = 48): TerminatorBand[] {
  const { lat: subLat, lon: subLon } = subsolarPoint(utcTime);
  const subLatR = (subLat * Math.PI) / 180;
  const subLonR = (subLon * Math.PI) / 180;
  const bands: TerminatorBand[] = [];

  for (let i = 0; i < steps; i++) {
    const yFrac = (i + 0.5) / steps;
    const lat = 90 - yFrac * 180; // north at top
    const latR = (lat * Math.PI) / 180;

    // Hour angle at which sun is on the horizon: cos H = -tan(lat) tan(decl).
    // If |tan(lat) tan(decl)| > 1, there is no sunrise/sunset at this latitude
    // (polar day or polar night).
    const cosH = -Math.tan(latR) * Math.tan(subLatR);

    if (cosH > 1) {
      // Polar night: entire latitude row is dark.
      bands.push({ y: yFrac, xStart: 0, xEnd: 1 });
      continue;
    }
    if (cosH < -1) {
      // Polar day: entire latitude row is lit; no night band.
      bands.push({ y: yFrac, xStart: NaN, xEnd: NaN });
      continue;
    }

    const H = Math.acos(cosH); // hour angle of sunset, radians
    // Night is centered on the anti-solar meridian (subLon + 180).
    // Night longitude range: [subLon + H, subLon - H] (mod 360), i.e. the half
    // opposite the sun, bounded by sunset/sunrise hour angles.
    // The anti-solar longitude:
    const antiSubLon = subLonR + Math.PI; // radians, where it is solar midnight
    // Night span in longitude: from (antiSubLon - (PI - H)) to (antiSubLon + (PI - H))
    // i.e. width = 2*(PI - H) centered on antiSubLon. During equinox H=PI/2, so
    // night spans exactly PI (half the globe). Around solstices, H shrinks/grows.
    const halfNight = Math.PI - H; // radians of night half-width
    let nightStart = antiSubLon - halfNight; // radians
    let nightEnd = antiSubLon + halfNight; // radians

    // Convert to fractions of map width (longitude fraction 0..1 with lon -180..180).
    const radToX = (r: number): number => {
      // normalize to [-PI, PI]
      let x = r;
      while (x > Math.PI) x -= 2 * Math.PI;
      while (x < -Math.PI) x += 2 * Math.PI;
      // lon -> x fraction: (lon + 180) / 360
      return ((x * 180) / Math.PI + 180) / 360;
    };
    let xStart = radToX(nightStart);
    let xEnd = radToX(nightEnd);
    if (xEnd < xStart) xEnd += 1; // wrap
    bands.push({ y: yFrac, xStart, xEnd });
  }
  return bands;
}