import { DateTime } from "luxon";
import { el, clear, on } from "./lib/dom";
import { toggleTheme } from "./lib/theme";
import { icons } from "./icons";
import {
  ALL_TIMEZONES,
  getTimezoneInfo,
  formatUtcOffset,
  lonToUtcOffsetHours,
} from "./lib/timezoneHelpers";
import { buildMapSvg, ensureLandData } from "./lib/map";

interface AppState {
  zones: string[];
  homeZone: string;
  use24Hour: boolean;
  isLive: boolean;
  selectedTime: DateTime;
}

// Hours shown on each side of the selected (center) hour.
// 12 back + 1 center + 12 forward = 25 columns.
const HOUR_SPAN = 12;

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

export function initApp(): void {
  const root = document.getElementById("root");
  if (!root) return;
  clear(root);

  const state: AppState = {
    zones: ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo"],
    homeZone: "America/Los_Angeles",
    use24Hour: false,
    isLive: true,
    selectedTime: DateTime.now(),
  };

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
    { class: "pill", dataset: { active: "true", format: "12" }, onClick: () => setFormat(false) },
    "12h",
  );
  const hour24Btn = el(
    "button",
    { class: "pill", dataset: { active: "false", format: "24" }, onClick: () => setFormat(true) },
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

  const controls = el("div", { class: "controls" }, [searchWrap, formatToggle, nowBtn]);
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
  const mapSection = el("section", { class: "page-enter section-gap map-section" }, [
    mapLabel,
    mapWrap,
    mapTooltip,
  ]);

  const main = el("main", {}, [hero, controlsSection, gridSection, mapSection]);
  root.append(header, main);

  /* ----- Rendering ----- */

  function updateScrubber(): void {
    if (document.activeElement !== timeInput) {
      timeInput.value = state.selectedTime.toFormat("yyyy-MM-dd'T'HH:mm");
    }
  }

  /** Build the hour grid. Columns = hours around selectedTime. Rows = zones. */
  function renderGrid(): void {
    clear(gridScroll);
    if (state.zones.length === 0) return;

    const homeTime = state.selectedTime.setZone(state.homeZone);
    const startHour = homeTime.startOf("hour").minus({ hours: HOUR_SPAN });

    const cols: DateTime[] = [];
    for (let i = 0; i < HOUR_SPAN * 2 + 1; i++) {
      cols.push(startHour.plus({ hours: i }));
    }
    const colCount = cols.length;

    // Column header: date strip
    const headerRow = el("div", { class: "grid-header" }, [
      el("div", { class: "row-label" }, ""),
    ]);
    for (let i = 0; i < colCount; i++) {
      const homeAt = cols[i].setZone(state.homeZone);
      const prev = i > 0 ? cols[i - 1].setZone(state.homeZone) : null;
      const dateChanged = !prev || !prev.hasSame(homeAt, "day");
      const cell = el(
        "div",
        { class: `grid-date band-${timeBand(homeAt.hour)}` + (dateChanged ? " is-date-change" : "") },
        dateChanged ? homeAt.toFormat("ccc dd") : "",
      );
      headerRow.append(cell);
    }
    gridScroll.append(headerRow);

    // Rows: one per zone
    for (let r = 0; r < state.zones.length; r++) {
      const zone = state.zones[r];
      const isHome = zone === state.homeZone;
      const info = getTimezoneInfo(zone, state.selectedTime);
      const homeOffsetMin = state.selectedTime.setZone(state.homeZone).offset;
      const zoneOffsetMin = state.selectedTime.setZone(zone).offset;
      const offsetDiff = zoneOffsetMin - homeOffsetMin;
      const offsetSign = offsetDiff > 0 ? "+" : offsetDiff < 0 ? "-" : "";
      const offsetH = Math.floor(Math.abs(offsetDiff) / 60);
      const offsetM = Math.abs(offsetDiff) % 60;
      const offsetStr =
        offsetDiff === 0 ? "+0" : `${offsetSign}${offsetH}${offsetM ? `:${String(offsetM).padStart(2, "0")}` : "h"}`;

      const row = el("div", { class: `grid-row${isHome ? " is-home" : ""}`, dataset: { zone } }, []);

      // Row label: city, abbr, offset badge, remove
      const labelChildren: Array<Node | string> = [
        el("div", { class: "row-city" }, [
          isHome ? icons.globe : null,
          el("span", { class: "row-city-name" }, cityLabel(zone)),
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
      row.append(label);

      // Cells
      for (let i = 0; i < colCount; i++) {
        const local = cols[i].setZone(zone);
        const homeAt = cols[i].setZone(state.homeZone);
        const dateChanged = !homeAt.hasSame(local, "day");
        const isNow = cols[i].hasSame(state.selectedTime, "hour");
        const cellClasses = [
          "grid-cell",
          `band-${timeBand(local.hour)}`,
          dateChanged ? "is-date-change" : "",
          isNow ? "is-now" : "",
          isHome ? "is-home" : "",
        ]
          .filter(Boolean)
          .join(" ");

        let label: string;
        if (dateChanged) {
          label = local.toFormat("ccc dd");
        } else if (state.use24Hour) {
          label = local.toFormat("HH");
        } else {
          label = local.toFormat("h");
        }

        const cell = el("div", { class: cellClasses, dataset: { col: String(i), zone } }, label);
        // Set as home on click (non-home rows only)
        if (!isHome) {
          on(cell, "click", () => setHome(zone));
        }
        row.append(cell);
      }

      gridScroll.append(row);
    }

    applyHoverColumn();
    bindColumnHover();
  }

  let hoveredCol = -1;
  function applyHoverColumn(): void {
    for (const cell of gridScroll.querySelectorAll<HTMLElement>(".grid-cell")) {
      const col = Number(cell.dataset.col);
      cell.classList.toggle("is-hover", col === hoveredCol);
    }
  }
  function bindColumnHover(): void {
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
  }

  function setHome(zone: string): void {
    if (state.homeZone === zone) return;
    // Move zone to top of list
    state.zones = [zone, ...state.zones.filter((z) => z !== zone)];
    state.homeZone = zone;
    renderGrid();
    renderMap();
  }

  function renderMap(): void {
    clear(mapWrap);
    const svg = buildMapSvg(state.zones, state.selectedTime, {
      onHover: (lon, lat) => {
        if (lon === null || lat === null) {
          mapTooltip.hidden = true;
          return;
        }
        const offsetH = lonToUtcOffsetHours(lon);
        mapTooltip.hidden = false;
        clear(mapTooltip);
        mapTooltip.append(
          el("div", { class: "map-tooltip-offset" }, formatUtcOffset(offsetH)),
          el("div", { class: "map-tooltip-hint" }, "click to add nearest zone"),
        );
      },
      onClick: (zone) => addZone(zone),
    });
    mapWrap.append(svg);
    ensureLandData(svg);
  }

  /* ----- Actions ----- */

  function goNow(): void {
    state.isLive = true;
    state.selectedTime = DateTime.now();
    updateScrubber();
    renderGrid();
    renderMap();
  }

  function setFormat(use24: boolean): void {
    if (state.use24Hour === use24) return;
    state.use24Hour = use24;
    hour12Btn.dataset.active = String(!use24);
    hour24Btn.dataset.active = String(use24);
    renderGrid();
  }

  function onTimeChange(): void {
    const v = timeInput.value;
    if (!v) return;
    const dt = DateTime.fromFormat(v, "yyyy-MM-dd'T'HH:mm");
    if (!dt.isValid) return;
    state.isLive = false;
    state.selectedTime = dt;
    updateScrubber();
    renderGrid();
    renderMap();
  }

  function addZone(zone: string): void {
    if (state.zones.includes(zone)) return;
    state.zones.push(zone);
    searchInput.value = "";
    hideResults();
    renderGrid();
    renderMap();
    searchInput.focus();
  }

  function removeZone(zone: string): void {
    if (zone === state.homeZone) return; // don't remove home
    state.zones = state.zones.filter((z) => z !== zone);
    renderGrid();
    renderMap();
  }

  /* ----- Search dropdown (full IANA list) ----- */
  function renderSearch(): void {
    const q = searchInput.value.trim().toLowerCase();
    const matches = ALL_TIMEZONES
      .filter((z) => !state.zones.includes(z))
      .filter((z) => !q || z.toLowerCase().includes(q))
      .slice(0, 12);
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
  window.setInterval(() => {
    if (!state.isLive) return;
    state.selectedTime = DateTime.now();
    updateScrubber();
    renderGrid();
    renderMap();
  }, 1000);

  updateScrubber();
  renderGrid();
  renderMap();
}