import { useCallback, useEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { Button, Chip, TierChip } from '../../ui';
import { RollbackControl } from './RollbackControl';

// Argo Rollouts controls (glidepath ADR-0021 phase 4; replaces the disabled "Tier 2" placeholder row). The
// backend (backstage glidepathProvenance.ts /argo/rollout-actions) runs Argo CD's built-in Rollout actions as
// the `backstage` Argo CD account, so Tower holds no Kubernetes RBAC for them. Two things decide whether a
// button is usable, and the backend reports both: Argo CD's own discovery script (is this action meaningful for
// the Rollout's current state: abort only while progressing, retry only once aborted, ...) and Backstage's
// permission policy (only the app's owning team or admins). On a Flight environment promote-full and
// skip-current-step skip canary analysis, so they are marked as a bypass and confirmed with that said out loud.

type RolloutActionName = 'resume' | 'skip-current-step' | 'promote-full' | 'pause' | 'abort' | 'retry' | 'restart';

interface RolloutActionState {
  name: RolloutActionName;
  displayName?: string;
  disabled: boolean;
  allowed: boolean;
  bypass: boolean;
}

interface RolloutActionsResponse {
  tier: 'ground' | 'flight';
  env?: string;
  actions: RolloutActionState[];
  // For the rollback control (Flight only): the app, its GitHub owner, and whether this user may roll it back.
  app?: string;
  owner?: string;
  rollbackAllowed?: boolean;
}

const ACTION_COPY: Record<RolloutActionName, { label: string; body: string; confirm?: boolean; danger?: boolean }> = {
  resume: {
    label: 'Resume',
    body: 'Continue a paused canary to its next step: the approval a pause step waits for, or the end of a manual Pause.',
  },
  'skip-current-step': {
    label: 'Promote',
    body: 'Skip the current canary step, and any analysis on it, and move to the next step.',
    confirm: true,
  },
  'promote-full': {
    label: 'Promote full',
    body: 'Skip every remaining step and analysis and send all traffic to the new version now.',
    confirm: true,
  },
  pause: { label: 'Pause', body: 'Hold the canary at its current step until someone resumes it.' },
  abort: {
    label: 'Abort',
    body: 'Stop the canary now and send all traffic back to the stable version. Git still asks for the new version, so the Rollout stays aborted until a rollback release replaces it or someone retries.',
    confirm: true,
    danger: true,
  },
  retry: { label: 'Retry', body: 'Start an aborted canary again from its first step, with the same version.' },
  restart: {
    label: 'Restart pods',
    body: "Restart the current version's pods, a few at a time. Changes nothing in git.",
    confirm: true,
  },
};

const ORDER: RolloutActionName[] = ['resume', 'skip-current-step', 'promote-full', 'pause', 'abort', 'retry', 'restart'];

const POLL_MS = 15_000;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingBottom: 12,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
  },
  row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  label: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em' },
  note: { fontSize: 11.5, color: ({ t }) => t.textLo, lineHeight: 1.5 },
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
  bad: { fontSize: 11.5, fontStyle: 'italic', color: ({ t }) => t.bad },
  ok: { fontSize: 11.5, color: ({ t }) => t.good },
}));

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function useRolloutActions(target: { cluster: string; appName: string; namespace: string; rolloutName: string }) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [data, setData] = useState<RolloutActionsResponse | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [pending, setPending] = useState<RolloutActionName | undefined>();
  const [runError, setRunError] = useState<string | undefined>();
  const [lastRun, setLastRun] = useState<{ action: RolloutActionName; bypass: boolean } | undefined>();
  const { cluster, appName, namespace, rolloutName } = target;

  const load = useCallback(async () => {
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const q = new URLSearchParams({ cluster, appName, namespace, rolloutName });
      const res = await fetchApi.fetch(`${base}/argo/rollout-actions?${q}`);
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setData(body as RolloutActionsResponse);
      setLoadError(undefined);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [discoveryApi, fetchApi, cluster, appName, namespace, rolloutName]);

  // Keyed on the Rollout, not on `load`'s identity, so a re-render never restarts the poll or blanks the buttons.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    setData(undefined);
    setLastRun(undefined);
    setRunError(undefined);
    loadRef.current();
    const id = setInterval(() => loadRef.current(), POLL_MS);
    return () => clearInterval(id);
  }, [cluster, appName, namespace, rolloutName]);

  const run = async (action: RolloutActionName) => {
    setPending(action);
    setRunError(undefined);
    setLastRun(undefined);
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${base}/argo/rollout-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, appName, namespace, rolloutName, action }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setLastRun({ action, bypass: Boolean(body?.bypass) });
    } catch (e) {
      setRunError(errorMessage(e));
    } finally {
      setPending(undefined);
      load();
    }
  };

  return { data, loadError, pending, runError, lastRun, run };
}

