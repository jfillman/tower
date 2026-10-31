import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { relativeTime } from '../../shared/format';
import { ActionReason, Button, Callout, Hint } from '../../ui';
import { OPENING_PR, PrReceipt } from '../../ui/PrRef';
import { useSearchParams } from 'react-router-dom';
import { ReleaseRunTracker } from '../../ReleaseRunTracker';

// Roll back a Kubernetes Flight environment (glidepath ADR-0021 phase 4). A rollback is a release of an earlier image:
// the backend (backstage glidepathRollback.ts) starts the app's release Pipeline for it, which opens a gitops PR like
// any release. The choices are the environment's eligible targets - the earlier images among its last five healthy
// releases - read from the release records by the backend; on those the content gates report without blocking.
// Abort stops a bad canary now; this is the durable fix, so git stops asking for the bad image.

interface RollbackTarget {
  releaseId: string;
  image: string;
  healthyAt: string;
  state: string;
}

interface RollbackPlan {
  current?: { releaseId: string; image?: string; state: string; stateAt?: string };
  targets: RollbackTarget[];
}

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: ({ t }) => `1px dashed ${t.lineSoft}` },
  label: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  mono: { fontFamily: fontMono, fontSize: 11 },
  input: {
    fontSize: 12,
    padding: '4px 8px',
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    minWidth: 220,
  },
}));

const tagOf = (image?: string) => (image ? image.slice(image.lastIndexOf(':') + 1) : '?');

export function RollbackControl({
  owner,
  appName,
  env,
  cluster,
  allowed,
}: {
  owner: string;
  appName: string;
  env: string;
  cluster: string;
  allowed: boolean;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [plan, setPlan] = useState<RollbackPlan | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ prUrl?: string; pipelineRun?: string; alreadyOpen?: boolean; label?: string } | undefined>();
  const [, setSearchParams] = useSearchParams();
  const openRun = (run: string) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'pipelines');
      next.set('run', run);
      return next;
    });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const base = await discoveryApi.getBaseUrl('glidepath');
        const q = new URLSearchParams({ appName, env, cluster });
        const res = await fetchApi.fetch(`${base}/release/rollback-plan?${q}`);
        const body = await res.json().catch(() => undefined);
        if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
        if (!live) return;
        setPlan(body as RollbackPlan);
        setTarget(t0 => t0 || (body as RollbackPlan).targets[0]?.releaseId || '');
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [discoveryApi, fetchApi, appName, env, cluster, result]);

  // The confirm row stays up while the request runs, so the busy label sits on the button that was pressed.
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${base}/release/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, appName, env, cluster, targetReleaseId: target, reason }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      // The tag rolled back to, kept with the answer: the plan re-reads once the result is in.
      setResult({ ...body, label: tagOf(plan?.targets.find(x => x.releaseId === target)?.image) });
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const chosen = plan?.targets.find(x => x.releaseId === target);

  return (
    <div className={c.wrap}>
      <span className={c.label}>Roll back {env}</span>
      {!plan && !error && <Hint>Reading this environment's releases…</Hint>}
      {plan && !plan.current && <Hint>Nothing has been released to {env} yet.</Hint>}
      {plan?.current && (
        <Hint>
          Running: <span className={c.mono}>{tagOf(plan.current.image)}</span> ({plan.current.state}
          {plan.current.stateAt ? `, ${relativeTime(plan.current.stateAt)}` : ''})
        </Hint>
      )}
      {plan?.current && plan.targets.length === 0 && (
        <Hint>No earlier image ran healthy here in the last five releases, so there is nothing to roll back to.</Hint>
      )}
      {plan?.current && plan.targets.length > 0 && (
        <div className={c.row}>
          <select aria-label={`Release to roll ${env} back to`} className={c.input} value={target} onChange={e => setTarget(e.target.value)}>
            {plan.targets.map(x => (
              <option key={x.releaseId} value={x.releaseId}>
                {tagOf(x.image)} - healthy {relativeTime(x.healthyAt)}
              </option>
            ))}
          </select>
          <input
            aria-label="Reason"
            className={c.input}
            placeholder="Why (goes on the PR and the release record)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <Button
            small
            variant="danger"
            disabled={!allowed || busy || confirming || !target || !reason.trim()}
            aria-describedby={allowed ? undefined : 'rollback-reason'}
            onClick={() => setConfirming(true)}
          >
            Roll back
          </Button>
        </div>
      )}
      {!allowed && <ActionReason id="rollback-reason">Only the app&apos;s owning team (or an admin) can roll back.</ActionReason>}
      {confirming && chosen && (
        <div className={c.row}>
          <Hint>
            Open a release PR putting <span className={c.mono}>{tagOf(chosen.image)}</span> back on {env}? It ran healthy here,
            so the content checks report without blocking; integrity checks and approvals apply as always.
          </Hint>
          <Button small variant="danger" disabled={busy} onClick={submit}>
            {busy ? OPENING_PR : 'Open rollback PR'}
          </Button>
          <Button small disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
      {error && <Callout tone="bad">{error}</Callout>}
      {result?.prUrl && <PrReceipt prUrl={result.prUrl} alreadyOpen={result.alreadyOpen} next="merge it to roll back." />}
      {result && !result.prUrl && result.pipelineRun && (
        // The backend waited 90 s for the PR; the run goes on, and this follows it to the PR (2026-10-31: the first
        // live rollback took 8 minutes to open its PR, with nothing on screen in between).
        <ReleaseRunTracker
          appName={appName}
          release={{ run: result.pipelineRun, env, label: result.label ?? '?', kind: 'rollback' }}
          onPr={() => undefined}
          onOpenRun={openRun}
          onDismiss={() => setResult(undefined)}
        />
      )}
    </div>
  );
}
