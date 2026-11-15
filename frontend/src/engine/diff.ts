import type { DiffMove, PlanDiff } from "@/api/extensions";
import { round1 } from "./cost";

export interface HouseholdPlacement {
  shelter_id: number;
  eta: number;
}

export interface DiffContext {
  households: Map<string, { zone_id: number; size: number }>;
  zoneNames: Map<number, string>;
  shelterNames: Map<number, string>;
  reason: string;
}

/**
 * Household-level diff between two plan versions, aggregated per (zone, from, to) so the UI can say
 * "312 people from Saidapet moved Guindy School → Loyola College (+6 min) because the bridge flooded".
 */
export function diffPlans(
  prev: Map<string, HouseholdPlacement>,
  next: Map<string, HouseholdPlacement>,
  ctx: DiffContext,
): PlanDiff {
  const buckets = new Map<string, { move: DiffMove; etaBefore: number; etaAfter: number; wb: number; wa: number }>();
  let unchanged = 0;
  let newlyUnallocated = 0;
  let newlyAllocated = 0;
  let deltaSum = 0;
  let deltaPeople = 0;

  const ids = new Set([...prev.keys(), ...next.keys()]);
  for (const id of ids) {
    const hh = ctx.households.get(id);
    if (!hh) continue;
    const a = prev.get(id);
    const b = next.get(id);
    if (a && b && a.shelter_id === b.shelter_id) {
      unchanged += hh.size;
      continue;
    }
    if (a && !b) newlyUnallocated += hh.size;
    if (!a && b) newlyAllocated += hh.size;
    if (a && b) {
      deltaSum += (b.eta - a.eta) * hh.size;
      deltaPeople += hh.size;
    }
    const from = a?.shelter_id ?? null;
    const to = b?.shelter_id ?? null;
    const key = `${hh.zone_id}|${from ?? "-"}|${to ?? "-"}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        move: {
          zone_id: hh.zone_id,
          zone_name: ctx.zoneNames.get(hh.zone_id) ?? `Zone ${hh.zone_id}`,
          from_shelter_id: from,
          from_shelter_name: from == null ? null : (ctx.shelterNames.get(from) ?? `Shelter ${from}`),
          to_shelter_id: to,
          to_shelter_name: to == null ? null : (ctx.shelterNames.get(to) ?? `Shelter ${to}`),
          people: 0,
          households: 0,
          reason: ctx.reason,
          eta_before: null,
          eta_after: null,
        },
        etaBefore: 0,
        etaAfter: 0,
        wb: 0,
        wa: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.move.people += hh.size;
    bucket.move.households += 1;
    if (a) {
      bucket.etaBefore += a.eta * hh.size;
      bucket.wb += hh.size;
    }
    if (b) {
      bucket.etaAfter += b.eta * hh.size;
      bucket.wa += hh.size;
    }
  }

  const moves = [...buckets.values()]
    .map(({ move, etaBefore, etaAfter, wb, wa }) => ({
      ...move,
      eta_before: wb > 0 ? Math.round(etaBefore / wb) : null,
      eta_after: wa > 0 ? Math.round(etaAfter / wa) : null,
    }))
    .sort((x, y) => y.people - x.people);

  return {
    moves,
    people_moved: moves.filter((m) => m.from_shelter_id != null && m.to_shelter_id != null).reduce((s, m) => s + m.people, 0),
    people_unchanged: unchanged,
    newly_unallocated: newlyUnallocated,
    newly_allocated: newlyAllocated,
    avg_eta_delta: deltaPeople > 0 ? round1(deltaSum / deltaPeople) : 0,
  };
}
