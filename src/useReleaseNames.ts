import { useEffect, useMemo, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { assignReleaseNames, releaseNameFor } from './releaseNames';
import type { ReleaseRecord } from './useReleaseRecords';
import type { ReleaseRecordDoc } from './useReleaseRecordPersistence';
import type { RecordOutcome, ReleaseDraft } from './releaseFlow';

// One committed Release Record, as the backend's /release-records listing returns it.
export interface ReleaseRecordIndexEntry {
  imageTag: string;
  env: string;
  generatedAt: string;
  store: 'gitops' | 'source';
  /** The record's frozen guardrails and counted sign-offs: what its score is built from beyond live data. */
  guardrails?: ReleaseRecordDoc['guardrails'];
  signoffs?: number;
  /** R3: the written-back outcome; what the changelog shows. */
  outcome?: RecordOutcome;
  summary?: string;
  notes?: ReleaseDraft['notes'];
  knownIssues?: string[];
  owner?: string;
  githubRelease?: { tag?: string; url?: string; skipped?: string };
}

export interface ReleaseNames {
  /** imageTag -> name, for every release in the app's history. */
  byTag: Map<string, string>;
  /** The name the next release gets. */
  next: string;
  /** The committed history itself, for each record's recorded evidence (withRecordedEvidence). */
  index: ReleaseRecordIndexEntry[];
}

// Names need the app's whole release history, not just the releases Tower's matrix
// window shows, so they come from the committed records (see namesFromHistory below for
// the releases still waiting for theirs). Undefined until the history loads, and on any
// error: a wrong name is worse than none.
export function useReleaseNames(
  target: { owner: string; appName: string } | undefined,
  records: ReleaseRecord[],
): ReleaseNames | undefined {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [index, setIndex] = useState<ReleaseRecordIndexEntry[] | undefined>(undefined);
  const key = target ? `${target.owner}/${target.appName}` : '';

  useEffect(() => {
    setIndex(undefined);
    if (!target) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('glidepath');
        const params = new URLSearchParams(target);
        const res = await fetchApi.fetch(`${baseUrl}/release-records?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as ReleaseRecordIndexEntry[];
        if (!cancelled && Array.isArray(data)) setIndex(data);
      } catch {
        // No names rather than wrong ones; the record list works without them.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discoveryApi, fetchApi]);

  return useMemo(() => (index ? namesFromHistory(index, records) : undefined), [index, records]);
}

/**
 * Names every release from the committed history plus the releases still waiting for
 * their record PR. A committed release is placed by its own generatedAt only, so its
 * name never depends on whether it is still in Tower's window. A release Tower sees
 * with no record is counted only when it is newer than every committed one (its record
 * PR is open): an older one never got a record, and counting it while it's on screen
 * would rename every later release once it scrolls out of the window.
 */
export function namesFromHistory(index: ReleaseRecordIndexEntry[], records: ReleaseRecord[]): ReleaseNames {
  const committed = new Set(index.map(e => e.imageTag));
  const createdAtOf = new Map(records.map(r => [r.imageTag, new Date(r.createdAt).getTime()]));
  const newestCommitted = Math.max(
    Number.NEGATIVE_INFINITY,
    ...index.map(e => createdAtOf.get(e.imageTag) ?? new Date(e.generatedAt).getTime()),
  );
  const pending = records.filter(r => !committed.has(r.imageTag) && new Date(r.createdAt).getTime() > newestCommitted);
  const byTag = assignReleaseNames([
    ...index.map(e => ({ imageTag: e.imageTag, at: e.generatedAt })),
    ...pending.map(r => ({ imageTag: r.imageTag, at: r.createdAt })),
  ]);
  return { byTag, next: releaseNameFor(byTag.size), index };
}

/**
 * The release a saved draft still belongs to. A release is named as soon as it reaches Flight, but its draft is only
 * copied into its record (and next.yaml cleared) when Tower's backend writes the record PR. In between, the draft on
 * screen is that release's, not the next one's (2026-10-14 bug: IRONWOOD's notes showed under JUNIPER).
 */
export function draftStillBelongsTo(
  names: ReleaseNames | undefined,
  hasDraft: boolean,
  recordPrTitles: string[],
): string | undefined {
  if (!names || !hasDraft) return undefined;
  const committed = new Set(names.index.map(e => e.imageTag));
  const withPr = new Set(recordPrTitles.map(t => t.match(/^Release Record: \S+ @ (\S+)$/)?.[1]).filter(Boolean) as string[]);
  const pending = [...names.byTag.entries()].filter(([tag]) => !committed.has(tag) && !withPr.has(tag));
  return pending.length > 0 ? pending[pending.length - 1][1] : undefined;
}

