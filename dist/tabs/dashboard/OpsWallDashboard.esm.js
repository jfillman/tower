import { jsx, jsxs } from 'react/jsx-runtime';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { Progress } from '@backstage/core-components';
import Tooltip from '@material-ui/core/Tooltip';
import { useHangarTokens } from '../../brand/tokens.esm.js';
import { DEFAULT_DORA_WINDOW, DORA_WINDOWS, isDoraWindow } from '../../fleet/dora.esm.js';
import { buildOpsWallModel } from '../../fleet/opsWallModel.esm.js';
import { useDoraMetrics } from '../../fleet/useDoraMetrics.esm.js';
import { useFleetPipelineRuns } from '../../fleet/useFleetPipelineRuns.esm.js';
import { useFleetPipelineHistory } from '../../fleet/useFleetPipelineHistory.esm.js';
import { parseCategories, formatCategories } from '../../fleet/pipelineHistory.esm.js';
import { useFleetReleaseRecords, useFleetReleaseEvents } from '../../fleet/useFleetReleases.esm.js';
import { usePolled, isStale } from '../../fleet/usePolled.esm.js';
import { ProvisioningStrip } from '../../provisioning/ProvisioningStrip.esm.js';
import { useNow, toItems } from '../../provisioning/shared.esm.js';
import { useProvisioning } from '../../provisioning/useProvisioning.esm.js';
import { useFleetEnvironments } from '../../useFleetEnvironments.esm.js';
import { useFleetRoster } from '../../useFleetRoster.esm.js';
import { useFleetSlos } from '../../useFleetSlos.esm.js';
import { ActivityPanel, DoraPanel, DeploymentsPanel, PipelinesPanel, AttentionPanel, FitContext } from './opswall/panels.esm.js';
import { useOpsStyles } from './opswall/styles.esm.js';

