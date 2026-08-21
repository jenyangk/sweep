import { DateTime } from "luxon";
import { el, clear, on } from "./lib/dom";
import { toggleTheme } from "./lib/theme";
import { icons } from "./icons";
import {
  ALL_TIMEZONES,
  getTimezoneInfo,
} from "./lib/timezoneHelpers";
import { buildMapSvg, ensureLandData, terminatorPathD } from "./lib/map";
import { geoZoneAt } from "./lib/geoZone";
import { CITY_ALIASES } from "./lib/city-aliases";
import { subsolarPoint, dayBands, solarElevation } from "./lib/terminator";
import { loadZoneCoords } from "./lib/zoneCoords";
import {
  loadZones,
  saveZones,
  loadHomeZone,
  saveHomeZone,
  loadUse24Hour,
  saveUse24Hour,
  saveRange,
  type PersistedRange,
} from "./lib/persistence";

interface AppState {
  zones: string[];
  homeZone: string;
  use24Hour: boolean;
  isLive: boolean;
  selectedTime: DateTime;
  /** Selected column range (inclusive). Null = no range, just the scrubber column. */
  range: PersistedRange | null;
}

// Hours shown on each side of the selected (center) hour.
// 12 back + 1 center + 12 forward = 25 columns.
const HOUR_SPAN = 12;
const COL_COUNT = HOUR_SPAN * 2 + 1;

function cityLabel(iana: string): string {
  if (iana === "UTC") return "UTC";
  const parts = iana.split("/");
  return parts[parts.length - 1].replaceAll("_", " ").toLowerCase();
}

/**
 * Time-of-day band. 0 night, 1 morning, 2 day, 3 evening, 4 night.
 * Drives the subtle tonal variation across grid cells.
 */
function timeBand(hour: number): 0 | 1 | 2 | 3 | 4 {
  if (hour >= 0 && hour < 6) return 0; // deep night
  if (hour >= 6 && hour < 9) return 1; // morning
  if (hour >= 9 && hour < 18) return 2; // day
  if (hour >= 18 && hour < 21) return 3; // evening
  return 4; // night
}

