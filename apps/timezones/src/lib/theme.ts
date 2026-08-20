export type Theme = "dark" | "light";

const STORAGE_KEY = "timezones-theme";

export function getTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  if (current === "light" || current === "dark") return current;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function setTheme(next: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage may be blocked */
  }
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const dark = next === "dark" ? "#0a0a0b" : "#ffffff";
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => m.setAttribute("content", dark));
}

export function toggleTheme(): Theme {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
