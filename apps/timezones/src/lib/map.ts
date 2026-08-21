import type { DateTime } from "luxon";
import { mesh } from "topojson-client";
import { geoZoneAt } from "./geoZone";
import { loadZoneCoords, type Coord } from "./zoneCoords";
import { subsolarPoint, dayBands, solarElevation } from "./terminator";

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 800;
const H = 400;

// Equirectangular projection
const px = (lon: number): number => ((lon + 180) / 360) * W;
const py = (lat: number): number => ((90 - lat) / 180) * H;

// Inverse projection: SVG x → longitude, y → latitude
const lonAt = (x: number): number => (x / W) * 360 - 180;
const latAt = (y: number): number => 90 - (y / H) * 180;

/* ----- Land data (TopoJSON → mesh → path `d`) ----- */

interface LandTopology {
  type: "Topology";
  objects: {
    land: {
      type: "GeometryCollection";
      geometries: Array<{ type: "MultiPolygon"; arcs: number[][][] }>;
    };
  };
  arcs: number[][][];
  transform?: { scale: [number, number]; translate: [number, number] };
}

let landPathPromise: Promise<string> | null = null;

async function fetchLandPath(): Promise<string> {
  const res = await fetch("/data/land-110m.json");
  if (!res.ok) throw new Error(`Failed to fetch land data (${res.status})`);
  const topo = (await res.json()) as LandTopology;
  const land = mesh(topo, topo.objects.land);
  return meshToPath(land.coordinates);
}

function meshToPath(coords: number[][][]): string {
  const parts: string[] = [];
  for (const line of coords) {
    if (line.length < 2) continue;
    const [startLon, startLat] = line[0];
    let d = `M${px(startLon).toFixed(1)} ${py(startLat).toFixed(1)}`;
    for (let i = 1; i < line.length; i++) {
      const [lon, lat] = line[i];
      d += `L${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`;
    }
    parts.push(d);
  }
  return parts.join("");
}

export function ensureLandData(svg: SVGElement): Promise<void> {
  if (!landPathPromise) landPathPromise = fetchLandPath();
  return landPathPromise
    .then((d) => {
      for (const path of svg.querySelectorAll<SVGPathElement>(".map-land")) {
        path.setAttribute("d", d);
      }
    })
    .catch((err: unknown) => {
      console.warn("Could not load world map land data", err);
    });
}

/* ----- Zone coordinates (zone1970.tab) ----- */

// Fallback to a coarse centroid only if zone-coords.json hasn't loaded yet.
const REGION_COORDS: Record<string, Coord> = {
  Africa: [5, 20],
  America: [40, -100],
  Antarctic: [-80, 0],
  Arctic: [80, 0],
  Asia: [40, 90],
  Atlantic: [40, -30],
  Australia: [-25, 135],
  Etc: [30, 0],
  Europe: [50, 10],
  Indian: [-20, 70],
  Pacific: [-15, -140],
};

function fallbackCoords(zone: string): Coord {
  if (zone === "UTC") return [51.5, -0.13];
  const region = zone.split("/")[0];
  return REGION_COORDS[region] ?? [0, 0];
}

/* ----- Major city labels on the map (timeanddate-style) ----- */

export interface MapCity {
  name: string;
  lat: number;
  lon: number;
  /**
   * Visual hierarchy tier:
   *   1 = world anchor (capitals & mega-cities; always shown, larger)
   *   2 = major regional city
   *   3 = smaller regional city (hidden at narrow widths)
   */
  tier: 1 | 2 | 3;
}

