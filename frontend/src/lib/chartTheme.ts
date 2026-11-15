import { useUiStore } from "@/stores/ui";

/** Hex chart colours per theme (SVG attributes cannot rely on CSS variables). Series validated with dataviz validate_palette.js. */
const THEMES = {
  dark: { series1: "#3987e5", series2: "#d95926", fg: "#e6edf6", muted: "#9aa8bd", border: "#243149", surface: "#111a2b", surface2: "#172238", accent: "#22b8cf" },
  light: { series1: "#2a78d6", series2: "#eb6834", fg: "#0f172a", muted: "#4a5568", border: "#d7dde6", surface: "#ffffff", surface2: "#eef1f5", accent: "#0e7490" },
} as const;

export function useChartTheme() {
  return THEMES[useUiStore((s) => s.theme)];
}