function titleFor(a: RolloutActionState): string {
  const copy = ACTION_COPY[a.name];
  if (!a.allowed) return `${copy.body}\n\nOnly the app's owning team (or an admin) can do this.`;
  if (a.disabled) return `${copy.body}\n\nNot available in the Rollout's current state.`;
  if (a.bypass) return `${copy.body}\n\nOn this Flight environment that skips canary analysis: recorded and announced as a bypass.`;
  return copy.body;
}

export function RolloutControls({
  cluster,
  argoAppName,
  namespace,
  rolloutName,
}: {
  cluster: string;
  argoAppName: string;
  namespace: string;
  rolloutName: string;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { data, loadError, pending, runError, lastRun, run } = useRolloutActions({
    cluster,
    appName: argoAppName,
    namespace,
    rolloutName,
  });
  const [confirming, setConfirming] = useState<RolloutActionState | undefined>();

  const byName = new Map((data?.actions ?? []).map(a => [a.name, a]));
  const actions = ORDER.flatMap(n => (byName.has(n) ? [byName.get(n)!] : []));
  const noneAllowed = actions.length > 0 && actions.every(a => !a.allowed);

  const click = (a: RolloutActionState) => {
    if (ACTION_COPY[a.name].confirm || a.bypass) setConfirming(a);
    else run(a.name);
  };

  return (
    <div className={c.wrap}>
      <div className={c.row}>
        <span className={c.label}>Rollout controls</span>
        {data && <TierChip tier={data.tier} />}
      </div>
      {loadError && !data && <span className={c.bad}>Couldn't read the Rollout's actions: {loadError}</span>}
      {!loadError && !data && <span className={c.note}>Reading the Rollout's actions…</span>}
      {data && (
        <div className={c.row}>
          {actions.map(a => (
            <Button
              key={a.name}
              small
              variant={ACTION_COPY[a.name].danger ? 'danger' : 'default'}
              title={titleFor(a)}
              disabled={a.disabled || !a.allowed || Boolean(pending)}
              onClick={() => click(a)}
            >
              {pending === a.name ? `${ACTION_COPY[a.name].label}…` : ACTION_COPY[a.name].label}
              {a.bypass && !a.disabled ? ' ⚠' : ''}
            </Button>
          ))}
        </div>
      )}
      {noneAllowed && (
        <span className={c.note}>Only the app's owning team (or an admin) can run these. Hover a button for what it does.</span>
      )}
      {confirming && (
        <div className={c.confirm}>
          <span>
            {ACTION_COPY[confirming.name].body}
            {confirming.bypass && (
              <>
                {' '}
                <strong>
                  This skips canary analysis on a Flight environment. It is recorded and announced to everyone, like a
                  break-glass bypass.
                </strong>
              </>
            )}
          </span>
          <Button
            small
            variant={confirming.bypass || ACTION_COPY[confirming.name].danger ? 'danger' : 'primary'}
            onClick={() => {
              const a = confirming;
              setConfirming(undefined);
              run(a.name);
            }}
          >
            {ACTION_COPY[confirming.name].label}
          </Button>
          <Button small onClick={() => setConfirming(undefined)}>
            Cancel
          </Button>
        </div>
      )}
      {runError && <span className={c.bad}>{runError}</span>}
      {lastRun && (
        <span className={c.ok}>
          {ACTION_COPY[lastRun.action].label} sent to Argo CD.
          {lastRun.action === 'abort' &&
            ' Traffic is back on the stable version. Git still asks for the new one: release a fix or roll back, or Retry once the cause is gone.'}
          {lastRun.bypass && ' Recorded as a bypass and announced.'}
        </span>
      )}
      {lastRun?.bypass && <Chip tone="bad">analysis skipped</Chip>}
      {data?.tier === 'flight' && data.app && data.owner && data.env && (
        <RollbackControl owner={data.owner} appName={data.app} env={data.env} cluster={cluster} allowed={Boolean(data.rollbackAllowed)} />
      )}
    </div>
  );
}
