// Geographic timezone lookup via tz-lookup (timezone-boundary-builder data).
// Replaces the old nearestZone that only compared against 15 hardcoded cities.
// tzlookup(lat, lon) — LATITUDE FIRST — returns an IANA zone string.

import tzlookup from "tz-lookup";

/**
 * Look up the IANA timezone for a latitude/longitude point.
 * Ocean points return the nearest Etc/GMT±N zone (tz-lookup behaviour).
 * @param lat Latitude, decimal degrees (-90..90).
 * @param lon Longitude, decimal degrees (-180..180).
 * @returns IANA zone string, or null if the point is invalid.
 */
export function geoZoneAt(lat: number, lon: number): string | null {
  try {
    return tzlookup(lat, lon);
  } catch {
    // tz-lookup throws RangeError only for out-of-bounds/NaN input.
    return null;
  }
}