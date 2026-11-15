import { CHENNAI_FLOOD } from "./chennaiFlood";
import type { ScenarioDefinition } from "./scenario";
import { generateSyntheticScenario } from "./synthetic";

export const DEFAULT_SCENARIO = CHENNAI_FLOOD;

export const SCENARIO_PRESETS: { id: string; build: () => ScenarioDefinition }[] = [
  { id: CHENNAI_FLOOD.id, build: () => CHENNAI_FLOOD },
  { id: "synthetic-42-24x8", build: () => generateSyntheticScenario({ seed: 42, zones: 24, shelters: 8 }) },
  { id: "synthetic-7-40x12", build: () => generateSyntheticScenario({ seed: 7, zones: 40, shelters: 12 }) },
];

export function scenarioById(id: string): ScenarioDefinition {
  const preset = SCENARIO_PRESETS.find((p) => p.id === id);
  return (preset ?? SCENARIO_PRESETS[0]!).build();
}

export { buildState, DEMO_PASSWORDS } from "./build";
export { CHENNAI_FLOOD, generateSyntheticScenario };
export type { ScenarioDefinition };