// A curated set of major world cities for the map. Tier 1 cities are the
// anchors a reader glances for first; tier 3 are regional fillers that get
// culled when the map is narrow.
const MAP_CITIES: MapCity[] = [
  // North America
  { name: "Los Angeles", lat: 34.05, lon: -118.24, tier: 1 },
  { name: "New York", lat: 40.71, lon: -74.01, tier: 1 },
  { name: "Chicago", lat: 41.88, lon: -87.63, tier: 2 },
  { name: "Denver", lat: 39.74, lon: -104.99, tier: 3 },
  { name: "Toronto", lat: 43.65, lon: -79.38, tier: 2 },
  { name: "Mexico City", lat: 19.43, lon: -99.13, tier: 2 },
  { name: "Vancouver", lat: 49.28, lon: -123.12, tier: 3 },
  { name: "Honolulu", lat: 21.31, lon: -157.86, tier: 3 },
  // South America
  { name: "São Paulo", lat: -23.55, lon: -46.63, tier: 1 },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38, tier: 2 },
  { name: "Lima", lat: -12.05, lon: -77.04, tier: 3 },
  { name: "Bogotá", lat: 4.71, lon: -74.07, tier: 3 },
  { name: "Santiago", lat: -33.45, lon: -70.67, tier: 3 },
  // Europe
  { name: "London", lat: 51.51, lon: -0.13, tier: 1 },
  { name: "Paris", lat: 48.86, lon: 2.35, tier: 1 },
  { name: "Berlin", lat: 52.52, lon: 13.41, tier: 2 },
  { name: "Madrid", lat: 40.42, lon: -3.7, tier: 3 },
  { name: "Rome", lat: 41.9, lon: 12.5, tier: 3 },
  { name: "Amsterdam", lat: 52.37, lon: 4.9, tier: 3 },
  { name: "Stockholm", lat: 59.33, lon: 18.07, tier: 3 },
  { name: "Moscow", lat: 55.76, lon: 37.62, tier: 1 },
  { name: "Istanbul", lat: 41.01, lon: 28.98, tier: 2 },
  { name: "Lisbon", lat: 38.72, lon: -9.14, tier: 3 },
  { name: "Athens", lat: 37.98, lon: 23.73, tier: 3 },
  // Africa
  { name: "Cairo", lat: 30.04, lon: 31.24, tier: 2 },
  { name: "Lagos", lat: 6.52, lon: 3.38, tier: 2 },
  { name: "Johannesburg", lat: -26.2, lon: 28.04, tier: 2 },
  { name: "Nairobi", lat: -1.29, lon: 36.82, tier: 3 },
  { name: "Casablanca", lat: 33.57, lon: -7.59, tier: 3 },
  { name: "Accra", lat: 5.6, lon: -0.19, tier: 3 },
  // Asia
  { name: "Tokyo", lat: 35.68, lon: 139.65, tier: 1 },
  { name: "Shanghai", lat: 31.23, lon: 121.47, tier: 1 },
  { name: "Beijing", lat: 39.9, lon: 116.41, tier: 2 },
  { name: "Hong Kong", lat: 22.32, lon: 114.17, tier: 2 },
  { name: "Singapore", lat: 1.35, lon: 103.82, tier: 2 },
  { name: "Bangkok", lat: 13.76, lon: 100.5, tier: 3 },
  { name: "Mumbai", lat: 19.08, lon: 72.88, tier: 2 },
  { name: "Delhi", lat: 28.61, lon: 77.21, tier: 2 },
  { name: "Kolkata", lat: 22.57, lon: 88.36, tier: 3 },
  { name: "Karachi", lat: 24.86, lon: 67.01, tier: 3 },
  { name: "Dubai", lat: 25.2, lon: 55.27, tier: 2 },
  { name: "Tehran", lat: 35.7, lon: 51.42, tier: 3 },
  { name: "Seoul", lat: 37.57, lon: 126.98, tier: 2 },
  { name: "Jakarta", lat: -6.21, lon: 106.85, tier: 2 },
  { name: "Manila", lat: 14.6, lon: 120.98, tier: 3 },
  { name: "Ho Chi Minh", lat: 10.82, lon: 106.63, tier: 3 },
  { name: "Almaty", lat: 43.22, lon: 76.85, tier: 3 },
  // Oceania
  { name: "Sydney", lat: -33.87, lon: 151.21, tier: 1 },
  { name: "Melbourne", lat: -37.81, lon: 144.96, tier: 3 },
  { name: "Auckland", lat: -36.85, lon: 174.76, tier: 2 },
  { name: "Perth", lat: -31.95, lon: 115.86, tier: 3 },
  { name: "Fiji", lat: -18.13, lon: 178.43, tier: 3 },
];

