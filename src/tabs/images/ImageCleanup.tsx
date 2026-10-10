import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { relativeTime } from '../../shared/format';
import { Button, TextLink } from '../../ui';

// Clean up an app's old images (2026-10-10; backstage imagePrune.ts). Two steps on purpose: the plan says exactly
// which package versions would be deleted and why every other release is kept, and Prune deletes exactly that plan
// (the backend re-plans and refuses with the new plan if anything changed). Only the app's own packages: <app>,
// <app>-pr and <app>/cache. The plan reads both clusters and several repositories, so it loads on request.

interface Decision {
  key: string;
  createdAt: string;
  versions: number;
  keep: boolean;
  reasons: string[];
}

interface PackagePlan {
  name: string;
  kind: 'app' | 'pr' | 'cache';
  totalVersions: number;
  decisions: Decision[];
  deleteIds: number[];
  unattributed: number;
}

export interface PrunePlan {
  app: string;
  configured: boolean;
  allowed: boolean;
  hash: string;
  packages: PackagePlan[];
  deleteCount: number;
  rules: { minAgeDays: number; keepNewest: number; keepNewestCache: number };
}

interface PruneResult {
  deleted: number;
  failed: Array<{ pkg: string; id: number; error: string }>;
  remaining: number;
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  card: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 10,
    padding: '12px 14px',
    marginBottom: 14,
    backgroundColor: ({ t }) => t.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  head: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  title: { fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  note: { fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.5 },
  pkg: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  row: { display: 'grid', gridTemplateColumns: '64px minmax(140px, 220px) 1fr', gap: 8, fontSize: 12, alignItems: 'baseline' },
  del: { fontFamily: fontMono, fontSize: 10.5, fontWeight: 700, color: ({ t }) => t.bad },
  keep: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  mono: { fontFamily: fontMono, fontSize: 11.5 },
  reasons: { color: ({ t }) => t.textLo },
  confirm: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: ({ t }) => t.amberSoft,
    color: ({ t }) => t.amberInk,
    fontSize: 12,
  },
  bad: { fontSize: 12, fontStyle: 'italic', color: ({ t }) => t.bad },
  ok: { fontSize: 12, color: ({ t }) => t.good },
}));

/** Why Prune is unavailable, or undefined when it may run. */
export function pruneBlocker(plan: PrunePlan): string | undefined {
  if (!plan.allowed) return "Only the app's owning team (or an admin) can delete its images.";
  if (!plan.configured) return 'Pruning is not configured on this Backstage (GHCR_PRUNE_TOKEN is unset): the plan is shown, nothing can be deleted.';
  if (plan.deleteCount === 0) return 'Nothing to delete.';
  return undefined;
}

