// Loads zone-coords.json (generated from tzdb zone1970.tab) and provides
// a lookup from IANA zone -> representative [lat, lon] coordinate.
// Used to place zone markers accurately on the map instead of the old
// coarse REGION_COORDS centroid fallback.

export type Coord = [lat: number, lon: number];

let cache: Record<string, Coord> | null = null;
let pending: Promise<Record<string, Coord>> | null = null;

export function loadZoneCoords(): Promise<Record<string, Coord>> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch("/data/zone-coords.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch zone-coords.json (${res.status})`);
      return res.json() as Promise<Record<string, Coord>>;
    })
    .then((data) => {
      cache = data;
      return data;
    })
    .catch((err: unknown) => {
      console.warn("Could not load zone coordinates", err);
      cache = {};
      return cache;
    });
  return pending;
}

/** Look up the representative coordinate for a zone. Returns null if not loaded/unknown. */
export async function zoneCoords(zone: string): Promise<Coord | null> {
  const data = await loadZoneCoords();
  return data[zone] ?? null;
}