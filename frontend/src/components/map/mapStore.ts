/** Map camera and layer choices. Kept for the browser session so moving between pages keeps the view. */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CameraState {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
}

export interface MapLayers {
  zones: boolean;
  routes: boolean;
  shelters: boolean;
  vehicles: boolean;
  assignments: boolean;
  imagery: boolean;
}

export type MapSelection = { kind: "zone" | "shelter" | "route" | "vehicle"; id: number } | null;

interface MapState {
  camera: CameraState | null;
  tilt3d: boolean;
  layers: MapLayers;
  layerPanelOpen: boolean;
  dockOpen: boolean;
  logOpen: boolean;
  selection: MapSelection;
  setCamera: (c: CameraState) => void;
  setTilt3d: (v: boolean) => void;
  toggleLayer: (k: keyof MapLayers) => void;
  setLayerPanelOpen: (v: boolean) => void;
  setDockOpen: (v: boolean) => void;
  setLogOpen: (v: boolean) => void;
  select: (s: MapSelection) => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      camera: null,
      tilt3d: false,
      layers: { zones: true, routes: true, shelters: true, vehicles: true, assignments: false, imagery: false },
      layerPanelOpen: false,
      dockOpen: true,
      logOpen: true,
      selection: null,
      setCamera: (camera) => set({ camera }),
      setTilt3d: (tilt3d) => set({ tilt3d }),
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      setLayerPanelOpen: (layerPanelOpen) => set({ layerPanelOpen }),
      setDockOpen: (dockOpen) => set({ dockOpen }),
      setLogOpen: (logOpen) => set({ logOpen }),
      select: (selection) => set({ selection }),
    }),
    {
      name: "saferoute-map",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ camera: s.camera, tilt3d: s.tilt3d, layers: s.layers, dockOpen: s.dockOpen, logOpen: s.logOpen }),
    },
  ),
);
