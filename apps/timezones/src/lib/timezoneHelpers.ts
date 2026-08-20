import { DateTime, IANAZone } from "luxon";

export interface TimezoneInfo {
  iana: string;
  windows?: string;
  offset: string;
  offsetMinutes: number;
  abbreviation: string;
  isDST: boolean;
  currentTime: string;
  utcOffset: string;
}

/**
 * Windows timezone to IANA mapping (common ones)
 */
export const WINDOWS_TO_IANA: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Paris",
  "Tokyo Standard Time": "Asia/Tokyo",
  "China Standard Time": "Asia/Shanghai",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "India Standard Time": "Asia/Kolkata",
  "Singapore Standard Time": "Asia/Singapore",
  UTC: "UTC",
};

/**
 * IANA to Windows mapping (reverse)
 */
export const IANA_TO_WINDOWS: Record<string, string> = Object.fromEntries(
  Object.entries(WINDOWS_TO_IANA).map(([win, iana]) => [iana, win]),
);

/**
 * Commonly used IANA timezones
 */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Vienna",
  "Europe/Stockholm",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Fiji",
];

/**
 * Get timezone information for a given IANA timezone
 */
export function getTimezoneInfo(ianaZone: string, dt?: DateTime): TimezoneInfo | null {
  try {
    const now = dt ? dt.setZone(ianaZone) : DateTime.now().setZone(ianaZone);
    const zone = now.zone;

    if (!zone.isValid) {
      return null;
    }

    const offsetMinutes = now.offset;
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const offset = `${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;
    const utcOffset = `UTC${offset}`;

    return {
      iana: ianaZone,
      windows: IANA_TO_WINDOWS[ianaZone],
      offset,
      offsetMinutes,
      abbreviation: now.offsetNameShort || "",
      isDST: now.isInDST && now.zone instanceof IANAZone,
      currentTime: now.toLocaleString(DateTime.DATETIME_FULL),
      utcOffset,
    };
  } catch {
    return null;
  }
}

/**
 * Convert time between timezones
 */
export function convertTimezone(
  dt: DateTime,
  fromZone: string,
  toZone: string,
): DateTime {
  return dt.setZone(fromZone).setZone(toZone);
}

/**
 * Get timezone offset at a specific date (handles DST)
 */
export function getOffsetAt(ianaZone: string, dt: DateTime): number {
  return dt.setZone(ianaZone).offset;
}

/**
 * Full IANA timezone list. Uses Intl.supportedValuesOf (ES2022) when
 * available (~400 zones), falls back to COMMON_TIMEZONES for older browsers.
 */
export const ALL_TIMEZONES: string[] = (() => {
  try {
    const intl = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    if (typeof intl.supportedValuesOf === "function") {
      const list = intl.supportedValuesOf("timeZone");
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {
    // fall through
  }
  return COMMON_TIMEZONES;
})();

/**
 * Search timezones by name or city. Searches the full IANA list.
 */
export function searchTimezones(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(lowerQuery));
}

/**
 * Get timezone by Windows name
 */
export function getIANAFromWindows(windowsZone: string): string | undefined {
  return WINDOWS_TO_IANA[windowsZone];
}

/**
 * Get Windows timezone from IANA
 */
export function getWindowsFromIANA(ianaZone: string): string | undefined {
  return IANA_TO_WINDOWS[ianaZone];
}

/**
 * Format time in 12-hour or 24-hour format
 */
export function formatTime(dt: DateTime, use24Hour: boolean): string {
  if (use24Hour) {
    return dt.toFormat("HH:mm:ss");
  }
  return dt.toFormat("h:mm:ss a");
}

/**
 * Get coordinates for major cities (for globe visualization)
 */
export interface CityCoordinates {
  name: string;
  timezone: string;
  lat: number;
  lon: number;
}

export const CITY_COORDINATES: CityCoordinates[] = [
  { name: "New York", timezone: "America/New_York", lat: 40.7128, lon: -74.006 },
  { name: "Los Angeles", timezone: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "Chicago", timezone: "America/Chicago", lat: 41.8781, lon: -87.6298 },
  { name: "London", timezone: "Europe/London", lat: 51.5074, lon: -0.1278 },
  { name: "Paris", timezone: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Berlin", timezone: "Europe/Berlin", lat: 52.52, lon: 13.405 },
  { name: "Tokyo", timezone: "Asia/Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Shanghai", timezone: "Asia/Shanghai", lat: 31.2304, lon: 121.4737 },
  { name: "Hong Kong", timezone: "Asia/Hong_Kong", lat: 22.3193, lon: 114.1694 },
  { name: "Singapore", timezone: "Asia/Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Dubai", timezone: "Asia/Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Sydney", timezone: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Mumbai", timezone: "Asia/Kolkata", lat: 19.076, lon: 72.8777 },
  { name: "São Paulo", timezone: "America/Sao_Paulo", lat: -23.5505, lon: -46.6333 },
  { name: "Moscow", timezone: "Europe/Moscow", lat: 55.7558, lon: 37.6173 },
];

/**
 * Find the nearest IANA timezone to a given longitude/latitude.
 * Uses CITY_COORDINATES as a coarse lookup. Returns the zone string
 * or null if the list is empty.
 */
export function nearestZone(lat: number, lon: number): string | null {
  if (CITY_COORDINATES.length === 0) return null;
  let best = CITY_COORDINATES[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of CITY_COORDINATES) {
    // Equirectangular planar distance, good enough at city scale.
    const dx = (c.lon - lon) * Math.cos(((lat + c.lat) / 2) * (Math.PI / 180));
    const dy = c.lat - lat;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best.timezone;
}

/**
 * Approximate UTC offset (in hours) for a given longitude, ignoring
 * political timezone boundaries. 15° per hour, wrapped to [-12, 14].
 */
export function lonToUtcOffsetHours(lon: number): number {
  // Round to nearest integer hour. Most real zones use integer offsets
  // (a few use :30 or :45, but this is a rough tooltip).
  const raw = Math.round(lon / 15);
  // Wrap to [-12, 14]
  let off = raw;
  while (off < -12) off += 24;
  while (off > 14) off -= 24;
  return off;
}

/**
 * Format a UTC offset as "UTC+9", "UTC-5", "UTC+0".
 */
export function formatUtcOffset(hours: number): string {
  const sign = hours >= 0 ? "+" : "-";
  return `UTC${sign}${Math.abs(hours)}`;
}
