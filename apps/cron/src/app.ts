import { el, clear } from "./lib/dom";
import { toggleTheme } from "./lib/theme";
import { icons } from "./icons";
import {
  CRON_EXAMPLES,
  CRON_FIELD_DESCRIPTIONS,
  CRON_SPECIAL_CHARS,
  NCRON_EXAMPLES,
  parseCronExpression,
  type CronInfo,
  type CronMode,
} from "./lib/cronHelpers";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatRun(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

function readHash(): { mode: CronMode; expr: string } | null {
  const h = window.location.hash;
  if (h.startsWith("#c=")) return { mode: "standard", expr: h.slice(3).replace(/_/g, " ") };
  if (h.startsWith("#n=")) return { mode: "ncron", expr: h.slice(3).replace(/_/g, " ") };
  return null;
}

function flashBtn(btn: HTMLButtonElement, label: string, icon?: string): void {
  const original = btn.innerHTML;
  btn.innerHTML = "";
  if (icon) btn.insertAdjacentHTML("beforeend", icon);
  btn.append(document.createTextNode(label));
  setTimeout(() => {
    btn.innerHTML = original;
  }, 1400);
}

export function initApp(): void {
  const root = document.getElementById("root");
  if (!root) return;
  clear(root);

  let mode: CronMode = "standard";

  // ----- Header -----
  const muMark = el("a", { class: "mu-mark", href: "https://muniee.com", ariaLabel: "muniee" }, "μ");
  const logo = el("a", { class: "logo", href: "/" }, "cron");
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
  const h1 = el("h1", {}, "parse cron expressions.");
  const subhead = el(
    "p",
    { style: { maxWidth: "560px", color: "var(--muted)", marginTop: "10px" } },
    "standard 5-field or 6-field with seconds. see next runs, human description, shareable links. runs in your browser.",
  );

  const standardBtn = el(
    "button",
    {
      class: "pill",
      dataset: { mode: "standard", active: "true" },
      onClick: () => setMode("standard"),
    },
    "standard",
  );
  const ncronBtn = el(
    "button",
    {
      class: "pill",
      dataset: { mode: "ncron", active: "false" },
      onClick: () => setMode("ncron"),
    },
    "ncron",
  );
  const modeToggle = el("div", { class: "mode-toggle" }, [standardBtn, ncronBtn]);

  const hero = el("section", { class: "page-enter" }, [h1, subhead, modeToggle]);

  // ----- Expression input -----
  const input = el("input", {
    class: "cron-input",
    ariaLabel: "Cron expression",
  }) as HTMLInputElement;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = "* * * * *";

  const errorMsg = el("p", { class: "error-msg", ariaLive: "polite" });
  errorMsg.hidden = true;

  const examplesBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      ariaLabel: "Toggle example expressions",
      onClick: () => toggleExamples(),
    },
    [icons.list, "Examples"],
  );
  const helpBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      ariaLabel: "Toggle help",
      onClick: () => toggleHelp(),
    },
    [icons.help, "Help"],
  );
  const inputActions = el("div", { class: "row", style: { marginTop: "16px" } }, [
    examplesBtn,
    helpBtn,
  ]);

  const inputSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// expression"),
    input,
    errorMsg,
    inputActions,
  ]);

  // ----- Examples panel -----
  const examplePanel = el("div", { class: "panel examples-panel" });
  const examplesSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// examples"),
    examplePanel,
  ]);
  examplesSection.hidden = true;

  // ----- Results section -----
  const descriptionCard = el("div", { class: "panel description-card" });
  const nextRunsList = el("ol", { class: "next-runs" });

  const shareLink = el("span", { class: "share-link" });
  const copyLinkBtn = el(
    "button",
    {
      class: "btn btn-ghost btn-sm copy-link-btn",
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          flashBtn(copyLinkBtn, "Copied", icons.check);
        } catch {
          flashBtn(copyLinkBtn, "Copy failed");
        }
      },
    },
    [icons.copy, "Copy link"],
  );
  const copyRow = el("div", { class: "row", style: { marginTop: "20px" } }, [
    shareLink,
    copyLinkBtn,
  ]);

  const resultsSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// results"),
    el("p", { class: "section-label" }, "// description"),
    descriptionCard,
    el(
      "p",
      {
        class: "section-label",
        style: { marginTop: "24px", display: "flex", alignItems: "center", gap: "6px" },
      },
      [icons.clock, "// next runs"],
    ),
    nextRunsList,
    copyRow,
  ]);
  resultsSection.hidden = true;

  // ----- Help panel -----
  const helpTable = el("table", { class: "help-table" }, [
    el("thead", {}, el("tr", {}, [
      el("th", {}, "Field"),
      el("th", {}, "Range"),
      el("th", {}, "Wildcards"),
    ])),
    el("tbody", {}, CRON_FIELD_DESCRIPTIONS.map((f) =>
      el("tr", {}, [
        el("td", {}, f.field),
        el("td", {}, f.range),
        el("td", {}, el("span", { class: "type-tag" }, f.wildcards)),
      ]),
    )),
  ]);

  const charGrid = el("div", { class: "char-grid" }, CRON_SPECIAL_CHARS.map((c) =>
    el("div", { class: "char-item" }, [
      el("span", { class: "char-symbol" }, c.char),
      el("span", { class: "char-meaning" }, c.meaning),
    ]),
  ));

  const helpPanel = el("div", { class: "panel" }, [
    el("p", { class: "section-label" }, "// fields"),
    helpTable,
    el("p", { class: "section-label", style: { marginTop: "24px" } }, "// special characters"),
    charGrid,
  ]);

  const helpSection = el("section", { class: "page-enter section-gap" }, [
    el("p", { class: "section-label" }, "// help"),
    helpPanel,
  ]);
  helpSection.hidden = true;

  const main = el("main", {}, [
    hero,
    inputSection,
    examplesSection,
    resultsSection,
    helpSection,
  ]);

  root.append(header, main);

  // ----- Examples -----
  function currentExamples(): { expression: string; description: string }[] {
    return mode === "standard" ? CRON_EXAMPLES : NCRON_EXAMPLES;
  }

  function renderExamples(): void {
    clear(examplePanel);
    examplePanel.append(
      ...currentExamples().map((ex) =>
        el("button", { class: "example-item", onClick: () => pickExample(ex) }, [
          el("span", { class: "example-expr" }, ex.expression),
          el("span", { class: "example-desc" }, ex.description),
        ]),
      ),
    );
  }

  function pickExample(ex: { expression: string; description: string }): void {
    input.value = ex.expression;
    examplesSection.hidden = true;
    parseInput();
    input.focus();
  }

  function toggleExamples(): void {
    examplesSection.hidden = !examplesSection.hidden;
  }

  function toggleHelp(): void {
    helpSection.hidden = !helpSection.hidden;
  }

  // ----- Parsing -----
  let parseTimer: number | undefined;

  function parseInput(): void {
    const expr = input.value;
    if (!expr.trim()) {
      errorMsg.hidden = true;
      errorMsg.textContent = "";
      resultsSection.hidden = true;
      return;
    }
    const result = parseCronExpression(expr, mode);
    if (result.isValid) {
      errorMsg.hidden = true;
      errorMsg.textContent = "";
      updateHash(result.expression);
      renderResults(result);
    } else {
      errorMsg.textContent = result.error ?? "Invalid cron expression";
      errorMsg.hidden = false;
      resultsSection.hidden = true;
    }
  }

  function renderResults(result: CronInfo): void {
    descriptionCard.textContent = result.description;
    clear(nextRunsList);
    result.next5Runs.forEach((d, i) => {
      nextRunsList.append(
        el("li", { class: "run-item row-enter" }, [
          el("span", { class: "run-badge" }, String(i + 1)),
          el("span", { class: "run-time" }, formatRun(d)),
        ]),
      );
    });
    shareLink.textContent = window.location.href;
    resultsSection.hidden = false;
  }

  function updateHash(expr?: string): void {
    if (expr) {
      const prefix = mode === "standard" ? "#c=" : "#n=";
      window.history.replaceState(null, "", prefix + expr.replace(/ /g, "_"));
    } else {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function setMode(next: CronMode): void {
    if (next === mode) return;
    mode = next;
    standardBtn.dataset.active = next === "standard" ? "true" : "false";
    ncronBtn.dataset.active = next === "ncron" ? "true" : "false";
    input.placeholder = next === "standard" ? "* * * * *" : "0 * * * * *";
    input.value = "";
    errorMsg.hidden = true;
    errorMsg.textContent = "";
    resultsSection.hidden = true;
    updateHash();
    renderExamples();
    input.focus();
  }

  // ----- Events -----
  input.addEventListener("input", () => {
    window.clearTimeout(parseTimer);
    parseTimer = window.setTimeout(parseInput, 300);
  });

  renderExamples();

  // ----- URL hash on mount -----
  const initial = readHash();
  if (initial) {
    if (initial.mode !== mode) setMode(initial.mode);
    const result = parseCronExpression(initial.expr, mode);
    if (result.isValid) {
      input.value = initial.expr;
      updateHash(result.expression);
      renderResults(result);
    }
  }
}
