import { useUiStore } from "@/stores/ui";

/** Hex chart colours per theme (SVG attributes cannot rely on CSS variables). Series validated with dataviz validate_palette.js. */
const THEMES = {
  dark: { series1: "#3987e5", series2: "#d95926", fg: "#e9eaec", muted: "#979ca4", border: "#2e3137", surface: "#191a1e", surface2: "#212328", accent: "#e9eaec" },
  light: { series1: "#2a78d6", series2: "#eb6834", fg: "#18191b", muted: "#5d6066", border: "#e0e0db", surface: "#ffffff", surface2: "#f0f0ed", accent: "#18191b" },
} as const;

export function useChartTheme() {
  return THEMES[useUiStore((s) => s.theme)];
}
