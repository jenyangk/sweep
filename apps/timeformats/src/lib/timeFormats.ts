import { DateTime } from "luxon";

export interface TimeFormat {
  id: string;
  name: string;
  description: string;
  category: "iso" | "unix" | "specialized" | "browser" | "system";
  format: (dt: DateTime) => string;
  parse?: (value: string) => DateTime | null;
}

// Constants for specialized time systems
export const UNIX_EPOCH = DateTime.fromObject({ year: 1970, month: 1, day: 1 }, { zone: "utc" });
export const GPS_EPOCH = DateTime.fromObject({ year: 1980, month: 1, day: 6 }, { zone: "utc" });
export const WINDOWS_EPOCH = DateTime.fromObject({ year: 1601, month: 1, day: 1 }, { zone: "utc" });
export const JULIAN_OFFSET = 2440587.5; // JD for Unix epoch
export const TAI_UTC_OFFSET = 37; // TAI is currently UTC + 37 seconds (as of 2025)
export const GPS_TAI_OFFSET = 19; // GPS time is TAI - 19 seconds

export const TIME_FORMATS: TimeFormat[] = [
  // ISO Standards
  {
    id: "iso8601-extended",
    name: "ISO 8601 Extended",
    description: "YYYY-MM-DDTHH:mm:ss.sssZ",
    category: "iso",
    format: (dt) => dt.toISO() || "",
    parse: (value) => DateTime.fromISO(value),
  },
  {
    id: "iso8601-basic",
    name: "ISO 8601 Basic",
    description: "YYYYMMDDTHHmmss.sssZ",
    category: "iso",
    format: (dt) => dt.toISO({ format: "basic" }) || "",
    parse: (value) => DateTime.fromISO(value),
  },
  {
    id: "iso8601-date",
    name: "ISO 8601 Date Only",
    description: "YYYY-MM-DD",
    category: "iso",
    format: (dt) => dt.toISODate() || "",
    parse: (value) => DateTime.fromISO(value),
  },
  {
    id: "iso8601-time",
    name: "ISO 8601 Time Only",
    description: "HH:mm:ss.sss",
    category: "iso",
    format: (dt) => dt.toISOTime({ includeOffset: false }) || "",
  },
  {
    id: "iso8601-week",
    name: "ISO 8601 Week Date",
    description: "YYYY-Www-D",
    category: "iso",
    format: (dt) => `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, "0")}-${dt.weekday}`,
  },
  {
    id: "iso8601-ordinal",
    name: "ISO 8601 Ordinal Date",
    description: "YYYY-DDD (day of year)",
    category: "iso",
    format: (dt) => `${dt.year}-${String(dt.ordinal).padStart(3, "0")}`,
  },
  {
    id: "rfc2822",
    name: "RFC 2822",
    description: "Date format used in email headers",
    category: "iso",
    format: (dt) => dt.toRFC2822() || "",
    parse: (value) => DateTime.fromRFC2822(value),
  },
  {
    id: "rfc3339",
    name: "RFC 3339",
    description: "Internet timestamp format",
    category: "iso",
    format: (dt) => dt.toISO() || "",
    parse: (value) => DateTime.fromISO(value),
  },

  // Unix Timestamps
  {
    id: "unix-seconds",
    name: "Unix Timestamp (seconds)",
    description: "Seconds since 1970-01-01 00:00:00 UTC",
    category: "unix",
    format: (dt) => Math.floor(dt.toSeconds()).toString(),
    parse: (value) => DateTime.fromSeconds(Number(value)),
  },
  {
    id: "unix-milliseconds",
    name: "Unix Timestamp (milliseconds)",
    description: "Milliseconds since 1970-01-01 00:00:00 UTC",
    category: "unix",
    format: (dt) => dt.toMillis().toString(),
    parse: (value) => DateTime.fromMillis(Number(value)),
  },
  {
    id: "unix-microseconds",
    name: "Unix Timestamp (microseconds)",
    description: "Microseconds since 1970-01-01 00:00:00 UTC",
    category: "unix",
    format: (dt) => Math.floor(dt.toMillis() * 1000).toString(),
    parse: (value) => DateTime.fromMillis(Number(value) / 1000),
  },
  {
    id: "unix-nanoseconds",
    name: "Unix Timestamp (nanoseconds)",
    description: "Nanoseconds since 1970-01-01 00:00:00 UTC",
    category: "unix",
    format: (dt) => Math.floor(dt.toMillis() * 1000000).toString(),
    parse: (value) => DateTime.fromMillis(Number(value) / 1000000),
  },

  // Specialized Time Systems
  {
    id: "tai",
    name: "TAI (International Atomic Time)",
    description: "Continuous time scale without leap seconds (UTC + 37s)",
    category: "specialized",
    format: (dt) => {
      const taiSeconds = dt.toSeconds() + TAI_UTC_OFFSET;
      const taiDt = DateTime.fromSeconds(taiSeconds, { zone: "utc" });
      return `${taiDt.toISO()} TAI`;
    },
    parse: (value) => {
      const cleaned = value.replace(" TAI", "").trim();
      const dt = DateTime.fromISO(cleaned);
      return dt.minus({ seconds: TAI_UTC_OFFSET });
    },
  },
  {
    id: "gps-time",
    name: "GPS Time",
    description: "Seconds since 1980-01-06 00:00:00 UTC (no leap seconds)",
    category: "specialized",
    format: (dt) => {
      const gpsSeconds = dt.diff(GPS_EPOCH, "seconds").seconds + (TAI_UTC_OFFSET - GPS_TAI_OFFSET);
      return Math.floor(gpsSeconds).toString();
    },
    parse: (value) => {
      const gpsSeconds = Number(value);
      return GPS_EPOCH.plus({ seconds: gpsSeconds - (TAI_UTC_OFFSET - GPS_TAI_OFFSET) });
    },
  },
  {
    id: "gps-week",
    name: "GPS Week Number",
    description: "Week number since GPS epoch + seconds into week",
    category: "specialized",
    format: (dt) => {
      const gpsSeconds = dt.diff(GPS_EPOCH, "seconds").seconds + (TAI_UTC_OFFSET - GPS_TAI_OFFSET);
      const weekNumber = Math.floor(gpsSeconds / 604800);
      const secondsIntoWeek = gpsSeconds % 604800;
      return `Week ${weekNumber}, ${Math.floor(secondsIntoWeek)}s`;
    },
  },
  {
    id: "julian-date",
    name: "Julian Date (JD)",
    description: "Days since noon on January 1, 4713 BC",
    category: "specialized",
    format: (dt) => {
      const jd = JULIAN_OFFSET + dt.toSeconds() / 86400;
      return jd.toFixed(8);
    },
    parse: (value) => {
      const jd = Number(value);
      const unixDays = jd - JULIAN_OFFSET;
      return DateTime.fromSeconds(unixDays * 86400, { zone: "utc" });
    },
  },
  {
    id: "modified-julian-date",
    name: "Modified Julian Date (MJD)",
    description: "JD - 2400000.5 (days since midnight Nov 17, 1858)",
    category: "specialized",
    format: (dt) => {
      const jd = JULIAN_OFFSET + dt.toSeconds() / 86400;
      const mjd = jd - 2400000.5;
      return mjd.toFixed(8);
    },
    parse: (value) => {
      const mjd = Number(value);
      const jd = mjd + 2400000.5;
      const unixDays = jd - JULIAN_OFFSET;
      return DateTime.fromSeconds(unixDays * 86400, { zone: "utc" });
    },
  },

  // System/Platform Specific
  {
    id: "windows-filetime",
    name: "Windows FILETIME",
    description: "100-nanosecond intervals since 1601-01-01 00:00:00 UTC",
    category: "system",
    format: (dt) => {
      const diff = dt.diff(WINDOWS_EPOCH, "milliseconds").milliseconds;
      const filetime = Math.floor(diff * 10000);
      return filetime.toString();
    },
    parse: (value) => {
      const filetime = Number(value);
      const milliseconds = filetime / 10000;
      return WINDOWS_EPOCH.plus({ milliseconds });
    },
  },
  {
    id: "windows-ticks",
    name: ".NET DateTime Ticks",
    description: "100-nanosecond ticks since 0001-01-01 00:00:00",
    category: "system",
    format: (dt) => {
      const dotnetEpoch = DateTime.fromObject({ year: 1, month: 1, day: 1 }, { zone: "utc" });
      const diff = dt.diff(dotnetEpoch, "milliseconds").milliseconds;
      const ticks = Math.floor(diff * 10000);
      return ticks.toString();
    },
  },
  {
    id: "posix-time",
    name: "POSIX Time",
    description: "Seconds since epoch (same as Unix, but ambiguous during leap seconds)",
    category: "system",
    format: (dt) => Math.floor(dt.toSeconds()).toString(),
    parse: (value) => DateTime.fromSeconds(Number(value)),
  },

  // Browser/JavaScript Formats
  {
    id: "js-date-string",
    name: "JavaScript Date String",
    description: "Date.toString() format",
    category: "browser",
    format: (dt) => dt.toJSDate().toString(),
  },
  {
    id: "js-utc-string",
    name: "JavaScript UTC String",
    description: "Date.toUTCString() format",
    category: "browser",
    format: (dt) => dt.toJSDate().toUTCString(),
  },
  {
    id: "js-iso-string",
    name: "JavaScript ISO String",
    description: "Date.toISOString() format",
    category: "browser",
    format: (dt) => dt.toJSDate().toISOString(),
    parse: (value) => DateTime.fromISO(value),
  },
  {
    id: "js-locale-string",
    name: "JavaScript Locale String",
    description: "Date.toLocaleString() format",
    category: "browser",
    format: (dt) => dt.toJSDate().toLocaleString(),
  },
  {
    id: "js-time-string",
    name: "JavaScript Time String",
    description: "Date.toTimeString() format",
    category: "browser",
    format: (dt) => dt.toJSDate().toTimeString(),
  },

  // Common Development Formats
  {
    id: "sql-datetime",
    name: "SQL DATETIME",
    description: "YYYY-MM-DD HH:mm:ss",
    category: "system",
    format: (dt) => dt.toSQL() || "",
    parse: (value) => DateTime.fromSQL(value),
  },
  {
    id: "http-date",
    name: "HTTP Date Header",
    description: "Format used in HTTP headers",
    category: "browser",
    format: (dt) => dt.toHTTP() || "",
    parse: (value) => DateTime.fromHTTP(value),
  },
];

export function getFormat(id: string): TimeFormat | undefined {
  return TIME_FORMATS.find((f) => f.id === id);
}

export function getFormatsByCategory(category: TimeFormat["category"]): TimeFormat[] {
  return TIME_FORMATS.filter((f) => f.category === category);
}

export function convertFormat(
  value: string,
  fromFormatId: string,
  toFormatId: string,
): string | null {
  const fromFormat = getFormat(fromFormatId);
  const toFormat = getFormat(toFormatId);

  if (!fromFormat?.parse || !toFormat) {
    return null;
  }

  const dt = fromFormat.parse(value);
  if (!dt || !dt.isValid) {
    return null;
  }

  return toFormat.format(dt);
}

export function getAllFormats(dt: DateTime): Record<string, string> {
  const result: Record<string, string> = {};
  TIME_FORMATS.forEach((format) => {
    try {
      result[format.id] = format.format(dt);
    } catch {
      result[format.id] = "Error";
    }
  });
  return result;
}