export function ImageCleanup({ owner, appName }: { owner: string; appName: string }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [plan, setPlan] = useState<PrunePlan | undefined>();
  const [busy, setBusy] = useState<'plan' | 'prune' | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [showKept, setShowKept] = useState(false);
  const [result, setResult] = useState<PruneResult | undefined>();

  const loadPlan = async (refresh = false) => {
    setBusy('plan');
    setError(undefined);
    setNote(undefined);
    setResult(undefined);
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const q = new URLSearchParams({ owner, appName, ...(refresh ? { refresh: 'true' } : {}) });
      const res = await fetchApi.fetch(`${base}/images/prune-plan?${q}`);
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setPlan(body as PrunePlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const prune = async () => {
    if (!plan) return;
    setConfirming(false);
    setBusy('prune');
    setError(undefined);
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${base}/images/prune`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, appName, planHash: plan.hash }),
      });
      const body = await res.json().catch(() => undefined);
      if (res.status === 409 && body?.plan) {
        setPlan({ ...(body.plan as PrunePlan), allowed: plan.allowed });
        setNote(body.error);
        return;
      }
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setResult(body as PruneResult);
      setPlan(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };

  const blocker = plan ? pruneBlocker(plan) : undefined;
  let planLabel = plan ? 'Plan again' : 'Show what would be deleted';
  if (busy === 'plan') planLabel = 'Planning…';
  const releases = plan?.packages.filter(p => p.kind !== 'cache') ?? [];
  const caches = plan?.packages.filter(p => p.kind === 'cache') ?? [];

  return (
    <div className={c.card} data-testid="image-cleanup">
      <div className={c.head}>
        <span className={c.title}>Clean up old images</span>
        <Button small disabled={!!busy} onClick={() => loadPlan(!!plan)}>
          {planLabel}
        </Button>
      </div>
      {!plan && !result && (
        <span className={c.note}>
          Deletes this app's old images from the registry ({appName}, {appName}-pr and the build cache), never one that is
          running, that an old ReplicaSet could scale back to, that git or an open PR names, or that is in an environment's
          last five healthy releases. You see the plan first.
        </span>
      )}
      {plan && (
        <>
          <span className={c.note}>
            Also kept: anything younger than {plan.rules.minAgeDays} days, and the {plan.rules.keepNewest} newest builds (build
            cache: the {plan.rules.keepNewestCache} newest layers).
          </span>
          {releases.map(p => {
            const del = p.decisions.filter(d => !d.keep);
            const kept = p.decisions.filter(d => d.keep);
            return (
              <div key={p.name}>
                <span className={c.pkg}>
                  {p.name}: {p.decisions.length} releases ({p.totalVersions} versions), delete {del.length} (
                  {p.deleteIds.length} versions)
                </span>
                {del.map(d => (
                  <div key={d.key} className={c.row}>
                    <span className={c.del}>DELETE</span>
                    <span className={c.mono}>{d.key}</span>
                    <span className={c.reasons}>built {relativeTime(d.createdAt)}; nothing uses it</span>
                  </div>
                ))}
                {showKept &&
                  kept.map(d => (
                    <div key={d.key} className={c.row}>
                      <span className={c.keep}>keep</span>
                      <span className={c.mono}>{d.key}</span>
                      <span className={c.reasons}>{d.reasons.join('; ')}</span>
                    </div>
                  ))}
                {p.unattributed > 0 && (
                  <span className={c.note}>{p.unattributed} untagged versions no release claims are kept.</span>
                )}
              </div>
            );
          })}
          {caches.map(p => (
            <span key={p.name} className={c.pkg}>
              {p.name}: delete {p.deleteIds.length} of {p.totalVersions} cache layers
            </span>
          ))}
          <div>
            <TextLink expanded={showKept} onClick={() => setShowKept(v => !v)}>
              Why each kept release is kept
            </TextLink>
          </div>
          <div className={c.head}>
            <Button small variant="danger" disabled={!!busy || !!blocker} title={blocker} onClick={() => setConfirming(true)}>
              {busy === 'prune' ? 'Deleting…' : `Delete ${plan.deleteCount} versions`}
            </Button>
            {blocker && <span className={c.note}>{blocker}</span>}
          </div>
          {confirming && (
            <div className={c.confirm} data-testid="prune-confirm">
              <span>
                Delete {plan.deleteCount} package versions from ghcr.io/{owner}? This cannot be undone; a release deleted here
                can only come back by building it again.
              </span>
              <Button small variant="danger" onClick={prune}>
                Delete
              </Button>
              <Button small onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          )}
        </>
      )}
      {note && <span className={c.bad}>{note}</span>}
      {error && <span className={c.bad}>{error}</span>}
      {result && (
        <span className={result.failed.length ? c.bad : c.ok}>
          Deleted {result.deleted} versions
          {result.failed.length ? `; ${result.failed.length} failed (${result.failed[0].error})` : ''}
          {result.remaining ? `; ${result.remaining} more remain, plan again to continue` : ''}.
        </span>
      )}
    </div>
  );
}
