// Persistence for app state via localStorage. Keys are namespaced under
// "timezones-". Theme is handled separately in theme.ts.
// All loaders are defensive: bad/missing data falls back to defaults.

const KEY_ZONES = "timezones-zones";
const KEY_HOME = "timezones-home";
const KEY_24H = "timezones-24h";
const KEY_RANGE = "timezones-range";

const DEFAULT_ZONES = ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo"];
const DEFAULT_HOME = "America/Los_Angeles";

export interface PersistedRange {
  startCol: number;
  endCol: number;
}

export function loadZones(): string[] {
  try {
    const raw = localStorage.getItem(KEY_ZONES);
    if (!raw) return DEFAULT_ZONES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ZONES;
    // Keep only non-empty strings.
    const zones = parsed.filter((z): z is string => typeof z === "string" && z.length > 0);
    return zones.length > 0 ? zones : DEFAULT_ZONES;
  } catch {
    return DEFAULT_ZONES;
  }
}

export function saveZones(zones: string[]): void {
  try {
    localStorage.setItem(KEY_ZONES, JSON.stringify(zones));
  } catch {
    // ignore quota/private mode errors
  }
}

export function loadHomeZone(): string {
  try {
    const raw = localStorage.getItem(KEY_HOME);
    if (!raw) return DEFAULT_HOME;
    return typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_HOME;
  } catch {
    return DEFAULT_HOME;
  }
}

export function saveHomeZone(zone: string): void {
  try {
    localStorage.setItem(KEY_HOME, zone);
  } catch {
    // ignore
  }
}

export function loadUse24Hour(): boolean {
  try {
    return localStorage.getItem(KEY_24H) === "1";
  } catch {
    return false;
  }
}

export function saveUse24Hour(use24: boolean): void {
  try {
    localStorage.setItem(KEY_24H, use24 ? "1" : "0");
  } catch {
    // ignore
  }
}

export function loadRange(): PersistedRange | null {
  try {
    const raw = localStorage.getItem(KEY_RANGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRange;
    if (
      typeof parsed?.startCol !== "number" ||
      typeof parsed?.endCol !== "number"
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRange(range: PersistedRange | null): void {
  try {
    if (range) localStorage.setItem(KEY_RANGE, JSON.stringify(range));
    else localStorage.removeItem(KEY_RANGE);
  } catch {
    // ignore
  }
}