/* ----- SVG helpers ----- */

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  for (const child of children) node.append(child);
  return node;
}

/* ----- Map ----- */

const UTC_LABELS: Array<{ text: string; lon: number }> = [
  { text: "−10", lon: -150 },
  { text: "−8", lon: -120 },
  { text: "−6", lon: -90 },
  { text: "−4", lon: -60 },
  { text: "−2", lon: -30 },
  { text: "0", lon: 0 },
  { text: "+2", lon: 30 },
  { text: "+4", lon: 60 },
  { text: "+6", lon: 90 },
  { text: "+8", lon: 120 },
  { text: "+10", lon: 150 },
];

export interface MapCallbacks {
  /** Called when the user hovers the map. lon/lat are null if mouse leaves. */
  onHover?: (lon: number | null, lat: number | null) => void;
  /** Called when the user clicks the map. Returns the chosen zone, if any. */
  onClick?: (zone: string) => void;
}

export interface BuildMapOptions {
  /** Zone considered "home" — gets a distinct ring around its marker. */
  homeZone?: string;
}

/**
 * Build the world map SVG. Interactive: hover shows a tooltip-style
 * highlight ring at the cursor; click adds the geographic zone at that point.
 *
 * Day/night: three atmospheric layers —
 *   1. night shade (full-map dark)
 *   2. twilight band (soft amber→transparent ring around the terminator)
 *   3. day gradient (warm amber, brightest at the subsolar point)
 * The terminator itself is drawn as a curved great-circle path that wraps at
 * the antimeridian, plus a subsolar glow marker.
 */
