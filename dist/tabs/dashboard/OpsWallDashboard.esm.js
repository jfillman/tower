import { jsx, jsxs } from 'react/jsx-runtime';
import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { isKubernetesAvailable } from '@backstage/plugin-kubernetes';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { Progress } from '@backstage/core-components';
import { useHangarTokens } from '../../brand/tokens.esm.js';
import { DEFAULT_DORA_WINDOW, DORA_WINDOWS, isDoraWindow } from '../../fleet/dora.esm.js';
import { buildOpsWallModel } from '../../fleet/opsWallModel.esm.js';
import { useDoraMetrics } from '../../fleet/useDoraMetrics.esm.js';
import { useFleetPipelineRuns } from '../../fleet/useFleetPipelineRuns.esm.js';
import { useFleetReleaseRecords, useFleetReleaseEvents } from '../../fleet/useFleetReleases.esm.js';
import { usePolled, isStale } from '../../fleet/usePolled.esm.js';
import { ProvisioningStrip } from '../../provisioning/ProvisioningStrip.esm.js';
import { useNow, toItems } from '../../provisioning/shared.esm.js';
import { useProvisioning } from '../../provisioning/useProvisioning.esm.js';
import { useFleetEnvironments } from '../../useFleetEnvironments.esm.js';
import { useFleetRoster } from '../../useFleetRoster.esm.js';
import { useFleetSlos } from '../../useFleetSlos.esm.js';
import { AttentionPanel, PipelinesPanel, DeploymentsPanel, DoraPanel, ActivityPanel } from './opswall/panels.esm.js';
import { useOpsStyles } from './opswall/styles.esm.js';