/** Format a UTC offset (minutes) as a compact "+H", "+H:MM", "-H:MM" string. */
function formatOffsetMinutes(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "±";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (m === 0) return `${sign}${h}`;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function initApp(): void {
  const root = document.getElementById("root");
  if (!root) return;
  clear(root);

  const state: AppState = {
    zones: loadZones(),
    homeZone: loadHomeZone(),
    use24Hour: loadUse24Hour(),
    isLive: true,
    selectedTime: DateTime.now(),
    // Drop any persisted range — ranges are ephemeral per session now, to
    // avoid the "06-08 highlighted" bug from stale localStorage data.
    range: null,
  };
  // Clear any stale persisted range so it doesn't haunt future loads.
  saveRange(null);
  // Make sure homeZone is actually in zones (and first).
  if (!state.zones.includes(state.homeZone)) {
    state.zones = [state.homeZone, ...state.zones.filter((z) => z !== state.homeZone)];
  } else {
    state.zones = [state.homeZone, ...state.zones.filter((z) => z !== state.homeZone)];
  }

  // ----- Header -----
  const muMark = el("a", { class: "mu-mark", href: "https://muniee.com", ariaLabel: "muniee" }, "μ");
  const logo = el("a", { class: "logo", href: "/" }, "timezones");
  const themeBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm theme-toggle",
      ariaLabel: "Toggle theme",
      onClick: () => {
        toggleTheme();
        themeBtn.classList.add("icon-spin");
        setTimeout(() => themeBtn.classList.remove("icon-spin"), 500);
      },
    },
    "◐",
  );
  const header = el("header", { class: "sr-header" }, [muMark, logo, themeBtn]);

  // ----- Hero -----
  const hero = el("section", { class: "page-enter" }, [
    el("h1", {}, "compare times across timezones."),
    el(
      "p",
      { style: { maxWidth: "560px", color: "var(--muted)", marginTop: "10px" } },
      "add zones, slide the clock, hover the grid. click the map to jump to a region. runs in your browser.",
    ),
  ]);

  // ----- Controls: search, format, now, scrubber -----
  const searchInput = el("input", {
    class: "search-input",
    type: "text",
    ariaLabel: "Add timezone",
  });
  searchInput.placeholder = "add a timezone, e.g. tokyo";
  searchInput.autocomplete = "off";
  const searchResults = el("div", { class: "search-results" });
  searchResults.hidden = true;
  const searchWrap = el("div", { class: "search-wrap" }, [searchInput, searchResults]);

  const hour12Btn = el(
    "button",
    { class: "pill", dataset: { active: String(!state.use24Hour), format: "12" }, onClick: () => setFormat(false) },
    "12h",
  );
  const hour24Btn = el(
    "button",
    { class: "pill", dataset: { active: String(state.use24Hour), format: "24" }, onClick: () => setFormat(true) },
    "24h",
  );
  const formatToggle = el(
    "div",
    { class: "pill-toggle", role: "group", ariaLabel: "Time format" },
    [hour12Btn, hour24Btn],
  );

  const nowBtn = el(
    "button",
    { class: "btn btn-ghost btn-sm", onClick: () => goNow() },
    [icons.clock, "now"],
  );

  const timeInput = el("input", {
    id: "time-input",
    type: "datetime-local",
    ariaLabel: "Selected time",
    onChange: onTimeChange,
  });
  const timeLabel = el("label", { class: "section-label", style: { marginBottom: "8px" } }, "// time");
  timeLabel.htmlFor = "time-input";

  // Range controls (clear range selection).
  const clearRangeBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      onClick: () => clearRange(),
      ariaLabel: "Clear time range",
      style: { display: state.range ? "" : "none" },
    },
    [icons.close, "clear range"],
  );

  const controls = el("div", { class: "controls" }, [searchWrap, formatToggle, nowBtn, clearRangeBtn]);
  const controlsSection = el("section", { class: "page-enter section-gap" }, [
    controls,
    timeLabel,
    timeInput,
  ]);

  // ----- Grid (primary view) -----
  const gridLabel = el("p", { class: "section-label" }, "// grid");
  const gridScroll = el("div", { class: "grid-scroll" });
  const gridWrap = el("div", { class: "grid-wrap" }, gridScroll);
  const gridSection = el("section", { class: "page-enter section-gap" }, [
    gridLabel,
    gridWrap,
  ]);

  // ----- Map (secondary view) -----
  const mapLabel = el("p", { class: "section-label" }, "// map");
  const mapWrap = el("div", { class: "map-wrap" });
  const mapTooltip = el("div", { class: "map-tooltip", hidden: true });
  const mapLegend = el("div", { class: "map-legend", ariaHidden: true }, [
    el("span", { class: "map-legend-item map-legend-sun" }, [el("span", { class: "map-legend-swatch map-legend-swatch-sun" }), "solar noon"]),
    el("span", { class: "map-legend-item map-legend-twilight" }, [el("span", { class: "map-legend-swatch map-legend-swatch-twilight" }), "twilight"]),
    el("span", { class: "map-legend-item map-legend-home" }, [el("span", { class: "map-legend-swatch map-legend-swatch-home" }), "home"]),
    el("span", { class: "map-legend-item map-legend-marker" }, [el("span", { class: "map-legend-swatch map-legend-swatch-marker" }), "zone"]),
  ]);
  const mapSection = el("section", { class: "page-enter section-gap map-section" }, [
    mapLabel,
    mapWrap,
    mapTooltip,
    mapLegend,
  ]);

  const main = el("main", {}, [hero, controlsSection, gridSection, mapSection]);
  root.append(header, main);

  /* ----- Rendering ----- */

  function updateScrubber(): void {
    if (document.activeElement !== timeInput) {
      timeInput.value = state.selectedTime
        .setZone(state.homeZone)
        .toFormat("yyyy-MM-dd'T'HH:mm");
    }
  }

  /** Build the hour grid. Columns = hours around selectedTime. Rows = zones. */
  function renderGrid(): void {
    clear(gridScroll);
    if (state.zones.length === 0) return;

    const homeTime = state.selectedTime.setZone(state.homeZone);
    const startHour = homeTime.startOf("hour").minus({ hours: HOUR_SPAN });

    const cols: DateTime[] = [];
    for (let i = 0; i < COL_COUNT; i++) {
      cols.push(startHour.plus({ hours: i }));
    }

    // Determine the "now" column index (the column whose hour matches selectedTime).
    const nowCol = HOUR_SPAN; // center column by construction.

    // Column header: a thin date strip (only marks day boundaries), kept small.
    const headerRow = el("div", { class: "grid-header" }, [
      el("div", { class: "row-label" }, ""),
    ]);
    for (let i = 0; i < COL_COUNT; i++) {
      const homeAt = cols[i].setZone(state.homeZone);
      const prev = i > 0 ? cols[i - 1].setZone(state.homeZone) : null;
      const dateChanged = !prev || !prev.hasSame(homeAt, "day");
      const inRange = isColInRange(i);
      const cell = el(
        "div",
        {
          class:
            `grid-date band-${timeBand(homeAt.hour)}` +
            (dateChanged ? " is-date-change" : "") +
            (inRange ? " is-range" : "") +
            (i === nowCol ? " is-now-col" : ""),
          dataset: { col: String(i) },
        },
        dateChanged ? homeAt.toFormat("ccc dd") : "",
      );
      headerRow.append(cell);
    }
    gridScroll.append(headerRow);

    // Rows: one per zone
    for (const zone of state.zones) {
      const isHome = zone === state.homeZone;
      const info = getTimezoneInfo(zone, state.selectedTime);
      const homeOffsetMin = state.selectedTime.setZone(state.homeZone).offset;
      const zoneOffsetMin = state.selectedTime.setZone(zone).offset;
      const offsetDiff = zoneOffsetMin - homeOffsetMin;
      const offsetStr = offsetDiff === 0 ? "+0" : formatOffsetMinutes(offsetDiff);

      const row = el("div", { class: `grid-row${isHome ? " is-home" : ""}`, dataset: { zone } }, []);

      // Row label: city, abbr, offset badge, remove. The row label (city name)
      // is the home-zone selector — clicking a non-home row label sets it as home.
      const labelChildren: Array<Node | string> = [
        el("div", { class: "row-city" }, [
          isHome ? icons.globe : null,
          el("span", { class: "row-city-name", title: zone }, cityLabel(zone)),
        ]),
        el("div", { class: "row-meta" }, [
          el("span", { class: "row-abbr" }, info?.abbreviation ?? ""),
          el("span", { class: "offset-badge" }, offsetStr),
        ]),
      ];
      if (!isHome) {
        labelChildren.push(
          el("button", {
            class: "btn btn-ghost btn-sm row-remove",
            ariaLabel: `Remove ${zone}`,
            onClick: () => removeZone(zone),
          }, icons.close),
        );
      }
      const label = el("div", { class: "row-label" }, labelChildren);
      // Click the row label (city name) to set home. Cells do NOT change home.
      if (!isHome) on(label, "click", () => setHome(zone));
      row.append(label);

      // Cells: always show the TIME, not the date. Date boundaries are
      // conveyed by the thin header strip and a small date pill on the cell.
      for (let i = 0; i < COL_COUNT; i++) {
        const local = cols[i].setZone(zone);
        const homeAt = cols[i].setZone(state.homeZone);
        const dateChanged = !homeAt.hasSame(local, "day");
        const isNow = i === nowCol;
        const inRange = isColInRange(i);
        const cellClasses = [
          "grid-cell",
          `band-${timeBand(local.hour)}`,
          dateChanged ? "is-date-change" : "",
          isNow ? "is-now" : "",
          isHome ? "is-home" : "",
          inRange ? "is-range" : "",
        ]
          .filter(Boolean)
          .join(" ");

        // Always show the hour. On a day boundary, prepend a tiny date pill.
        const cellChildren: Array<Node | string> = [];
        if (dateChanged) {
          cellChildren.push(
            el("span", { class: "cell-date-pill" }, local.toFormat("ccc")),
          );
        }
        const timeLabel = state.use24Hour
          ? local.toFormat("HH")
          : local.toFormat("h");
        cellChildren.push(timeLabel);

        const cell = el(
          "div",
          { class: cellClasses, dataset: { col: String(i), zone } },
          cellChildren,
        );
        // Cells are NOT clickable to change home. Only range selection (shift+click).
        row.append(cell);
      }

      gridScroll.append(row);
    }

    applyHoverColumn();
    // If a range is selected, show the range summary.
    renderRangeSummary();
  }

  /** Is column `col` inside the selected range? */
  function isColInRange(col: number): boolean {
    if (!state.range) return false;
    const a = Math.min(state.range.startCol, state.range.endCol);
    const b = Math.max(state.range.startCol, state.range.endCol);
    return col >= a && col <= b;
  }

  let hoveredCol = -1;
  function applyHoverColumn(): void {
    for (const cell of gridScroll.querySelectorAll<HTMLElement>(".grid-cell, .grid-date")) {
      const col = Number(cell.dataset.col);
      cell.classList.toggle("is-hover", col === hoveredCol);
    }
  }
  // Bind hover + range-click ONCE on the grid container, not per render.
  // renderGrid() rebuilds the cells but the container persists, so a single
  // delegated listener handles all current and future cells.
  let rangeAnchor: number | null = null;
  function bindGridInteractions(): void {
    gridScroll.addEventListener("mousemove", (e) => {
      const target = e.target as HTMLElement;
      const cell = target.closest<HTMLElement>(".grid-cell");
      if (!cell) return;
      const col = Number(cell.dataset.col);
      if (col === hoveredCol) return;
      hoveredCol = col;
      applyHoverColumn();
    });
    gridScroll.addEventListener("mouseleave", () => {
      hoveredCol = -1;
      applyHoverColumn();
    });
    gridScroll.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      // Ignore clicks on the row label (those set home) or the remove button.
      if (target.closest(".row-label")) return;
      const cell = target.closest<HTMLElement>(".grid-cell");
      if (!cell) return;
      const col = Number(cell.dataset.col);
      if (rangeAnchor === null) {
        // First click: set start.
        rangeAnchor = col;
        state.range = { startCol: col, endCol: col };
      } else {
        // Second click: set end, clear anchor.
        state.range = { startCol: rangeAnchor, endCol: col };
        rangeAnchor = null;
      }
      saveRange(state.range);
      clearRangeBtn.style.display = state.range ? "" : "none";
      renderGrid();
      e.preventDefault();
    });
  }

  function clearRange(): void {
    state.range = null;
    rangeAnchor = null;
    saveRange(null);
    clearRangeBtn.style.display = "none";
    renderGrid();
  }

  /**
   * Render a summary of the selected time range across all zones.
   * Shows "10:00 AM – 12:00 PM" in the home zone, and the equivalent
   * range in every other zone, so the user can compare the range across
   * timezones at a glance.
   */
  function renderRangeSummary(): void {
    const existing = gridSection.querySelector(".range-summary");
    if (existing) existing.remove();
    if (!state.range) return;
    const a = Math.min(state.range.startCol, state.range.endCol);
    const b = Math.max(state.range.startCol, state.range.endCol);
    if (a === b) return; // single column, no range to show

    const homeTime = state.selectedTime.setZone(state.homeZone);
    const startHour = homeTime.startOf("hour").minus({ hours: HOUR_SPAN });
    const fmt = (dt: DateTime): string =>
      state.use24Hour
        ? dt.toFormat("HH:mm")
        : dt.toFormat("h:mm a");

    const rows = state.zones.map((zone) => {
      const start = startHour.plus({ hours: a }).setZone(zone);
      const end = startHour.plus({ hours: b }).setZone(zone);
      const isHome = zone === state.homeZone;
      return el("div", { class: `range-summary-row${isHome ? " is-home" : ""}` }, [
        el("span", { class: "range-summary-zone" }, cityLabel(zone)),
        el("span", { class: "range-summary-times" }, `${fmt(start)} – ${fmt(end)}`),
      ]);
    });

    const summary = el("div", { class: "range-summary" }, [
      el("div", { class: "range-summary-header" }, [
        el("span", {}, "selected range"),
        el("span", { class: "range-summary-clear", onClick: () => clearRange() }, "clear"),
      ]),
      ...rows,
    ]);
    gridSection.append(summary);
  }

  function setHome(zone: string): void {
    if (state.homeZone === zone) return;
    // Move zone to top of list
    state.zones = [zone, ...state.zones.filter((z) => z !== zone)];
    state.homeZone = zone;
    saveHomeZone(zone);
    saveZones(state.zones);
    renderGrid();
    renderMap(true);
  }

  /* ----- Map rendering (with incremental updates) ----- */

  let mapSvg: SVGElement | null = null;
  /**
   * Render (or update) the map. A full rebuild happens when `force` is true
   * or when no SVG exists. Otherwise we only update the terminator + markers
   * in place — cheap enough to run every second without rebuilding the SVG.
   */
  function renderMap(force = false): void {
    if (force || !mapSvg) {
      clear(mapWrap);
      mapSvg = buildMapSvg(state.zones, state.selectedTime, {
        onHover: (lon, lat) => {
          if (lon === null || lat === null) {
            mapTooltip.hidden = true;
            return;
          }
          const zone = geoZoneAt(lat, lon);
          if (!zone) {
            mapTooltip.hidden = true;
            return;
          }
          // Real offset for the hovered zone at the selected time (handles :30/:45).
          const offsetMin = state.selectedTime.setZone(zone).offset;
          const abbr = state.selectedTime.setZone(zone).offsetNameShort || "";
          mapTooltip.hidden = false;
          clear(mapTooltip);
          mapTooltip.append(
            el("div", { class: "map-tooltip-zone" }, cityLabel(zone)),
            el("div", { class: "map-tooltip-offset" }, `UTC${formatOffsetMinutes(offsetMin)}`),
            el("div", { class: "map-tooltip-abbr" }, abbr),
            el("div", { class: "map-tooltip-hint" }, "click to add this zone"),
          );
        },
        onClick: (zone) => addZone(zone),
      }, { homeZone: state.homeZone });
      mapWrap.append(mapSvg);
      ensureLandData(mapSvg);
      return;
    }
    // Incremental: update terminator and markers in place.
    updateTerminator(mapSvg, state.selectedTime);
    syncMarkers(mapSvg, state.zones);
  }

  /* ----- Actions ----- */

  function goNow(): void {
    state.isLive = true;
    state.selectedTime = DateTime.now();
    updateScrubber();
    renderGrid();
    renderMap(true);
  }

  function setFormat(use24: boolean): void {
    if (state.use24Hour === use24) return;
    state.use24Hour = use24;
    saveUse24Hour(use24);
    hour12Btn.dataset.active = String(!use24);
    hour24Btn.dataset.active = String(use24);
    renderGrid();
  }

  function onTimeChange(): void {
    const v = timeInput.value;
    if (!v) return;
    // Parse in the HOME zone (not the browser's local zone). datetime-local
    // values are naive; we anchor them to homeZone explicitly.
    const dt = DateTime.fromFormat(v, "yyyy-MM-dd'T'HH:mm", { zone: state.homeZone });
    if (!dt.isValid) return;
    state.isLive = false;
    state.selectedTime = dt;
    updateScrubber();
    renderGrid();
    renderMap(true);
  }

  function addZone(zone: string): void {
    if (state.zones.includes(zone)) return;
    state.zones.push(zone);
    saveZones(state.zones);
    searchInput.value = "";
    hideResults();
    renderGrid();
    renderMap(true);
    searchInput.focus();
  }

  function removeZone(zone: string): void {
    if (zone === state.homeZone) return; // don't remove home
    state.zones = state.zones.filter((z) => z !== zone);
    saveZones(state.zones);
    renderGrid();
    renderMap(true);
  }

  /* ----- Search dropdown (full IANA list + city aliases) ----- */
  function renderSearch(): void {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      // Show a few common suggestions when empty.
      const suggestions = ALL_TIMEZONES.slice(0, 8);
      renderSearchItems(suggestions);
      return;
    }
    // 1. Exact alias match (tokyo, nyc, delhi, ...) -> top result.
    const aliasHit = CITY_ALIASES[q];
    // 2. Alias keys that contain the query (e.g. "new" -> "new york", "newyork").
    const aliasMatches = Object.entries(CITY_ALIASES)
      .filter(([k]) => k.includes(q))
      .map(([, iana]) => iana);
    // 3. IANA contains the query (e.g. "asia", "europe/k", "kolkata").
    const ianaMatches = ALL_TIMEZONES.filter((z) => z.toLowerCase().includes(q));
    // Merge, dedupe, drop already-added zones, cap at 12.
    const seen = new Set<string>();
    const ordered: string[] = [];
    const push = (z: string | undefined) => {
      if (!z) return;
      if (seen.has(z)) return;
      if (state.zones.includes(z)) return;
      seen.add(z);
      ordered.push(z);
    };
    push(aliasHit);
    for (const z of aliasMatches) push(z);
    for (const z of ianaMatches) push(z);
    renderSearchItems(ordered.slice(0, 12));
  }

  function renderSearchItems(matches: string[]): void {
    clear(searchResults);
    if (!matches.length) {
      searchResults.hidden = true;
      return;
    }
    searchResults.hidden = false;
    searchResults.append(
      ...matches.map((z) =>
        el(
          "button",
          { class: "search-item", type: "button", onClick: () => addZone(z) },
          [icons.plus, z],
        ),
      ),
    );
  }

  function hideResults(): void {
    searchResults.hidden = true;
  }

  on(searchInput, "focus", renderSearch);
  on(searchInput, "input", renderSearch);
  on(searchInput, "keydown", (e) => {
    if (e.key === "Escape") {
      hideResults();
      searchInput.blur();
    } else if (e.key === "Enter") {
      const first = searchResults.querySelector(".search-item");
      if (first) (first as HTMLButtonElement).click();
    }
  });
  on(document, "click", (e) => {
    if (!searchWrap.contains(e.target as Node)) hideResults();
  });

  /* ----- Live clock ----- */
  // Update every second, but avoid rebuilding the SVG every tick.
  // - Scrubber text + grid update every tick (cheap DOM writes).
  // - Map terminator only updates when the hour changes (DST/noon shifts).
  let lastTermHour = -1;
  window.setInterval(() => {
    if (!state.isLive) return;
    state.selectedTime = DateTime.now();
    updateScrubber();
    renderGrid();
    // Rebuild map only when the UTC hour changed (terminator moves ~15deg/hr).
    const utcHour = state.selectedTime.toUTC().hour;
    if (utcHour !== lastTermHour) {
      lastTermHour = utcHour;
      renderMap(true);
    }
  }, 1000);

  // Bind hover + range-click on the grid ONCE (delegated on the container).
  bindGridInteractions();

  updateScrubber();
  renderGrid();
  renderMap(true);
}

