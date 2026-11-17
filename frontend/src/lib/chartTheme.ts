import { useUiStore } from "@/stores/ui";

/** Hex chart colours per theme (SVG attributes cannot rely on CSS variables). Series validated with dataviz validate_palette.js. */
const THEMES = {
  dark: { series1: "#3987e5", series2: "#d95926", fg: "#ecedef", muted: "#8f949d", border: "#26282d", surface: "#131417", surface2: "#1b1c20", accent: "#ecedef" },
  light: { series1: "#2a78d6", series2: "#eb6834", fg: "#101215", muted: "#5a606a", border: "#dcdfe4", surface: "#ffffff", surface2: "#eceef1", accent: "#101215" },
} as const;

export function useChartTheme() {
  return THEMES[useUiStore((s) => s.theme)];
}
