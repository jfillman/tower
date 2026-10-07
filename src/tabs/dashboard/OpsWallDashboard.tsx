import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { Progress } from '@backstage/core-components';
import Tooltip from '@material-ui/core/Tooltip';
import { useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { DEFAULT_DORA_WINDOW, DORA_WINDOWS, isDoraWindow } from '../../fleet/dora';
import { buildOpsWallModel, type ProvisioningSignal, type TowerHref } from '../../fleet/opsWallModel';
import { useDoraMetrics } from '../../fleet/useDoraMetrics';
import { useFleetPipelineRuns } from '../../fleet/useFleetPipelineRuns';
import { useFleetPipelineHistory } from '../../fleet/useFleetPipelineHistory';
import { formatCategories, parseCategories, type PipelineCategory } from '../../fleet/pipelineHistory';
import { useFleetReleaseEvents, useFleetReleaseRecords } from '../../fleet/useFleetReleases';
import { isStale, usePolled, type Polled } from '../../fleet/usePolled';
import { ProvisioningStrip } from '../../provisioning/ProvisioningStrip';
import { toItems, useNow } from '../../provisioning/shared';
import { useProvisioning } from '../../provisioning/useProvisioning';
import { useFleetEnvironments } from '../../useFleetEnvironments';
import { useFleetRoster } from '../../useFleetRoster';
import { useFleetSlos } from '../../useFleetSlos';
import type { DashboardProps } from './dashboards';
import {
  ActivityPanel,
  AttentionPanel,
  DeploymentsPanel,
  DoraPanel,
  FitContext,
  PipelinesPanel,
} from './opswall/panels';
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

function sourceState(p: Polled<unknown>, now: number): SourceState {
  if (p.updatedAt === undefined) return p.failures > 0 ? 'down' : 'loading';
  return isStale(p, now) ? 'stale' : 'ok';
}

function sourceColor(t: HangarTokens, s: SourceState): string {
  if (s === 'ok') return t.good;
  if (s === 'stale') return t.amber;
  if (s === 'down') return t.bad;
  return t.textFaint;
}

function staleNote(p: Polled<unknown>, now: number): string | undefined {
  if (!isStale(p, now)) return undefined;
  if (p.updatedAt === undefined) return `not loading: ${p.error ?? 'unknown error'}`;
  return `stale since ${new Date(p.updatedAt).toLocaleTimeString()}`;
}

const every = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)}s`);

function ago(now: number, at: number): string {
  const sec = Math.max(0, Math.round((now - at) / 1000));
  return sec < 120 ? `${sec}s` : `${Math.round(sec / 60)}m`;
}

/** The page's own width, so the layout follows the space it has (sidebar, fullscreen), not the window. */
function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

/** Three columns on a wall screen, two on a laptop, one on a phone. Unknown width (no ResizeObserver): three. */
function columnCount(width: number): 1 | 2 | 3 {
  if (width === 0 || width >= 1500) return 3;
  return width >= 1000 ? 2 : 1;
}

export function OpsWallDashboard({ fit = false }: DashboardProps) {
  const t = useHangarTokens();
  const c = useOpsStyles({ t });
  const now = useNow(1000);
  const [rootRef, width] = useWidth();
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
  const categoriesParam = searchParams.get('pipelines');
  const categories = useMemo(() => parseCategories(categoriesParam), [categoriesParam]);
  const toggleCategory = (cat: PipelineCategory) => {
    const next = new Set(categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setParam('pipelines', formatCategories(next) ?? undefined);
  };

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
  const history = useFleetPipelineHistory(WINDOWS[opsWindow]);
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
        history: history.data ?? [],
        pipelineCategories: categories,
        records: records.data ?? [],
        events: events.data ?? [],
        slos,
        provisioning: provSignals,
        towerHref,
        appFilter,
      }),
    [
      now,
      opsWindow,
      apps,
      runs.data,
      history.data,
      categories,
      records.data,
      events.data,
      slos,
      provSignals,
      towerHref,
      appFilter,
    ],
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

  // ---- data sources: a dot each; the tooltip says what it reads, how often, and when it last answered
  const polledSource = (label: string, p: Polled<unknown>, what: string) => {
    const state = sourceState(p, now);
    return {
      label,
      state,
      // The age only shows when it matters: a source behind schedule or failing.
      badge: state === 'stale' && p.updatedAt !== undefined ? ago(now, p.updatedAt) : undefined,
      tip: (
        <div className={c.tip}>
          <div className={c.tipTitle}>{label}</div>
          <div>{what}</div>
          <div>Refreshes every {every(p.intervalMs)}.</div>
          <div>
            {p.updatedAt !== undefined
              ? `Last updated ${new Date(p.updatedAt).toLocaleTimeString()} (${ago(now, p.updatedAt)} ago).`
              : 'Not loaded yet.'}
          </div>
          {p.failures > 0 && p.error && (
            <div className={c.tipError}>
              Last {p.failures} {p.failures === 1 ? 'poll' : 'polls'} failed: {p.error}
            </div>
          )}
        </div>
      ),
    };
  };
  const sources: Array<{ label: string; state: SourceState; badge?: string; tip: JSX.Element }> = [
    polledSource(
      'Pipelines',
      runs,
      'Running and recent Tekton PipelineRuns on kind-dev (finished runs are archived after about an hour).',
    ),
    polledSource('History', history, `Finished runs for the last ${opsWindow}, from the Tekton Results archive.`),
    polledSource(
      'Releases',
      records,
      "Glidepath's release records (upper-environment releases and their state) on kind-dev.",
    ),
    polledSource(
      'Release alerts',
      events,
      'ReleaseStalled and ReleaseDrift events Glidepath raises on its release records.',
    ),
    {
      label: 'Environments',
      state: apps.length < k8sEntities.length ? 'loading' : 'ok',
      badge: apps.length < k8sEntities.length ? `${apps.length}/${k8sEntities.length}` : undefined,
      tip: (
        <div className={c.tip}>
          <div className={c.tipTitle}>Environments</div>
          <div>Live Kubernetes and Argo CD state of every service, read per service as it streams in.</div>
          <div>
            {apps.length} of {k8sEntities.length} services have reported.
          </div>
        </div>
      ),
    },
    {
      label: 'SLOs',
      state: sloSummary.loading ? 'loading' : 'ok',
      tip: (
        <div className={c.tip}>
          <div className={c.tipTitle}>SLOs</div>
          <div>Sloth SLO burn rates from each cluster&apos;s Prometheus.</div>
        </div>
      ),
    },
    polledSource('DORA', dora, `dora-exporter metrics via ${dora.source.service} on ${dora.source.cluster}.`),
    polledSource('Activity', activity, 'Backstage notifications: builds, deploys, config changes, SLO transitions.'),
  ];

  const kpis: Array<{ id: string; label: string; value: string; sub: string; color: string; hint: string }> = [
    {
      id: 'ops-pipelines',
      label: 'Pipelines running',
      value: String(k.pipelinesRunning),
      sub: [k.pipelinesQueued ? `${k.pipelinesQueued} queued` : '', k.slowRuns ? `${k.slowRuns} slow` : '']
        .filter(Boolean)
        .join(' · '),
      color: k.slowRuns ? t.amber : t.sky,
      hint: 'Pipelines running now, of the types selected in the Pipelines panel.',
    },
    {
      id: 'ops-deployments',
      label: 'Deploying now',
      value: String(k.deploying),
      sub: [k.canaries ? `${k.canaries} mid-canary` : '', k.pausedRollouts ? `${k.pausedRollouts} paused` : '']
        .filter(Boolean)
        .join(' · '),
      color: t.sky,
      hint: 'Releases being applied, deploy pipelines running, and rollouts in progress.',
    },
    {
      id: 'ops-approvals',
      label: 'Awaiting approval',
      value: String(k.awaitingApproval),
      sub: k.oldestApprovalSince
        ? `oldest ${Math.max(0, Math.floor((now - Date.parse(k.oldestApprovalSince)) / 3600_000))}h`
        : '',
      color: k.awaitingApproval ? t.amber : t.good,
      hint: 'Release PRs to upper environments that are open and not yet merged.',
    },
    {
      id: 'ops-attention',
      label: 'Envs failing',
      value: String(k.envsFailing),
      sub: `of ${k.envsTotal}${k.outOfSync ? ` · ${k.outOfSync} out of sync` : ''}`,
      color: k.envsFailing ? t.bad : t.good,
      hint: 'Environments whose Rollout or Argo CD health is Degraded.',
    },
    {
      id: 'ops-attention',
      label: 'SLO compliance',
      value: sloPct === undefined ? '—' : `${sloPct}%`,
      sub: sloSummary.total
        ? `${sloSummary.total - sloSummary.meetingObjective} of ${sloSummary.total} breaching`
        : 'no SLOs',
      color: sloPct !== undefined && sloPct < 100 ? t.amber : t.good,
      hint: 'SLOs within their error budget over the full compliance period.',
    },
    {
      id: 'ops-dora',
      label: 'Change failure rate',
      value: cfr === undefined ? '—' : `${Math.round(cfr * 100)}%`,
      sub: `last ${doraWindow} days`,
      color: cfr !== undefined && cfr >= 0.15 ? t.amber : t.good,
      hint: 'Failed upper-environment releases as a share of all of them (DORA).',
    },
  ];

  const panels = {
    attention: (
      <AttentionPanel
        key="attention"
        items={model.attention}
        now={now}
        limit={14}
        stale={staleNote(records, now) ?? staleNote(runs, now)}
      />
    ),
    pipelines: (
      <PipelinesPanel
        key="pipelines"
        items={model.pipelines}
        recent={model.recentRuns}
        stats={model.pipelineStats}
        counts={model.pipelineCounts}
        categories={categories}
        onToggleCategory={toggleCategory}
        towerHref={towerHref}
        now={now}
        windowLabel={opsWindow}
        limit={6}
        stale={staleNote(runs, now)}
        historyNote={
          history.updatedAt === undefined && history.failures > 0
            ? `Run archive unavailable (${history.error}); history covers the last hour only.`
            : undefined
        }
      />
    ),
    deployments: (
      <DeploymentsPanel
        key="deployments"
        items={model.deployments}
        approvals={model.approvals}
        landed={model.landed}
        now={now}
        windowLabel={opsWindow}
        limit={6}
        stale={staleNote(records, now)}
      />
    ),
    dora: (
      <DoraPanel
        key="dora"
        snapshot={dora.data}
        error={dora.error}
        loading={dora.loading}
        stale={dora.data ? staleNote(dora, now) : undefined}
        sourceLabel={`${dora.source.service} on ${dora.source.cluster}`}
        windowDays={doraWindow}
        windows={DORA_WINDOWS}
        onWindow={d => setParam('dora', d === DEFAULT_DORA_WINDOW ? undefined : String(d))}
      />
    ),
    activity: (
      <ActivityPanel
        key="activity"
        items={activityItems}
        now={now}
        limit={12}
        stale={staleNote(activity, now)}
        error={activity.error}
      />
    ),
  };
  // Panels stack inside columns, so a short panel never leaves a gap under it.
  const n = columnCount(width);
  let columns: ReactNode[][];
  if (n === 3) {
    columns = [[panels.attention, panels.activity], [panels.pipelines], [panels.deployments, panels.dora]];
  } else if (n === 2) {
    columns = [
      [panels.attention, panels.pipelines, panels.activity],
      [panels.deployments, panels.dora],
    ];
  } else {
    columns = [[panels.attention, panels.pipelines, panels.deployments, panels.dora, panels.activity]];
  }

  return (
    <div className={fit ? `${c.root} ${c.rootFit}` : c.root} ref={rootRef}>
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
          <span className={c.sourcesLabel}>Sources</span>
          {sources.map(src => (
            <Tooltip key={src.label} title={src.tip} arrow>
              <span className={c.source} tabIndex={0}>
                <i className={c.dot} style={{ backgroundColor: sourceColor(t, src.state) }} />
                {src.label}
                {src.badge && (
                  <span className={c.sourceAge} style={{ color: sourceColor(t, src.state) }}>
                    {src.badge}
                  </span>
                )}
              </span>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className={c.kpis}>
        {kpis.map(kpi => (
          <Tooltip key={kpi.label} title={<div className={c.tip}>{kpi.hint}</div>} arrow enterDelay={600}>
            <button
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
          </Tooltip>
        ))}
      </div>

      <ProvisioningStrip
        items={provInFlight}
        onOpen={name =>
          window.open(`${location.pathname}?view=provisioning&service=${encodeURIComponent(name)}`, '_blank')
        }
      />

      <FitContext.Provider value={fit}>
        <div
          className={fit ? `${c.columns} ${c.columnsFit}` : c.columns}
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {columns.map((col, i) => (
            <div key={i} className={fit ? `${c.column} ${c.columnFit}` : c.column}>
              {col}
            </div>
          ))}
        </div>
      </FitContext.Provider>
    </div>
  );
}