export function buildMapSvg(
  zones: string[],
  selectedTime: DateTime,
  callbacks: MapCallbacks = {},
  options: BuildMapOptions = {},
): SVGElement {
  const svg = svgEl("svg", {
    class: "map-svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "World map showing selected timezones. Click to add a timezone.",
    // Crop to fill the wrap (2:1 source). The wrap's aspect-ratio CSS matches
    // the viewBox so this never actually crops, but `slice` guarantees the
    // map always fills the container even if the wrap is slightly off-ratio.
    preserveAspectRatio: "xMidYMid slice",
  });

  // Defs: soft gradients for sun glow and twilight band.
  const defs = svgEl("defs", {});
  defs.innerHTML = `
    <radialGradient id="mapSunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="oklch(0.92 0.20 78)" stop-opacity="0.9"/>
      <stop offset="40%" stop-color="oklch(0.85 0.18 68)" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="oklch(0.78 0.16 62)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mapTwilight" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"  stop-color="oklch(0.72 0.14 55)" stop-opacity="0"/>
      <stop offset="50%" stop-color="oklch(0.72 0.14 55)" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="oklch(0.72 0.14 55)" stop-opacity="0"/>
    </linearGradient>
  `;
  svg.append(defs);

  // Hit-target background (captures mouse events across the whole map).
  const hit = svgEl("rect", { x: 0, y: 0, width: W, height: H, class: "map-hit" });
  svg.append(hit);

  // Graticule — kept quiet, 30° spacing.
  const grid = svgEl("g", { class: "map-grid" });
  for (let lon = -180; lon <= 180; lon += 30) {
    grid.append(svgEl("line", { x1: px(lon), y1: 0, x2: px(lon), y2: H }));
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    grid.append(svgEl("line", { x1: 0, y1: py(lat), x2: W, y2: py(lat) }));
  }
  svg.append(grid);

  // UTC offset bands (15deg vertical guides).
  const utcBands = svgEl("g", { class: "map-utc-bands" });
  for (let lon = -180; lon <= 180; lon += 15) {
    utcBands.append(svgEl("line", { class: "map-utc-band", x1: px(lon), y1: 0, x2: px(lon), y2: H }));
  }
  svg.append(utcBands);

  // Land outline (async).
  svg.append(svgEl("path", { class: "map-land" }));

  // Night-darkening overlay (covers the whole map, beneath the day gradient).
  const nightShade = svgEl("rect", { class: "map-night-shade", x: 0, y: 0, width: W, height: H });
  svg.append(nightShade);

  // Twilight band: a soft amber halo around the terminator curve, drawn as
  // two parallel strokes (inner + outer) with a blur-ish opacity ramp.
  const twilightGroup = svgEl("g", { class: "map-twilight-group" });
  svg.append(twilightGroup);
  appendTwilight(twilightGroup, selectedTime);

  // Daylight gradient overlay (sunlit side).
  const dayGroup = svgEl("g", { class: "map-day-group" });
  svg.append(dayGroup);
  appendDayGradient(dayGroup, selectedTime);

  // Curved terminator path (great circle, not a straight meridian).
  const terminatorPath = svgEl("path", { class: "map-terminator", d: terminatorPathD(selectedTime) });
  svg.append(terminatorPath);

  // Subsolar glow (radial, layered).
  const { lon: noonLon, lat: noonLat } = subsolarPoint(selectedTime);
  const sun = svgEl("circle", {
    class: "map-sun",
    cx: px(noonLon),
    cy: py(noonLat),
    r: 18,
    fill: "url(#mapSunGlow)",
  });
  svg.append(sun);
  // Crisp dot at the exact subsolar point.
  svg.append(
    svgEl("circle", { class: "map-sun-core", cx: px(noonLon), cy: py(noonLat), r: 2.5 }),
  );

  // UTC labels — top edge.
  const labels = svgEl("g", { class: "map-utc-labels" });
  for (const { text, lon } of UTC_LABELS) {
    const label = svgEl("text", {
      class: "map-utc-label",
      x: px(lon),
      y: 10,
      "text-anchor": "middle",
    });
    label.textContent = text;
    labels.append(label);
  }
  svg.append(labels);

  // Major city dots + labels, tagged with tier for density culling.
  const citiesGroup = svgEl("g", { class: "map-cities" });
  for (const city of MAP_CITIES) {
    const cx = px(city.lon);
    const cy = py(city.lat);
    const tierClass = `map-city-tier-${city.tier}`;
    citiesGroup.append(svgEl("circle", { class: `map-city-dot ${tierClass}`, cx, cy, r: city.tier === 1 ? 2.2 : city.tier === 2 ? 1.8 : 1.4 }));
    const dx = city.tier === 1 ? 5 : 4;
    const label = svgEl("text", { class: `map-city-label ${tierClass}`, x: cx + dx, y: cy + 0.5 });
    label.textContent = city.name;
    citiesGroup.append(label);
  }
  svg.append(citiesGroup);

  // Hover ring (hidden until mouse moves).
  const ring = svgEl("circle", { class: "map-cursor", cx: -100, cy: -100, r: 14 });
  ring.setAttribute("aria-hidden", "true");
  svg.append(ring);

  // Zone markers — placed via zone-coords.json (async, with sync fallback).
  const markersGroup = svgEl("g", { class: "map-markers" });
  svg.append(markersGroup);
  placeMarkers(markersGroup, zones, options.homeZone);

  /* ----- Interactivity ----- */

  let raf = 0;
  const updateRing = (evt: MouseEvent): void => {
    const rect = svg.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * W;
    const y = ((evt.clientY - rect.top) / rect.height) * H;
    ring.setAttribute("cx", String(x));
    ring.setAttribute("cy", String(y));
    const lon = lonAt(x);
    const lat = latAt(y);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => callbacks.onHover?.(lon, lat));
  };

  svg.addEventListener("mousemove", updateRing);
  svg.addEventListener("mouseleave", () => {
    cancelAnimationFrame(raf);
    ring.setAttribute("cx", "-100");
    ring.setAttribute("cy", "-100");
    callbacks.onHover?.(null, null);
  });
  svg.addEventListener("click", (e: MouseEvent) => {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const lon = lonAt(x);
    const lat = latAt(y);
    const zone = geoZoneAt(lat, lon);
    if (zone) callbacks.onClick?.(zone);
  });

  return svg;
}

