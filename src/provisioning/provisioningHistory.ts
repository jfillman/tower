import { useCallback, useEffect, useRef, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import type { ProvisioningItem } from './shared';

// Finished provisions, kept by the Backstage backend's provisioning-history plugin. Tower records
// a run the first time it sees one complete and reads back the recent ones plus the median
// duration of each step. Everything here degrades to "no history": the built-in typical
// durations stay in use and the table is simply empty.

export interface HistoryStep {
  id: string;
  seconds: number;
}

export interface HistoryRun {
  service: string;
  kind: string;
  startedAt: number;
  completedAt: number;
  totalSeconds: number;
  steps: HistoryStep[];
}

export interface StepMedian {
  median: number;
  samples: number;
}

export interface TypicalDurations {
  all: Record<string, StepMedian>;
  byKind: Record<string, Record<string, StepMedian>>;
}

/** A median over fewer runs than this is just one run's luck, so the built-in estimate stays. */
export const MIN_SAMPLES = 3;

/** Step id to typical seconds for one kind of service, or undefined when there is nothing trustworthy yet. */
export function typicalFor(typical: TypicalDurations | undefined, kind: string): Record<string, number> | undefined {
  if (!typical) return undefined;
  const out: Record<string, number> = {};
  const ids = new Set([...Object.keys(typical.all), ...Object.keys(typical.byKind[kind] ?? {})]);
  ids.forEach(id => {
    const own = typical.byKind[kind]?.[id];
    const any = typical.all[id];
    if (own && own.samples >= MIN_SAMPLES) out[id] = own.median;
    else if (any && any.samples >= MIN_SAMPLES) out[id] = any.median;
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The record to store for a finished provision, or undefined if it is not finished or too sparse to be useful. */
export function toRunRecord(item: ProvisioningItem): HistoryRun | undefined {
  const { derived, inputs } = item;
  if (!derived.complete || derived.completedAt === undefined) return undefined;
  const steps = derived.steps.filter(s => s.seconds !== undefined).map(s => ({ id: s.id, seconds: s.seconds as number }));
  if (steps.length < 5) return undefined;
  const starts = derived.steps.map(s => s.startedAt).filter((t): t is number => t !== undefined);
  const startedAt = Math.min(inputs.xr.createdAt, ...starts);
  if (derived.completedAt < startedAt) return undefined;
  return {
    service: inputs.xr.name,
    kind: inputs.xr.kind,
    startedAt,
    completedAt: derived.completedAt,
    totalSeconds: Math.round((derived.completedAt - startedAt) / 1000),
    steps,
  };
}

const HISTORY_POLL_MS = 60000;
const RETRY_MS = 60000;

export function useProvisioningHistory() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [typical, setTypical] = useState<TypicalDurations | undefined>(undefined);
  // service:start to the earliest time another attempt is allowed (Infinity once stored).
  const recorded = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    try {
      const base = await discoveryApi.getBaseUrl('provisioning-history');
      const [r, t] = await Promise.all([fetchApi.fetch(`${base}/runs?limit=10`), fetchApi.fetch(`${base}/typical`)]);
      if (r.ok) setRuns(((await r.json()) as { runs: HistoryRun[] }).runs ?? []);
      if (t.ok) setTypical((await t.json()) as TypicalDurations);
    } catch {
      // No history available (backend plugin absent or unreachable): the estimates stay.
    }
  }, [discoveryApi, fetchApi]);

  useEffect(() => {
    load();
    const id = setInterval(load, HISTORY_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  /** Stores a finished provision once per page load; the backend ignores a repeat anyway. */
  const record = useCallback(
    async (item: ProvisioningItem) => {
      const run = toRunRecord(item);
      if (!run) return;
      const key = `${run.service}:${run.startedAt}`;
      if (Date.now() < (recorded.current.get(key) ?? 0)) return;
      recorded.current.set(key, Date.now() + RETRY_MS);
      try {
        const base = await discoveryApi.getBaseUrl('provisioning-history');
        const res = await fetchApi.fetch(`${base}/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(run),
        });
        if (!res.ok) throw new Error(String(res.status));
        recorded.current.set(key, Infinity);
        load();
      } catch {
        // Left to retry after RETRY_MS, so a missing backend plugin is not hammered every render.
      }
    },
    [discoveryApi, fetchApi, load],
  );

  return { runs, typical, record };
}
