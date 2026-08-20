import type { DateTime } from "luxon";
import { mesh } from "topojson-client";
import { CITY_COORDINATES, nearestZone } from "./timezoneHelpers";

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

/* ----- Zone markers ----- */

const REGION_COORDS: Record<string, { lat: number; lon: number }> = {
  Africa: { lat: 5, lon: 20 },
  America: { lat: 40, lon: -100 },
  Antarctic: { lat: -80, lon: 0 },
  Arctic: { lat: 80, lon: 0 },
  Asia: { lat: 40, lon: 90 },
  Atlantic: { lat: 40, lon: -30 },
  Australia: { lat: -25, lon: 135 },
  Etc: { lat: 30, lon: 0 },
  Europe: { lat: 50, lon: 10 },
  Indian: { lat: -20, lon: 70 },
  Pacific: { lat: -15, lon: -140 },
};

function zoneCoords(zone: string): { lat: number; lon: number } {
  const known = CITY_COORDINATES.find((c) => c.timezone === zone);
  if (known) return { lat: known.lat, lon: known.lon };
  if (zone === "UTC") return { lat: 51.5, lon: -0.13 };
  const region = zone.split("/")[0];
  return REGION_COORDS[region] ?? { lat: 0, lon: 0 };
}

/* ----- SVG helpers ----- */

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

/* ----- Map ----- */

const UTC_LABELS: Array<{ text: string; lon: number }> = [
  { text: "UTC-8", lon: -120 },
  { text: "UTC-5", lon: -75 },
  { text: "UTC", lon: 0 },
  { text: "UTC+1", lon: 15 },
  { text: "UTC+8", lon: 120 },
];

export interface MapCallbacks {
  /** Called when the user hovers the map. lon/lat are 0 if mouse leaves. */
  onHover?: (lon: number | null, lat: number | null) => void;
  /** Called when the user clicks the map. Returns the chosen zone, if any. */
  onClick?: (zone: string) => void;
}

/**
 * Build the world map SVG. Interactive: hover shows a tooltip-style
 * highlight ring at the cursor; click adds the nearest zone.
 */
export function buildMapSvg(
  zones: string[],
  selectedTime: DateTime,
  callbacks: MapCallbacks = {},
): SVGElement {
  const svg = svgEl("svg", {
    class: "map-svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "World map showing selected timezones. Click to add a timezone.",
  });

  // Hit-target background (captures mouse events across the whole map).
  const hit = svgEl("rect", { x: 0, y: 0, width: W, height: H, class: "map-hit" });
  svg.append(hit);

  // Graticule
  const grid = svgEl("g", { class: "map-grid" });
  for (let lon = -180; lon <= 180; lon += 30) {
    grid.append(svgEl("line", { x1: px(lon), y1: 0, x2: px(lon), y2: H }));
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    grid.append(svgEl("line", { x1: 0, y1: py(lat), x2: W, y2: py(lat) }));
  }
  svg.append(grid);

  // UTC offset bands
  const bands = svgEl("g", { class: "map-utc-bands" });
  for (let lon = -180; lon <= 180; lon += 15) {
    bands.append(svgEl("line", { class: "map-utc-band", x1: px(lon), y1: 0, x2: px(lon), y2: H }));
  }
  svg.append(bands);

  // Land outline (async)
  svg.append(svgEl("path", { class: "map-land" }));

  // Day/night terminator
  const utcHours = (((selectedTime.toMillis() / 3_600_000) % 24) + 24) % 24;
  const noonLon = (12 - utcHours) * 15;
  const noonX = px(noonLon);
  svg.append(
    svgEl("line", { class: "map-terminator", x1: noonX, y1: 0, x2: noonX, y2: H }),
  );
  const nightStart = noonX + 200; // dusk meridian (18:00 solar)
  const nightEnd = noonX + 600; // dawn meridian (06:00 solar)
  const nightRect = (x0: number, x1: number): void => {
    if (x1 <= x0) return;
    svg.append(svgEl("rect", { class: "map-night", x: x0, y: 0, width: x1 - x0, height: H }));
  };
  if (nightEnd <= W) {
    nightRect(nightStart, nightEnd);
  } else if (nightStart < W) {
    nightRect(nightStart, W);
    nightRect(0, nightEnd - W);
  } else {
    nightRect(nightStart - W, nightEnd - W);
  }

  // UTC labels
  const labels = svgEl("g", { class: "map-utc-labels" });
  for (const { text, lon } of UTC_LABELS) {
    const label = svgEl("text", {
      class: "map-utc-label",
      x: px(lon),
      y: 12,
      "text-anchor": "middle",
    });
    label.textContent = text;
    labels.append(label);
  }
  svg.append(labels);

  // Hover ring (hidden until mouse moves)
  const ring = svgEl("circle", {
    class: "map-cursor",
    cx: -100,
    cy: -100,
    r: 14,
  });
  ring.setAttribute("aria-hidden", "true");
  svg.append(ring);

  // Zone markers
  for (const zone of zones) {
    const { lat, lon } = zoneCoords(zone);
    const marker = svgEl("circle", {
      class: "map-marker",
      cx: px(lon),
      cy: py(lat),
      r: 5,
    });
    const title = svgEl("title", {});
    title.textContent = zone;
    marker.append(title);
    svg.append(marker);
  }

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
    const zone = nearestZone(lat, lon);
    if (zone) callbacks.onClick?.(zone);
  });

  return svg;
}