const WINDOWS = { "24h": 24 * 36e5, "7d": 7 * 24 * 36e5 };
const isOpsWindow = (v) => v !== null && v in WINDOWS;
const ACTIVITY_POLL_MS = 3e4;
function appNamesOf(e) {
  const slugRepo = e.metadata.annotations?.["github.com/project-slug"]?.split("/")[1];
  return [...new Set([e.metadata.name, slugRepo].filter((n) => Boolean(n)))];
}
function sourceState(p, now) {
  if (p.updatedAt === void 0) return p.failures > 0 ? "down" : "loading";
  return isStale(p, now) ? "stale" : "ok";
}
function sourceColor(t, s) {
  if (s === "ok") return t.good;
  if (s === "stale") return t.amber;
  if (s === "down") return t.bad;
  return t.textFaint;
}
function staleNote(p, now) {
  if (!isStale(p, now)) return void 0;
  if (p.updatedAt === void 0) return `not loading: ${p.error ?? "unknown error"}`;
  return `stale since ${new Date(p.updatedAt).toLocaleTimeString()}`;
}
const every = (ms) => ms >= 6e4 ? `${Math.round(ms / 6e4)} min` : `${Math.round(ms / 1e3)}s`;
function ago(now, at) {
  const sec = Math.max(0, Math.round((now - at) / 1e3));
  return sec < 120 ? `${sec}s` : `${Math.round(sec / 60)}m`;
}
function useWidth() {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return void 0;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}
function columnCount(width) {
  if (width === 0 || width >= 1500) return 3;
  return width >= 1e3 ? 2 : 1;
}
function OpsWallDashboard({ fit = false }) {
  const t = useHangarTokens();
  const c = useOpsStyles({ t });
  const now = useNow(1e3);
  const [rootRef, width] = useWidth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const setParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(key, value);
      else next.delete(key);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );
  const windowParam = searchParams.get("window");
  const opsWindow = isOpsWindow(windowParam) ? windowParam : "24h";
  const doraParam = Number(searchParams.get("dora"));
  const doraWindow = isDoraWindow(doraParam) ? doraParam : DEFAULT_DORA_WINDOW;
  const owner = searchParams.get("owner") ?? void 0;
  const categoriesParam = searchParams.get("pipelines");
  const categories = useMemo(() => parseCategories(categoriesParam), [categoriesParam]);
  const toggleCategory = (cat) => {
    const next = new Set(categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setParam("pipelines", formatCategories(next) ?? void 0);
  };
  const roster = useFleetRoster("services");
  const k8sEntities = useMemo(() => roster.entities.filter(isKubernetesAvailable), [roster.entities]);
  const { apps, probes } = useFleetEnvironments(k8sEntities);
  const clusters = useMemo(() => [...new Set(apps.flatMap((a) => a.environments.map((e) => e.cluster)))], [apps]);
  const { summary: sloSummary, slos, probes: sloProbes } = useFleetSlos(clusters);
  const owners = useMemo(
    () => [...new Set(roster.entities.map((e) => e.spec?.owner).filter((o) => typeof o === "string"))].sort(),
    [roster.entities]
  );
  const refByApp = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    roster.entities.forEach((e) => appNamesOf(e).forEach((n2) => m.set(n2, stringifyEntityRef(e))));
    return m;
  }, [roster.entities]);
  const appFilter = useMemo(() => {
    if (!owner) return void 0;
    return new Set(roster.entities.filter((e) => e.spec?.owner === owner).flatMap(appNamesOf));
  }, [owner, roster.entities]);
  const towerHref = useCallback(
    (app, tab, params) => {
      const ref = refByApp.get(app);
      if (!ref) return void 0;
      const q = new URLSearchParams({ entity: ref, tab, ...params });
      return `${location.pathname}?${q.toString()}`;
    },
    [refByApp, location.pathname]
  );
  const runs = useFleetPipelineRuns();
  const history = useFleetPipelineHistory(WINDOWS[opsWindow]);
  const records = useFleetReleaseRecords();
  const events = useFleetReleaseEvents();
  const dora = useDoraMetrics(doraWindow, appFilter ? [...appFilter] : void 0);
  const notificationsApi = useApi(notificationsApiRef);
  const fetchActivity = useCallback(
    () => notificationsApi.getNotifications({ limit: 40, sort: "created", sortOrder: "desc" }).then((res) => res.notifications),
    [notificationsApi]
  );
  const activity = usePolled("ops-activity", fetchActivity, ACTIVITY_POLL_MS);
  const provisioning = useProvisioning();
  const provItems = useMemo(() => toItems(provisioning.items, now), [provisioning.items, now]);
  const provSignals = useMemo(
    () => provItems.map((i) => ({
      name: i.inputs.xr.name,
      failed: i.derived.failed,
      stalled: i.derived.stalled,
      since: new Date(i.inputs.xr.createdAt).toISOString()
    })),
    [provItems]
  );
  const provInFlight = useMemo(
    () => provItems.filter((i) => !i.derived.stalled && (!appFilter || appFilter.has(i.inputs.xr.name))),
    [provItems, appFilter]
  );
  const model = useMemo(
    () => buildOpsWallModel({
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
      appFilter
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
      appFilter
    ]
  );
  const activityItems = useMemo(() => {
    const list = activity.data ?? [];
    if (!appFilter) return list;
    const names = [...appFilter];
    return list.filter((n2) => names.some((a) => `${n2.payload.title} ${n2.payload.description ?? ""}`.includes(a)));
  }, [activity.data, appFilter]);
  if (roster.loading) return /* @__PURE__ */ jsx(Progress, {});
  const k = model.kpis;
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const sloPct = sloSummary.total ? Math.round(sloSummary.meetingObjective / sloSummary.total * 100) : void 0;
  const cfr = dora.data?.changeFailureRate;
  const polledSource = (label, p, what) => {
    const state = sourceState(p, now);
    return {
      label,
      state,
      // The age only shows when it matters: a source behind schedule or failing.
      badge: state === "stale" && p.updatedAt !== void 0 ? ago(now, p.updatedAt) : void 0,
      tip: /* @__PURE__ */ jsxs("div", { className: c.tip, children: [
        /* @__PURE__ */ jsx("div", { className: c.tipTitle, children: label }),
        /* @__PURE__ */ jsx("div", { children: what }),
        /* @__PURE__ */ jsxs("div", { children: [
          "Refreshes every ",
          every(p.intervalMs),
          "."
        ] }),
        /* @__PURE__ */ jsx("div", { children: p.updatedAt !== void 0 ? `Last updated ${new Date(p.updatedAt).toLocaleTimeString()} (${ago(now, p.updatedAt)} ago).` : "Not loaded yet." }),
        p.failures > 0 && p.error && /* @__PURE__ */ jsxs("div", { className: c.tipError, children: [
          "Last ",
          p.failures,
          " ",
          p.failures === 1 ? "poll" : "polls",
          " failed: ",
          p.error
        ] })
      ] })
    };
  };
  const sources = [
    polledSource(
      "Pipelines",
      runs,
      "Running and recent Tekton PipelineRuns on kind-dev (finished runs are archived after about an hour)."
    ),
    polledSource("History", history, `Finished runs for the last ${opsWindow}, from the Tekton Results archive.`),
    polledSource(
      "Releases",
      records,
      "Glidepath's release records (upper-environment releases and their state) on kind-dev."
    ),
    polledSource(
      "Release alerts",
      events,
      "ReleaseStalled and ReleaseDrift events Glidepath raises on its release records."
    ),
    {
      label: "Environments",
      state: apps.length < k8sEntities.length ? "loading" : "ok",
      badge: apps.length < k8sEntities.length ? `${apps.length}/${k8sEntities.length}` : void 0,
      tip: /* @__PURE__ */ jsxs("div", { className: c.tip, children: [
        /* @__PURE__ */ jsx("div", { className: c.tipTitle, children: "Environments" }),
        /* @__PURE__ */ jsx("div", { children: "Live Kubernetes and Argo CD state of every service, read per service as it streams in." }),
        /* @__PURE__ */ jsxs("div", { children: [
          apps.length,
          " of ",
          k8sEntities.length,
          " services have reported."
        ] })
      ] })
    },
    {
      label: "SLOs",
      state: sloSummary.loading ? "loading" : "ok",
      tip: /* @__PURE__ */ jsxs("div", { className: c.tip, children: [
        /* @__PURE__ */ jsx("div", { className: c.tipTitle, children: "SLOs" }),
        /* @__PURE__ */ jsx("div", { children: "Sloth SLO burn rates from each cluster's Prometheus." })
      ] })
    },
    polledSource("DORA", dora, `dora-exporter metrics via ${dora.source.service} on ${dora.source.cluster}.`),
    polledSource("Activity", activity, "Backstage notifications: builds, deploys, config changes, SLO transitions.")
  ];
  const kpis = [
    {
      id: "ops-pipelines",
      label: "Pipelines running",
      value: String(k.pipelinesRunning),
      sub: [k.pipelinesQueued ? `${k.pipelinesQueued} queued` : "", k.slowRuns ? `${k.slowRuns} slow` : ""].filter(Boolean).join(" \xB7 "),
      color: k.slowRuns ? t.amber : t.sky,
      hint: "Pipelines running now, of the types selected in the Pipelines panel."
    },
    {
      id: "ops-deployments",
      label: "Deploying now",
      value: String(k.deploying),
      sub: [k.canaries ? `${k.canaries} mid-canary` : "", k.pausedRollouts ? `${k.pausedRollouts} paused` : ""].filter(Boolean).join(" \xB7 "),
      color: t.sky,
      hint: "Releases being applied, deploy pipelines running, and rollouts in progress."
    },
    {
      id: "ops-approvals",
      label: "Awaiting approval",
      value: String(k.awaitingApproval),
      sub: k.oldestApprovalSince ? `oldest ${Math.max(0, Math.floor((now - Date.parse(k.oldestApprovalSince)) / 36e5))}h` : "",
      color: k.awaitingApproval ? t.amber : t.good,
      hint: "Release PRs to upper environments that are open and not yet merged."
    },
    {
      id: "ops-attention",
      label: "Envs failing",
      value: String(k.envsFailing),
      sub: `of ${k.envsTotal}${k.outOfSync ? ` \xB7 ${k.outOfSync} out of sync` : ""}`,
      color: k.envsFailing ? t.bad : t.good,
      hint: "Environments whose Rollout or Argo CD health is Degraded."
    },
    {
      id: "ops-attention",
      label: "SLO compliance",
      value: sloPct === void 0 ? "\u2014" : `${sloPct}%`,
      sub: sloSummary.total ? `${sloSummary.total - sloSummary.meetingObjective} of ${sloSummary.total} breaching` : "no SLOs",
      color: sloPct !== void 0 && sloPct < 100 ? t.amber : t.good,
      hint: "SLOs within their error budget over the full compliance period."
    },
    {
      id: "ops-dora",
      label: "Change failure rate",
      value: cfr === void 0 ? "\u2014" : `${Math.round(cfr * 100)}%`,
      sub: `last ${doraWindow} days`,
      color: cfr !== void 0 && cfr >= 0.15 ? t.amber : t.good,
      hint: "Failed upper-environment releases as a share of all of them (DORA)."
    }
  ];
  const panels = {
    attention: /* @__PURE__ */ jsx(
      AttentionPanel,
      {
        items: model.attention,
        now,
        limit: 14,
        stale: staleNote(records, now) ?? staleNote(runs, now)
      },
      "attention"
    ),
    pipelines: /* @__PURE__ */ jsx(
      PipelinesPanel,
      {
        items: model.pipelines,
        recent: model.recentRuns,
        stats: model.pipelineStats,
        counts: model.pipelineCounts,
        categories,
        onToggleCategory: toggleCategory,
        towerHref,
        now,
        windowLabel: opsWindow,
        limit: 6,
        stale: staleNote(runs, now),
        historyNote: history.updatedAt === void 0 && history.failures > 0 ? `Run archive unavailable (${history.error}); history covers the last hour only.` : void 0
      },
      "pipelines"
    ),
    deployments: /* @__PURE__ */ jsx(
      DeploymentsPanel,
      {
        items: model.deployments,
        approvals: model.approvals,
        landed: model.landed,
        now,
        windowLabel: opsWindow,
        limit: 6,
        stale: staleNote(records, now)
      },
      "deployments"
    ),
    dora: /* @__PURE__ */ jsx(
      DoraPanel,
      {
        snapshot: dora.data,
        error: dora.error,
        loading: dora.loading,
        stale: dora.data ? staleNote(dora, now) : void 0,
        sourceLabel: `${dora.source.service} on ${dora.source.cluster}`,
        windowDays: doraWindow,
        windows: DORA_WINDOWS,
        onWindow: (d) => setParam("dora", d === DEFAULT_DORA_WINDOW ? void 0 : String(d))
      },
      "dora"
    ),
    activity: /* @__PURE__ */ jsx(
      ActivityPanel,
      {
        items: activityItems,
        now,
        limit: 12,
        stale: staleNote(activity, now),
        error: activity.error
      },
      "activity"
    )
  };
  const n = columnCount(width);
  let columns;
  if (n === 3) {
    columns = [[panels.attention, panels.activity], [panels.pipelines], [panels.deployments, panels.dora]];
  } else if (n === 2) {
    columns = [
      [panels.attention, panels.pipelines, panels.activity],
      [panels.deployments, panels.dora]
    ];
  } else {
    columns = [[panels.attention, panels.pipelines, panels.deployments, panels.dora, panels.activity]];
  }
  return /* @__PURE__ */ jsxs("div", { className: fit ? `${c.root} ${c.rootFit}` : c.root, ref: rootRef, children: [
    probes,
    sloProbes,
    /* @__PURE__ */ jsxs("div", { className: c.toolbar, children: [
      /* @__PURE__ */ jsxs("span", { className: c.toolGroup, children: [
        /* @__PURE__ */ jsx("label", { className: c.toolLabel, htmlFor: "ops-owner", children: "Team" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            id: "ops-owner",
            className: c.select,
            value: owner ?? "",
            onChange: (e) => setParam("owner", e.target.value || void 0),
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "All teams" }),
              owners.map((o) => /* @__PURE__ */ jsx("option", { value: o, children: o }, o))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("span", { className: c.toolGroup, children: [
        /* @__PURE__ */ jsx("label", { className: c.toolLabel, htmlFor: "ops-window", children: "Window" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            id: "ops-window",
            className: c.select,
            value: opsWindow,
            onChange: (e) => setParam("window", e.target.value === "24h" ? void 0 : e.target.value),
            children: [
              /* @__PURE__ */ jsx("option", { value: "24h", children: "Last 24 hours" }),
              /* @__PURE__ */ jsx("option", { value: "7d", children: "Last 7 days" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: c.sources, "aria-label": "Data sources", children: [
        /* @__PURE__ */ jsx("span", { className: c.sourcesLabel, children: "Sources" }),
        sources.map((src) => /* @__PURE__ */ jsx(Tooltip, { title: src.tip, arrow: true, children: /* @__PURE__ */ jsxs("span", { className: c.source, tabIndex: 0, children: [
          /* @__PURE__ */ jsx("i", { className: c.dot, style: { backgroundColor: sourceColor(t, src.state) } }),
          src.label,
          src.badge && /* @__PURE__ */ jsx("span", { className: c.sourceAge, style: { color: sourceColor(t, src.state) }, children: src.badge })
        ] }) }, src.label))
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: c.kpis, children: kpis.map((kpi) => /* @__PURE__ */ jsx(Tooltip, { title: /* @__PURE__ */ jsx("div", { className: c.tip, children: kpi.hint }), arrow: true, enterDelay: 600, children: /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        className: c.kpi,
        style: { borderTopColor: kpi.color },
        onClick: () => scrollTo(kpi.id),
        children: [
          /* @__PURE__ */ jsx("div", { className: c.kpiLabel, children: kpi.label }),
          /* @__PURE__ */ jsx("div", { className: c.kpiValue, style: { color: kpi.color }, children: kpi.value }),
          /* @__PURE__ */ jsx("div", { className: c.kpiSub, children: kpi.sub })
        ]
      }
    ) }, kpi.label)) }),
    /* @__PURE__ */ jsx(
      ProvisioningStrip,
      {
        items: provInFlight,
        onOpen: (name) => window.open(`${location.pathname}?view=provisioning&service=${encodeURIComponent(name)}`, "_blank")
      }
    ),
    /* @__PURE__ */ jsx(FitContext.Provider, { value: fit, children: /* @__PURE__ */ jsx(
      "div",
      {
        className: fit ? `${c.columns} ${c.columnsFit}` : c.columns,
        style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` },
        children: columns.map((col, i) => /* @__PURE__ */ jsx("div", { className: fit ? `${c.column} ${c.columnFit}` : c.column, children: col }, i))
      }
    ) })
  ] });
}

export { OpsWallDashboard };
//# sourceMappingURL=OpsWallDashboard.esm.js.map
