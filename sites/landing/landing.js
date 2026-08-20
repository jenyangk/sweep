// muniee landing — theme toggle. No framework, no bloat.

const STORAGE_KEY = "muniee-theme";

function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(next) {
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const color = next === "dark" ? "#0a0a0b" : "#ffffff";
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", color));
  const iconSlot = document.querySelector("[data-theme-icon]");
  if (iconSlot) iconSlot.textContent = "◐";
}

function initThemeToggle() {
  applyTheme(currentTheme());
  const btn = document.querySelector("[data-theme-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be blocked */
    }
    applyTheme(next);
  });
}

function initMuCycle() {
  const muChar = document.querySelector(".mu-char");
  if (!muChar) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const MU_FONTS = [
    '"Satoshi", sans-serif',
    'Georgia, serif',
    '"Courier New", monospace',
    '"Comic Sans MS", "Comic Sans", cursive',
    'Impact, sans-serif',
    '"Times New Roman", serif',
    'Verdana, sans-serif',
    '"Trebuchet MS", sans-serif',
    '"Palatino Linotype", "Palatino", serif',
    'ui-monospace, "SF Mono", monospace',
  ];

  let i = 0;
  setTimeout(() => {
    setInterval(() => {
      i = (i + 1) % MU_FONTS.length;
      muChar.classList.add("switching");
      setTimeout(() => {
        muChar.style.fontFamily = MU_FONTS[i];
      }, 200);
      setTimeout(() => {
        muChar.classList.remove("switching");
      }, 400);
    }, 2500);
  }, 1500);
}

initThemeToggle();
initMuCycle();