// Type declarations for tz-lookup (no bundled types).
// The package exports a single function: tzlookup(lat, lon) -> IANA zone string.
declare module "tz-lookup" {
  /**
   * Look up the IANA timezone for a latitude/longitude coordinate.
   * @param lat Latitude in decimal degrees (-90..90).
   * @param lon Longitude in decimal degrees (-180..180).
   * @returns IANA zone string, e.g. "America/Los_Angeles".
   * @throws RangeError if lat/lon are out of bounds or NaN.
   */
  function tzlookup(lat: number, lon: number): string;
  export default tzlookup;
}