const WINDOWS = { "24h": 24 * 36e5, "7d": 7 * 24 * 36e5 };
const isOpsWindow = (v) => v !== null && v in WINDOWS;
const ACTIVITY_POLL_MS = 3e4;
function appNamesOf(e) {
  const slugRepo = e.metadata.annotations?.["github.com/project-slug"]?.split("/")[1];
  return [...new Set([e.metadata.name, slugRepo].filter((n) => Boolean(n)))];
}
function sourceState(p) {
  if (p.updatedAt === void 0) return p.failures > 0 ? "down" : "loading";
  return isStale(p) ? "stale" : "ok";
}
function sourceColor(t, s) {
  if (s === "ok") return t.good;
  if (s === "stale") return t.amber;
  if (s === "down") return t.bad;
  return t.textFaint;
}
function staleNote(p) {
  if (!isStale(p)) return void 0;
  if (p.updatedAt === void 0) return `not loading: ${p.error ?? "unknown error"}`;
  return `stale since ${new Date(p.updatedAt).toLocaleTimeString()}`;
}
function OpsWallDashboard() {
  const t = useHangarTokens();
  const c = useOpsStyles({ t });
  const now = useNow(1e3);
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
    roster.entities.forEach((e) => appNamesOf(e).forEach((n) => m.set(n, stringifyEntityRef(e))));
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
      records: records.data ?? [],
      events: events.data ?? [],
      slos,
      provisioning: provSignals,
      towerHref,
      appFilter
    }),
    [now, opsWindow, apps, runs.data, records.data, events.data, slos, provSignals, towerHref, appFilter]
  );
  const activityItems = useMemo(() => {
    const list = activity.data ?? [];
    if (!appFilter) return list;
    const names = [...appFilter];
    return list.filter((n) => names.some((a) => `${n.payload.title} ${n.payload.description ?? ""}`.includes(a)));
  }, [activity.data, appFilter]);
  if (roster.loading) return /* @__PURE__ */ jsx(Progress, {});
  const k = model.kpis;
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const sloPct = sloSummary.total ? Math.round(sloSummary.meetingObjective / sloSummary.total * 100) : void 0;
  const cfr = dora.data?.changeFailureRate;
  const sources = [
    { label: "Pipelines", state: sourceState(runs), at: runs.updatedAt, title: runs.error },
    { label: "Releases", state: sourceState(records), at: records.updatedAt, title: records.error },
    { label: "Release alerts", state: sourceState(events), at: events.updatedAt, title: events.error },
    {
      label: `Environments ${apps.length}/${k8sEntities.length}`,
      state: apps.length < k8sEntities.length ? "loading" : "ok"
    },
    { label: "SLOs", state: sloSummary.loading ? "loading" : "ok" },
    {
      label: "DORA",
      state: sourceState(dora),
      at: dora.updatedAt,
      title: dora.error ?? `${dora.source.service} on ${dora.source.cluster}`
    },
    { label: "Activity", state: sourceState(activity), at: activity.updatedAt, title: activity.error }
  ];
  const kpis = [
    {
      id: "ops-pipelines",
      label: "Pipelines running",
      value: String(k.pipelinesRunning),
      sub: [k.pipelinesQueued ? `${k.pipelinesQueued} queued` : "", k.slowRuns ? `${k.slowRuns} slow` : ""].filter(Boolean).join(" \xB7 "),
      color: k.slowRuns ? t.amber : t.sky
    },
    {
      id: "ops-deployments",
      label: "Deploying now",
      value: String(k.deploying),
      sub: [k.canaries ? `${k.canaries} mid-canary` : "", k.pausedRollouts ? `${k.pausedRollouts} paused` : ""].filter(Boolean).join(" \xB7 "),
      color: t.sky
    },
    {
      id: "ops-approvals",
      label: "Awaiting approval",
      value: String(k.awaitingApproval),
      sub: k.oldestApprovalSince ? `oldest ${Math.max(0, Math.floor((now - Date.parse(k.oldestApprovalSince)) / 36e5))}h` : "",
      color: k.awaitingApproval ? t.amber : t.good
    },
    {
      id: "ops-attention",
      label: "Envs failing",
      value: String(k.envsFailing),
      sub: `of ${k.envsTotal}${k.outOfSync ? ` \xB7 ${k.outOfSync} out of sync` : ""}`,
      color: k.envsFailing ? t.bad : t.good
    },
    {
      id: "ops-attention",
      label: "SLO compliance",
      value: sloPct === void 0 ? "\u2014" : `${sloPct}%`,
      sub: sloSummary.total ? `${sloSummary.total - sloSummary.meetingObjective} of ${sloSummary.total} breaching` : "no SLOs",
      color: sloPct !== void 0 && sloPct < 100 ? t.amber : t.good
    },
    {
      id: "ops-dora",
      label: "Change failure rate",
      value: cfr === void 0 ? "\u2014" : `${Math.round(cfr * 100)}%`,
      sub: `last ${doraWindow} days`,
      color: cfr !== void 0 && cfr >= 0.15 ? t.amber : t.good
    }
  ];
  return /* @__PURE__ */ jsxs("div", { className: c.root, children: [
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
      /* @__PURE__ */ jsx("div", { className: c.sources, "aria-label": "Data sources", children: sources.map((s) => /* @__PURE__ */ jsxs("span", { className: c.source, title: s.title, children: [
        /* @__PURE__ */ jsx("i", { className: c.dot, style: { backgroundColor: sourceColor(t, s.state) } }),
        s.label,
        s.at !== void 0 && /* @__PURE__ */ jsxs("span", { className: c.sourceAge, children: [
          Math.max(0, Math.round((now - s.at) / 1e3)),
          "s"
        ] })
      ] }, s.label)) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: c.kpis, children: kpis.map((kpi) => /* @__PURE__ */ jsxs(
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
      },
      kpi.label
    )) }),
    /* @__PURE__ */ jsx(
      ProvisioningStrip,
      {
        items: provInFlight,
        onOpen: (name) => window.open(`${location.pathname}?view=provisioning&service=${encodeURIComponent(name)}`, "_blank")
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: c.main, children: [
      /* @__PURE__ */ jsx(AttentionPanel, { items: model.attention, now, limit: 14, stale: staleNote(records) ?? staleNote(runs) }),
      /* @__PURE__ */ jsxs("div", { className: c.column, children: [
        /* @__PURE__ */ jsx(
          PipelinesPanel,
          {
            items: model.pipelines,
            stats: model.pipelineStats,
            windowLabel: opsWindow,
            limit: 6,
            stale: staleNote(runs)
          }
        ),
        /* @__PURE__ */ jsx(
          DeploymentsPanel,
          {
            items: model.deployments,
            approvals: model.approvals,
            landed: model.landed,
            now,
            windowLabel: opsWindow,
            limit: 6,
            stale: staleNote(records)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: c.bottom, children: [
      /* @__PURE__ */ jsx(
        DoraPanel,
        {
          snapshot: dora.data,
          error: dora.error,
          loading: dora.loading,
          stale: dora.data ? staleNote(dora) : void 0,
          sourceLabel: `${dora.source.service} on ${dora.source.cluster}`,
          windowDays: doraWindow,
          windows: DORA_WINDOWS,
          onWindow: (d) => setParam("dora", d === DEFAULT_DORA_WINDOW ? void 0 : String(d))
        }
      ),
      /* @__PURE__ */ jsx(ActivityPanel, { items: activityItems, now, limit: 10, stale: staleNote(activity), error: activity.error })
    ] })
  ] });
}

export { OpsWallDashboard };
//# sourceMappingURL=OpsWallDashboard.esm.js.map
