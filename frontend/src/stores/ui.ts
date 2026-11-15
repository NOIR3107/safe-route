import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrategyId } from "@/api/extensions";

export type Theme = "dark" | "light";
export type Lang = "en" | "hi" | "ta";

export interface MapLayers {
  zones: boolean;
  shelters: boolean;
  routes: boolean;
  vehicles: boolean;
}

interface UiState {
  theme: Theme;
  lang: Lang;
  strategy: StrategyId;
  layers: MapLayers;
  /** Field view: simulate losing connectivity to demo the offline sync queue. */
  forceOffline: boolean;
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  setStrategy: (s: StrategyId) => void;
  toggleLayer: (k: keyof MapLayers) => void;
  setForceOffline: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      lang: "en",
      strategy: "min-cost-flow",
      layers: { zones: true, shelters: true, routes: true, vehicles: true },
      forceOffline: false,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setStrategy: (strategy) => set({ strategy }),
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      setForceOffline: (forceOffline) => set({ forceOffline }),
    }),
    { name: "saferoute-ui" },
  ),
);