/* ----- Map incremental-update helpers (module-private) ----- */

/** Update the day gradient + noon line on an existing SVG without rebuilding it. */
function updateTerminator(svg: SVGElement, selectedTime: DateTime): void {
  // Remove old day gradient, night shade, twilight, terminator path, and sun.
  const staleClasses = [
    ".map-day-group",
    ".map-night-shade",
    ".map-twilight-group",
    ".map-terminator",
    ".map-sun",
    ".map-sun-core",
  ];
  for (const cls of staleClasses) {
    const el = svg.querySelector(cls);
    if (el) el.remove();
  }

  const W = 800;
  const H = 400;
  const px = (lon: number): number => ((lon + 180) / 360) * W;
  const py = (lat: number): number => ((90 - lat) / 180) * H;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  // Night-shade rect: full map, darkens everything; day gradient goes on top.
  const nightShade = svgEl("rect", { class: "map-night-shade", x: 0, y: 0, width: W, height: H });
  // Twilight band (soft halo around terminator).
  const twilightGroup = svgEl("g", { class: "map-twilight-group" });
  const twilightD = terminatorPathD(selectedTime);
  twilightGroup.append(svgEl("path", { class: "map-twilight map-twilight-outer", d: twilightD }));
  twilightGroup.append(svgEl("path", { class: "map-twilight map-twilight-inner", d: twilightD }));

  // Day gradient group.
  const dayGroup = svgEl("g", { class: "map-day-group" });
  const steps = 80;
  const bandH = H / steps;
  const bands = dayBands(selectedTime, steps);
  const { lat: subLat, lon: subLon } = subsolarPoint(selectedTime);

  for (const b of bands) {
    if (Number.isNaN(b.xStart)) continue; // polar night
    const yPx = b.y * H;
    const lat = 90 - b.y * 180;
    const isPolarDay = b.xStart === 0 && b.xEnd === 1;
    const elev = solarElevation(lat, subLon, selectedTime);
    const intensity = Math.max(0, Math.min(1, elev / 90)) * 0.55;
    if (isPolarDay) {
      dayGroup.append(
        svgEl("rect", { class: "map-day", x: 0, y: yPx - bandH / 2, width: W, height: bandH, "fill-opacity": String(intensity * 0.7) }),
      );
      continue;
    }
    let x0 = b.xStart * W;
    let x1 = b.xEnd * W;
    if (x1 <= x0) x1 += W;
    if (x0 < 0) {
      dayGroup.append(svgEl("rect", { class: "map-day", x: 0, y: yPx - bandH / 2, width: x1, height: bandH, "fill-opacity": String(intensity) }));
      dayGroup.append(svgEl("rect", { class: "map-day", x: x0 + W, y: yPx - bandH / 2, width: W - (x0 + W), height: bandH, "fill-opacity": String(intensity) }));
    } else if (x1 > W) {
      dayGroup.append(svgEl("rect", { class: "map-day", x: x0, y: yPx - bandH / 2, width: W - x0, height: bandH, "fill-opacity": String(intensity) }));
      dayGroup.append(svgEl("rect", { class: "map-day", x: 0, y: yPx - bandH / 2, width: x1 - W, height: bandH, "fill-opacity": String(intensity) }));
    } else {
      dayGroup.append(svgEl("rect", { class: "map-day", x: x0, y: yPx - bandH / 2, width: x1 - x0, height: bandH, "fill-opacity": String(intensity) }));
    }
  }

  // Curved terminator path + subsolar glow.
  const termPath = svgEl("path", { class: "map-terminator", d: twilightD });
  const sun = svgEl("circle", { class: "map-sun", cx: px(subLon), cy: py(subLat), r: 18, fill: "url(#mapSunGlow)" });
  const sunCore = svgEl("circle", { class: "map-sun-core", cx: px(subLon), cy: py(subLat), r: 2.5 });

  // Insert before UTC labels (keep labels on top of shade/gradient but
  // below markers).
  const labels = svg.querySelector(".map-utc-labels");
  if (labels) {
    svg.insertBefore(nightShade, labels);
    svg.insertBefore(twilightGroup, labels);
    svg.insertBefore(dayGroup, labels);
  } else {
    svg.append(nightShade, twilightGroup, dayGroup);
  }
  const markers = svg.querySelector(".map-markers");
  if (markers) {
    svg.insertBefore(termPath, markers);
    svg.insertBefore(sun, markers);
    svg.insertBefore(sunCore, markers);
  } else {
    svg.append(termPath, sun, sunCore);
  }
}

