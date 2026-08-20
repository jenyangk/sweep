import { DateTime } from "luxon";
import { el, clear } from "./lib/dom";
import { toggleTheme } from "./lib/theme";
import { icons } from "./icons";
import {
  TIME_FORMATS,
  getAllFormats,
  type TimeFormat,
} from "./lib/timeFormats";

type CategoryId = TimeFormat["category"] | "all";

const CATEGORIES: Array<{ id: CategoryId; label: string }> = [
  { id: "all", label: "All" },
  { id: "iso", label: "ISO" },
  { id: "unix", label: "Unix" },
  { id: "specialized", label: "Specialized" },
  { id: "system", label: "System" },
  { id: "browser", label: "Browser" },
];

interface AppState {
  customTime: DateTime | null;
  category: CategoryId;
}

export function initApp(): void {
  const root = document.getElementById("root");
  if (!root) return;
  clear(root);

  const state: AppState = { customTime: null, category: "all" };
  let values: Record<string, string> = {};

  // ----- Header -----
  const muMark = el(
    "a",
    { class: "mu-mark", href: "https://muniee.com", ariaLabel: "muniee" },
    "μ",
  );
  const logo = el("a", { class: "logo", href: "/" }, "timeformats");
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
  const h1 = el("h1", {}, "convert time across 27 formats.");
  const subhead = el(
    "p",
    { style: { maxWidth: "560px", color: "var(--muted)", marginTop: "10px" } },
    "iso, unix, julian, tai, gps, windows filetime, and more. click any format to copy. runs in your browser.",
  );
  const hero = el("section", { class: "page-enter" }, [h1, subhead]);

  // ----- Live clock -----
  const clockDisplay = el("div", { class: "clock-display" });
  const statusPill = el(
    "span",
    { class: "pill", dataset: { status: "now" } },
    [el("span", { class: "dot" }), "now"],
  );
  const clockRow = el("div", { class: "row", style: { marginTop: "10px" } }, [
    el("span", { class: "clock-ico" }, icons.clock),
    clockDisplay,
    statusPill,
  ]);
  const parseInput = el("input", {
    id: "parse-input",
    type: "text",
    ariaLabel: "Paste a value to parse a custom time",
    onChange: handleParse,
  });
  parseInput.placeholder = "paste a value to parse, e.g. 2026-08-19T12:00:00Z";
  const parseError = el("p", { class: "parse-error" });
  const clockSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// live clock"),
    clockRow,
    el("div", { style: { marginTop: "16px" } }, parseInput),
    parseError,
  ]);

  // ----- Category filter -----
  const pillRow = el("div", { class: "row", style: { gap: "8px", marginTop: "12px" } });
  const pills: HTMLButtonElement[] = [];
  for (const c of CATEGORIES) {
    const pill = el(
      "button",
      {
        class: "pill",
        dataset: { category: c.id, active: String(c.id === state.category) },
        onClick: () => setCategory(c.id),
      },
      c.label,
    );
    pills.push(pill);
    pillRow.append(pill);
  }
  const filterSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// categories"),
    pillRow,
  ]);

  // ----- Formats grid -----
  const grid = el("div", { class: "format-grid" });
  const gridSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// formats"),
    grid,
  ]);

  const container = el("div", { class: "container" }, [
    hero,
    clockSection,
    filterSection,
    gridSection,
  ]);
  const main = el("main", {}, container);
  root.append(header, main);

  // ----- State -----
  const valueNodes = new Map<string, HTMLElement>();

  function current(): DateTime {
    return state.customTime ?? DateTime.now();
  }

  function tick(): void {
    const dt = current();
    values = getAllFormats(dt);
    clockDisplay.textContent = dt.toISO() ?? "";
    const label = state.customTime ? "custom" : "now";
    statusPill.dataset.status = label;
    clear(statusPill);
    statusPill.append(el("span", { class: "dot" }), document.createTextNode(label));
    for (const [id, node] of valueNodes) {
      node.textContent = values[id] ?? "";
    }
  }

  function renderGrid(): void {
    const formats =
      state.category === "all"
        ? TIME_FORMATS
        : TIME_FORMATS.filter((f) => f.category === state.category);
    clear(grid);
    valueNodes.clear();
    for (const f of formats) grid.append(makeCard(f));
  }

  function makeCard(f: TimeFormat): HTMLElement {
    const valueNode = el("code", { class: "format-value" }, values[f.id] ?? "");
    const copied = el("span", { class: "copied", hidden: true }, "Copied");
    valueNodes.set(f.id, valueNode);
    const card = el(
      "div",
      {
        class: "format-card row-enter",
        role: "button",
        ariaLabel: `Copy ${f.name} value`,
        onClick: () => copyValue(f.id, copied),
      },
      [
        el("div", { class: "format-name" }, f.name),
        el("div", { class: "format-desc" }, f.description),
        valueNode,
        copied,
      ],
    );
    card.tabIndex = 0;
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        copyValue(f.id, copied);
      }
    });
    return card;
  }

  async function copyValue(id: string, copied: HTMLElement): Promise<void> {
    const value = values[id] ?? "";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard may be blocked */
    }
    copied.hidden = false;
    setTimeout(() => {
      copied.hidden = true;
    }, 1200);
  }

  function setCategory(category: CategoryId): void {
    state.category = category;
    for (const pill of pills) {
      pill.dataset.active = String(pill.dataset.category === category);
    }
    renderGrid();
  }

  function handleParse(e: Event): void {
    const value = (e.target as HTMLInputElement).value.trim();
    if (!value) {
      state.customTime = null;
      parseError.textContent = "";
      tick();
      return;
    }
    for (const f of TIME_FORMATS) {
      if (!f.parse) continue;
      try {
        const dt = f.parse(value);
        if (dt && dt.isValid) {
          state.customTime = dt;
          parseError.textContent = "";
          tick();
          return;
        }
      } catch {
        /* keep trying the next format */
      }
    }
    parseError.textContent = "No format matched that value.";
  }

  tick();
  renderGrid();
  setInterval(tick, 1000);
}
