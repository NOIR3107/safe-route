import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrategyId } from "@/api/extensions";

export type Theme = "dark" | "light";
export type Lang = "en" | "hi" | "ta";

interface UiState {
  theme: Theme;
  lang: Lang;
  strategy: StrategyId;
  /** Sidebar shrunk to an icon rail so the map gets the width. */
  navCollapsed: boolean;
  /** Field view: simulate losing connectivity to demo the offline sync queue. */
  forceOffline: boolean;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  setStrategy: (s: StrategyId) => void;
  setNavCollapsed: (v: boolean) => void;
  setForceOffline: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      lang: "en",
      strategy: "min-cost-flow",
      navCollapsed: false,
      forceOffline: false,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setStrategy: (strategy) => set({ strategy }),
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setForceOffline: (forceOffline) => set({ forceOffline }),
    }),
    { name: "saferoute-ui" },
  ),
);