/**
 * Build a curved terminator path (great-circle where the sun is on the
 * horizon). Returns an SVG path `d` string. Handles antimeridian wrapping
 * by drawing as multiple subpaths.
 */
export function terminatorPathD(utcTime: DateTime): string {
  const { lat: subLat, lon: subLon } = subsolarPoint(utcTime);
  // Sample the terminator curve from south pole to north pole.
  // At each latitude, the two terminator longitudes are subLon ± H where
  // cos(H) = -tan(lat)·tan(subLat). We draw both sunrises (west limb) and
  // sunsets (east limb).
  const lats: number[] = [];
  for (let i = 0; i <= 90; i++) lats.push(-89 + (178 * i) / 90); // -89..89
  const subLatR = (subLat * Math.PI) / 180;

  const segments: string[] = [];
  const build = (sign: 1 | -1): string => {
    const pts: Array<[number, number]> = [];
    for (const lat of lats) {
      const latR = (lat * Math.PI) / 180;
      const cosH = -Math.tan(latR) * Math.tan(subLatR);
      if (cosH > 1 || cosH < -1) {
        // Polar day/night at this latitude; skip (we extend edges separately).
        continue;
      }
      const hourAngle = Math.acos(cosH) * (180 / Math.PI);
      const lon = subLon + sign * hourAngle;
      pts.push([lon, lat]);
    }
    if (pts.length === 0) return "";
    // Build path from bottom edge of the map to the top edge, passing
    // through the sampled terminator points.
    const [firstLon] = pts[0];
    const [lastLon] = pts[pts.length - 1];
    let d = `M${px(firstLon).toFixed(2)} ${H} L${px(pts[0][0]).toFixed(2)} ${py(pts[0][1]).toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L${px(pts[i][0]).toFixed(2)} ${py(pts[i][1]).toFixed(2)}`;
    }
    d += ` L${px(lastLon).toFixed(2)} 0`;
    return d;
  };
  const west = build(-1);
  const east = build(1);
  if (west) segments.push(west);
  if (east) segments.push(east);
  return segments.join(" ");
}

/**
 * Append the twilight band: two soft strokes slightly inside/outside the
 * terminator to suggest the civil/nautical twilight ring (sun 0–6° below
 * the horizon).
 */
function appendTwilight(group: SVGElement, utcTime: DateTime): void {
  // We approximate the twilight band as a parallel offset of the terminator
  // curve by ±2.5° longitude at the equator (a small visual halo). Drawing
  // two strokes of different widths/opacities stacked produces a soft band
  // without needing SVG filters.
  const d = terminatorPathD(utcTime);
  group.append(
    svgEl("path", { class: "map-twilight map-twilight-outer", d }),
  );
  group.append(
    svgEl("path", { class: "map-twilight map-twilight-inner", d }),
  );
}

/**
 * Append the daylight gradient as a set of latitude-row rectangles.
 * Each row's daylight longitude span is filled with a warm color whose
 * intensity is proportional to solar elevation at the subsolar meridian for
 * that latitude. Rows in polar night get no day rect. Rows in polar day get
 * a full-width rect at moderate intensity.
 *
 * The gradient is approximated per-row by varying fill-opacity from the
 * center (subsolar meridian, brightest) toward the terminator (fading to 0).
 */