/** Add/remove zone markers to match `zones` without rebuilding the whole SVG. */
function syncMarkers(svg: SVGElement, zones: string[]): void {
  const group = svg.querySelector(".map-markers");
  if (!group) return;
  const existing = new Map<string, SVGCircleElement>();
  for (const m of group.querySelectorAll<SVGCircleElement>(".map-marker")) {
    const t = m.querySelector("title");
    if (t?.textContent) existing.set(t.textContent, m);
  }
  const wanted = new Set(zones);
  // Remove markers no longer wanted.
  for (const [zone, marker] of existing) {
    if (!wanted.has(zone)) marker.remove();
  }
  // Add markers for new zones.
  const W = 800;
  const H = 400;
  const px = (lon: number): number => ((lon + 180) / 360) * W;
  const py = (lat: number): number => ((90 - lat) / 180) * H;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const REGION_COORDS: Record<string, [number, number]> = {
    Africa: [5, 20], America: [40, -100], Antarctic: [-80, 0], Arctic: [80, 0],
    Asia: [40, 90], Atlantic: [40, -30], Australia: [-25, 135], Etc: [30, 0],
    Europe: [50, 10], Indian: [-20, 70], Pacific: [-15, -140],
  };
  const fallback = (zone: string): [number, number] => {
    if (zone === "UTC") return [51.5, -0.13];
    return REGION_COORDS[zone.split("/")[0]] ?? [0, 0];
  };
  for (const zone of zones) {
    if (existing.has(zone)) continue;
    const [lat, lon] = fallback(zone);
    const marker = svgEl("circle", { class: "map-marker", cx: px(lon), cy: py(lat), r: 5 }) as SVGCircleElement;
    const title = svgEl("title", {});
    title.textContent = zone;
    marker.append(title);
    group.append(marker);
  }
  // Refine all markers with accurate coords from zone-coords.json.
  loadZoneCoords()
    .then((coords) => {
      for (const m of group.querySelectorAll<SVGCircleElement>(".map-marker")) {
        const t = m.querySelector("title");
        const zone = t?.textContent;
        if (!zone) continue;
        const c = coords[zone];
        if (!c) continue;
        m.setAttribute("cx", String(px(c[1])));
        m.setAttribute("cy", String(py(c[0])));
      }
    })
    .catch(() => {
      // keep fallback
    });
}