import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { Progress } from '@backstage/core-components';
import { useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { DEFAULT_DORA_WINDOW, DORA_WINDOWS, isDoraWindow } from '../../fleet/dora';
import { buildOpsWallModel, type ProvisioningSignal, type TowerHref } from '../../fleet/opsWallModel';
import { useDoraMetrics } from '../../fleet/useDoraMetrics';
import { useFleetPipelineRuns } from '../../fleet/useFleetPipelineRuns';
import { useFleetReleaseEvents, useFleetReleaseRecords } from '../../fleet/useFleetReleases';
import { isStale, usePolled, type Polled } from '../../fleet/usePolled';
import { ProvisioningStrip } from '../../provisioning/ProvisioningStrip';
import { toItems, useNow } from '../../provisioning/shared';
import { useProvisioning } from '../../provisioning/useProvisioning';
import { useFleetEnvironments } from '../../useFleetEnvironments';
import { useFleetRoster } from '../../useFleetRoster';
import { useFleetSlos } from '../../useFleetSlos';
import { ActivityPanel, AttentionPanel, DeploymentsPanel, DoraPanel, PipelinesPanel } from './opswall/panels';
import { useOpsStyles } from './opswall/styles';

// The Ops Wall: what is happening across the fleet right now and what needs a human. Every
// source is read directly (Tekton, Glidepath's release records, Kubernetes, Argo CD, Prometheus,
// notifications) and none of them is GitHub: the page stays open for days. Design and rules:
// HANDOFF-tower-ops-wall.md.

const WINDOWS = { '24h': 24 * 3600_000, '7d': 7 * 24 * 3600_000 } as const;
type OpsWindow = keyof typeof WINDOWS;
const isOpsWindow = (v: string | null): v is OpsWindow => v !== null && v in WINDOWS;

const ACTIVITY_POLL_MS = 30_000;

/** The name the pipelines, release records and SLOs use for an entity: its repo name, else its catalog name. */
function appNamesOf(e: Entity): string[] {
  const slugRepo = e.metadata.annotations?.['github.com/project-slug']?.split('/')[1];
  return [...new Set([e.metadata.name, slugRepo].filter((n): n is string => Boolean(n)))];
}

type SourceState = 'ok' | 'loading' | 'stale' | 'down';

function sourceState(p: Pick<Polled<unknown>, 'loading' | 'failures' | 'updatedAt'>): SourceState {
  if (p.updatedAt === undefined) return p.failures > 0 ? 'down' : 'loading';
  return isStale(p) ? 'stale' : 'ok';
}

function sourceColor(t: HangarTokens, s: SourceState): string {
  if (s === 'ok') return t.good;
  if (s === 'stale') return t.amber;
  if (s === 'down') return t.bad;
  return t.textFaint;
}

function staleNote(p: Polled<unknown>): string | undefined {
  if (!isStale(p)) return undefined;
  if (p.updatedAt === undefined) return `not loading: ${p.error ?? 'unknown error'}`;
  return `stale since ${new Date(p.updatedAt).toLocaleTimeString()}`;
}

export function OpsWallDashboard() {
  const t = useHangarTokens();
  const c = useOpsStyles({ t });
  const now = useNow(1000);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, value);
      else next.delete(key);
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const windowParam = searchParams.get('window');
  const opsWindow: OpsWindow = isOpsWindow(windowParam) ? windowParam : '24h';
  const doraParam = Number(searchParams.get('dora'));
  const doraWindow = isDoraWindow(doraParam) ? doraParam : DEFAULT_DORA_WINDOW;
  const owner = searchParams.get('owner') ?? undefined;

  // ---- who is in the fleet: every Tower service, whatever it deploys to
  const roster = useFleetRoster('services');
  const k8sEntities = useMemo(() => roster.entities.filter(isKubernetesAvailable), [roster.entities]);
  const { apps, probes } = useFleetEnvironments(k8sEntities);
  const clusters = useMemo(() => [...new Set(apps.flatMap(a => a.environments.map(e => e.cluster)))], [apps]);
  const { summary: sloSummary, slos, probes: sloProbes } = useFleetSlos(clusters);

  const owners = useMemo(
    () =>
      [...new Set(roster.entities.map(e => e.spec?.owner).filter((o): o is string => typeof o === 'string'))].sort(),
    [roster.entities],
  );
  const refByApp = useMemo(() => {
    const m = new Map<string, string>();
    roster.entities.forEach(e => appNamesOf(e).forEach(n => m.set(n, stringifyEntityRef(e))));
    return m;
  }, [roster.entities]);
  const appFilter = useMemo(() => {
    if (!owner) return undefined;
    return new Set(roster.entities.filter(e => e.spec?.owner === owner).flatMap(appNamesOf));
  }, [owner, roster.entities]);

  const towerHref = useCallback<TowerHref>(
    (app, tab, params) => {
      const ref = refByApp.get(app);
      if (!ref) return undefined;
      const q = new URLSearchParams({ entity: ref, tab, ...params });
      return `${location.pathname}?${q.toString()}`;
    },
    [refByApp, location.pathname],
  );

  // ---- polled sources
  const runs = useFleetPipelineRuns();
  const records = useFleetReleaseRecords();
  const events = useFleetReleaseEvents();
  const dora = useDoraMetrics(doraWindow, appFilter ? [...appFilter] : undefined);
  const notificationsApi = useApi(notificationsApiRef);
  const fetchActivity = useCallback(
    () =>
      notificationsApi
        .getNotifications({ limit: 40, sort: 'created', sortOrder: 'desc' })
        .then(res => res.notifications),
    [notificationsApi],
  );
  const activity = usePolled('ops-activity', fetchActivity, ACTIVITY_POLL_MS);

  const provisioning = useProvisioning();
  const provItems = useMemo(() => toItems(provisioning.items, now), [provisioning.items, now]);
  const provSignals = useMemo<ProvisioningSignal[]>(
    () =>
      provItems.map(i => ({
        name: i.inputs.xr.name,
        failed: i.derived.failed,
        stalled: i.derived.stalled,
        since: new Date(i.inputs.xr.createdAt).toISOString(),
      })),
    [provItems],
  );
  const provInFlight = useMemo(
    () => provItems.filter(i => !i.derived.stalled && (!appFilter || appFilter.has(i.inputs.xr.name))),
    [provItems, appFilter],
  );

  const model = useMemo(
    () =>
      buildOpsWallModel({
        now,
        windowMs: WINDOWS[opsWindow],
        apps,
        runs: runs.data ?? [],
        records: records.data ?? [],
        events: events.data ?? [],
        slos,
        provisioning: provSignals,
        towerHref,
        appFilter,
      }),
    [now, opsWindow, apps, runs.data, records.data, events.data, slos, provSignals, towerHref, appFilter],
  );

  const activityItems = useMemo(() => {
    const list = activity.data ?? [];
    if (!appFilter) return list;
    const names = [...appFilter];
    return list.filter(n => names.some(a => `${n.payload.title} ${n.payload.description ?? ''}`.includes(a)));
  }, [activity.data, appFilter]);

  if (roster.loading) return <Progress />;

  const k = model.kpis;
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const sloPct = sloSummary.total ? Math.round((sloSummary.meetingObjective / sloSummary.total) * 100) : undefined;
  const cfr = dora.data?.changeFailureRate;

  const sources: Array<{ label: string; state: SourceState; at?: number; title?: string }> = [
    { label: 'Pipelines', state: sourceState(runs), at: runs.updatedAt, title: runs.error },
    { label: 'Releases', state: sourceState(records), at: records.updatedAt, title: records.error },
    { label: 'Release alerts', state: sourceState(events), at: events.updatedAt, title: events.error },
    {
      label: `Environments ${apps.length}/${k8sEntities.length}`,
      state: apps.length < k8sEntities.length ? 'loading' : 'ok',
    },
    { label: 'SLOs', state: sloSummary.loading ? 'loading' : 'ok' },
    {
      label: 'DORA',
      state: sourceState(dora),
      at: dora.updatedAt,
      title: dora.error ?? `${dora.source.service} on ${dora.source.cluster}`,
    },
    { label: 'Activity', state: sourceState(activity), at: activity.updatedAt, title: activity.error },
  ];

  const kpis: Array<{ id: string; label: string; value: string; sub: string; color: string }> = [
    {
      id: 'ops-pipelines',
      label: 'Pipelines running',
      value: String(k.pipelinesRunning),
      sub: [k.pipelinesQueued ? `${k.pipelinesQueued} queued` : '', k.slowRuns ? `${k.slowRuns} slow` : '']
        .filter(Boolean)
        .join(' · '),
      color: k.slowRuns ? t.amber : t.sky,
    },
    {
      id: 'ops-deployments',
      label: 'Deploying now',
      value: String(k.deploying),
      sub: [k.canaries ? `${k.canaries} mid-canary` : '', k.pausedRollouts ? `${k.pausedRollouts} paused` : '']
        .filter(Boolean)
        .join(' · '),
      color: t.sky,
    },
    {
      id: 'ops-approvals',
      label: 'Awaiting approval',
      value: String(k.awaitingApproval),
      sub: k.oldestApprovalSince
        ? `oldest ${Math.max(0, Math.floor((now - Date.parse(k.oldestApprovalSince)) / 3600_000))}h`
        : '',
      color: k.awaitingApproval ? t.amber : t.good,
    },
    {
      id: 'ops-attention',
      label: 'Envs failing',
      value: String(k.envsFailing),
      sub: `of ${k.envsTotal}${k.outOfSync ? ` · ${k.outOfSync} out of sync` : ''}`,
      color: k.envsFailing ? t.bad : t.good,
    },
    {
      id: 'ops-attention',
      label: 'SLO compliance',
      value: sloPct === undefined ? '—' : `${sloPct}%`,
      sub: sloSummary.total
        ? `${sloSummary.total - sloSummary.meetingObjective} of ${sloSummary.total} breaching`
        : 'no SLOs',
      color: sloPct !== undefined && sloPct < 100 ? t.amber : t.good,
    },
    {
      id: 'ops-dora',
      label: 'Change failure rate',
      value: cfr === undefined ? '—' : `${Math.round(cfr * 100)}%`,
      sub: `last ${doraWindow} days`,
      color: cfr !== undefined && cfr >= 0.15 ? t.amber : t.good,
    },
  ];

  return (
    <div className={c.root}>
      {probes}
      {sloProbes}

      <div className={c.toolbar}>
        <span className={c.toolGroup}>
          <label className={c.toolLabel} htmlFor="ops-owner">
            Team
          </label>
          <select
            id="ops-owner"
            className={c.select}
            value={owner ?? ''}
            onChange={e => setParam('owner', e.target.value || undefined)}
          >
            <option value="">All teams</option>
            {owners.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </span>
        <span className={c.toolGroup}>
          <label className={c.toolLabel} htmlFor="ops-window">
            Window
          </label>
          <select
            id="ops-window"
            className={c.select}
            value={opsWindow}
            onChange={e => setParam('window', e.target.value === '24h' ? undefined : e.target.value)}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
          </select>
        </span>
        <div className={c.sources} aria-label="Data sources">
          {sources.map(s => (
            <span key={s.label} className={c.source} title={s.title}>
              <i className={c.dot} style={{ backgroundColor: sourceColor(t, s.state) }} />
              {s.label}
              {s.at !== undefined && (
                <span className={c.sourceAge}>{Math.max(0, Math.round((now - s.at) / 1000))}s</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className={c.kpis}>
        {kpis.map(kpi => (
          <button
            key={kpi.label}
            type="button"
            className={c.kpi}
            style={{ borderTopColor: kpi.color }}
            onClick={() => scrollTo(kpi.id)}
          >
            <div className={c.kpiLabel}>{kpi.label}</div>
            <div className={c.kpiValue} style={{ color: kpi.color }}>
              {kpi.value}
            </div>
            <div className={c.kpiSub}>{kpi.sub}</div>
          </button>
        ))}
      </div>

      <ProvisioningStrip
        items={provInFlight}
        onOpen={name =>
          window.open(`${location.pathname}?view=provisioning&service=${encodeURIComponent(name)}`, '_blank')
        }
      />

      <div className={c.main}>
        <AttentionPanel items={model.attention} now={now} limit={14} stale={staleNote(records) ?? staleNote(runs)} />
        <div className={c.column}>
          <PipelinesPanel
            items={model.pipelines}
            stats={model.pipelineStats}
            windowLabel={opsWindow}
            limit={6}
            stale={staleNote(runs)}
          />
          <DeploymentsPanel
            items={model.deployments}
            approvals={model.approvals}
            landed={model.landed}
            now={now}
            windowLabel={opsWindow}
            limit={6}
            stale={staleNote(records)}
          />
        </div>
      </div>

      <div className={c.bottom}>
        <DoraPanel
          snapshot={dora.data}
          error={dora.error}
          loading={dora.loading}
          stale={dora.data ? staleNote(dora) : undefined}
          sourceLabel={`${dora.source.service} on ${dora.source.cluster}`}
          windowDays={doraWindow}
          windows={DORA_WINDOWS}
          onWindow={d => setParam('dora', d === DEFAULT_DORA_WINDOW ? undefined : String(d))}
        />
        <ActivityPanel items={activityItems} now={now} limit={10} stale={staleNote(activity)} error={activity.error} />
      </div>
    </div>
  );
}