function appendDayGradient(group: SVGElement, utcTime: DateTime): void {
  const steps = 80;
  const bandH = H / steps;
  const bands = dayBands(utcTime, steps);
  const { lon: subLon } = subsolarPoint(utcTime);

  for (const b of bands) {
    if (Number.isNaN(b.xStart)) continue; // polar night — no day rect
    const yPx = b.y * H;

    const lat = 90 - b.y * 180;
    const isPolarDay = b.xStart === 0 && b.xEnd === 1;

    // Peak solar elevation at this latitude (at the subsolar meridian).
    const elev = solarElevation(lat, subLon, utcTime);
    // Intensity 0..1: map elevation 0..90 to opacity 0..0.55.
    const intensity = Math.max(0, Math.min(1, elev / 90)) * 0.55;

    if (isPolarDay) {
      // Full-width day rect (polar day).
      group.append(
        svgEl("rect", {
          class: "map-day",
          x: 0,
          y: yPx - bandH / 2,
          width: W,
          height: bandH,
          "fill-opacity": String(intensity * 0.7),
        }),
      );
      continue;
    }

    // Normal row: draw the day span, possibly wrapping the antimeridian.
    let x0 = b.xStart * W;
    let x1 = b.xEnd * W;
    if (x1 <= x0) x1 += W;

    if (x0 < 0) {
      // shouldn't happen after normalization, but guard
      group.append(
        svgEl("rect", {
          class: "map-day",
          x: 0,
          y: yPx - bandH / 2,
          width: x1,
          height: bandH,
          "fill-opacity": String(intensity),
        }),
      );
      group.append(
        svgEl("rect", {
          class: "map-day",
          x: x0 + W,
          y: yPx - bandH / 2,
          width: W - (x0 + W),
          height: bandH,
          "fill-opacity": String(intensity),
        }),
      );
    } else if (x1 > W) {
      group.append(
        svgEl("rect", {
          class: "map-day",
          x: x0,
          y: yPx - bandH / 2,
          width: W - x0,
          height: bandH,
          "fill-opacity": String(intensity),
        }),
      );
      group.append(
        svgEl("rect", {
          class: "map-day",
          x: 0,
          y: yPx - bandH / 2,
          width: x1 - W,
          height: bandH,
          "fill-opacity": String(intensity),
        }),
      );
    } else {
      group.append(
        svgEl("rect", {
          class: "map-day",
          x: x0,
          y: yPx - bandH / 2,
          width: x1 - x0,
          height: bandH,
          "fill-opacity": String(intensity),
        }),
      );
    }
  }
}

/** Place zone markers using zone-coords.json, with a synchronous fallback. */
function placeMarkers(group: SVGElement, zones: string[], homeZone?: string): void {
  // First render with fallback coords so markers appear immediately.
  for (const zone of zones) {
    const [lat, lon] = fallbackCoords(zone);
    const cx = px(lon);
    const cy = py(lat);
    const isHome = homeZone === zone;
    const marker = svgEl("circle", {
      class: `map-marker${isHome ? " is-home" : ""}`,
      cx,
      cy,
      r: 5,
    });
    marker.dataset.zone = zone;
    const title = svgEl("title", {});
    title.textContent = zone;
    marker.append(title);
    // Home markers get an outer halo ring so they read as the anchor.
    if (isHome) {
      const halo = svgEl("circle", {
        class: "map-marker-halo",
        cx,
        cy,
        r: 9,
      });
      halo.dataset.zone = zone;
      group.append(halo);
    }
    group.append(marker);
  }
  // Then refine with real coords when zone-coords.json is available.
  loadZoneCoords()
    .then((coords) => {
      const markerEls = group.querySelectorAll<SVGCircleElement>(".map-marker, .map-marker-halo");
      markerEls.forEach((marker) => {
        const zone = marker.dataset.zone;
        if (!zone) return;
        const c = coords[zone];
        if (!c) return;
        marker.setAttribute("cx", String(px(c[1])));
        marker.setAttribute("cy", String(py(c[0])));
      });
    })
    .catch(() => {
      // keep fallback
    });
}

// Re-export for consumers that want the projection helpers (e.g. tests).
export { px, py, lonAt, latAt };