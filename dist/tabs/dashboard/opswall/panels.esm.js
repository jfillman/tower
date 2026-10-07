import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { useHangarTokens } from '../../../brand/tokens.esm.js';
import { deployFrequencyBand, leadTimeBand, changeFailureBand, restoreBand } from '../../../fleet/dora.esm.js';
import { preventFocusScroll } from '../../../preventFocusScroll.esm.js';
import { fmtAge, severityColor, fmtSeconds, bandColor, useOpsStyles, BAND_LABEL } from './styles.esm.js';

function useKit() {
  const t = useHangarTokens();
  return { t, c: useOpsStyles({ t }) };
}
function OpsPanel({
  id,
  title,
  count,
  meta,
  stale,
  children
}) {
  const { c } = useKit();
  return /* @__PURE__ */ jsxs("section", { id, className: c.panel, "aria-label": title, children: [
    /* @__PURE__ */ jsxs("div", { className: c.panelHead, children: [
      /* @__PURE__ */ jsxs("h2", { className: c.panelTitle, children: [
        title,
        count !== void 0 && /* @__PURE__ */ jsx("span", { className: c.count, children: count })
      ] }),
      stale ? /* @__PURE__ */ jsx("span", { className: c.staleNote, children: stale }) : meta && /* @__PURE__ */ jsx("span", { className: c.panelMeta, children: meta })
    ] }),
    /* @__PURE__ */ jsx("div", { className: stale ? c.stale : void 0, children })
  ] });
}
function Links({ links }) {
  const { c } = useKit();
  if (links.length === 0) return null;
  return /* @__PURE__ */ jsx("span", { className: c.links, children: links.map((l) => (
    // New tab: the wall stays where it is.
    /* @__PURE__ */ jsxs("a", { className: c.link, href: l.href, target: "_blank", rel: "noopener noreferrer", children: [
      l.label,
      l.external ? " \u2197" : ""
    ] }, l.label + l.href)
  )) });
}
function More({ total, shown, label }) {
  const { c } = useKit();
  if (total <= shown) return null;
  return /* @__PURE__ */ jsxs("div", { className: c.more, children: [
    "+",
    total - shown,
    " more",
    label ? ` ${label}` : ""
  ] });
}
function Bar({ value, total, color }) {
  const { c } = useKit();
  const pct2 = total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0;
  return /* @__PURE__ */ jsx("span", { className: c.bar, role: "img", "aria-label": `${value} of ${total}`, children: /* @__PURE__ */ jsx("span", { className: c.barFill, style: { width: `${pct2}%`, backgroundColor: color } }) });
}
function Empty({ children }) {
  const { c } = useKit();
  return /* @__PURE__ */ jsx("div", { className: c.empty, children });
}
function AttentionPanel({
  items,
  now,
  limit,
  stale
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  const critical = items.filter((i) => i.severity === "critical").length;
  return /* @__PURE__ */ jsxs(
    OpsPanel,
    {
      id: "ops-attention",
      title: "Needs attention",
      count: items.length,
      meta: critical > 0 ? `${critical} critical` : void 0,
      stale,
      children: [
        shown.length === 0 ? /* @__PURE__ */ jsx(Empty, { children: "Nothing needs a human right now." }) : shown.map((i) => /* @__PURE__ */ jsxs("div", { className: c.row, style: { borderLeftColor: severityColor(t, i.severity) }, children: [
          /* @__PURE__ */ jsxs("div", { className: c.rowMain, children: [
            /* @__PURE__ */ jsxs("div", { className: c.rowTop, children: [
              /* @__PURE__ */ jsx("span", { className: c.app, children: i.app }),
              i.env && /* @__PURE__ */ jsx("span", { className: c.envTag, children: i.env }),
              /* @__PURE__ */ jsx("span", { className: c.rowTitle, children: i.title })
            ] }),
            i.detail && /* @__PURE__ */ jsx("div", { className: c.rowDetail, title: i.detail, children: i.detail })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: c.rowSide, children: [
            i.since && /* @__PURE__ */ jsx("span", { className: c.age, children: fmtAge(now, i.since) }),
            /* @__PURE__ */ jsx(Links, { links: i.links })
          ] })
        ] }, i.id)),
        /* @__PURE__ */ jsx(More, { total: items.length, shown: shown.length })
      ]
    }
  );
}
function PipelinesPanel({
  items,
  stats,
  windowLabel,
  limit,
  stale
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  return /* @__PURE__ */ jsxs(
    OpsPanel,
    {
      id: "ops-pipelines",
      title: "Pipelines in flight",
      count: items.length,
      meta: `last ${windowLabel}: ${stats.runs} done \xB7 ${stats.failedRuns} failed${stats.p50Sec !== void 0 ? ` \xB7 p50 ${fmtSeconds(stats.p50Sec)}` : ""}`,
      stale,
      children: [
        shown.length === 0 ? /* @__PURE__ */ jsx(Empty, { children: "No pipelines running." }) : shown.map((p) => {
          let barColor = t.sky;
          if (p.slow || p.queuedLong) barColor = t.amber;
          if ((p.progress?.failed ?? 0) > 0) barColor = t.bad;
          return /* @__PURE__ */ jsxs("div", { className: c.row, style: { borderLeftColor: p.slow ? t.amber : "transparent" }, children: [
            /* @__PURE__ */ jsxs("div", { className: c.rowMain, children: [
              /* @__PURE__ */ jsxs("div", { className: c.rowTop, children: [
                /* @__PURE__ */ jsx("span", { className: c.app, children: p.app }),
                /* @__PURE__ */ jsx("span", { className: c.envTag, children: p.pipeline }),
                p.phase === "pending" && /* @__PURE__ */ jsx("span", { className: c.mono, children: "queued" }),
                p.slow && /* @__PURE__ */ jsx("span", { className: c.staleNote, children: "slow" })
              ] }),
              /* @__PURE__ */ jsx("div", { className: c.rowDetail, title: p.title, children: [p.title, p.sha, p.author && `@${p.author}`, p.prNumber && `PR #${p.prNumber}`].filter(Boolean).join(" \xB7 ") })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: c.rowSide, children: [
              p.progress && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Bar, { value: p.progress.done, total: p.progress.total, color: barColor }),
                /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
                  p.progress.done,
                  "/",
                  p.progress.total
                ] })
              ] }),
              /* @__PURE__ */ jsxs("span", { className: c.age, children: [
                fmtSeconds(p.elapsedSec),
                p.typicalSec !== void 0 ? ` / ~${fmtSeconds(p.typicalSec)}` : ""
              ] }),
              /* @__PURE__ */ jsx(Links, { links: p.links })
            ] })
          ] }, p.key);
        }),
        /* @__PURE__ */ jsx(More, { total: items.length, shown: shown.length })
      ]
    }
  );
}
const KIND_LABEL = {
  release: "release",
  ground: "deploy",
  cloud: "cloud deploy",
  rollout: "rollout"
};
function toneColors(t, tone) {
  if (tone === "bad") return { color: t.bad, backgroundColor: t.badSoft };
  if (tone === "paused") return { color: t.amberInk, backgroundColor: t.amberSoft };
  return { color: t.sky, backgroundColor: t.skySoft };
}
function DeploymentsPanel({
  items,
  approvals,
  landed,
  now,
  windowLabel,
  limit,
  stale
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  const landedShown = landed.slice(0, 4);
  return /* @__PURE__ */ jsxs(OpsPanel, { id: "ops-deployments", title: "Deployments in flight", count: items.length, stale, children: [
    shown.length === 0 ? /* @__PURE__ */ jsx(Empty, { children: "Nothing deploying." }) : shown.map((d) => {
      const canary = d.canary?.weight !== void 0 && d.canary.weight < 100 ? d.canary : void 0;
      return /* @__PURE__ */ jsxs("div", { className: c.row, children: [
        /* @__PURE__ */ jsxs("div", { className: c.rowMain, children: [
          /* @__PURE__ */ jsxs("div", { className: c.rowTop, children: [
            /* @__PURE__ */ jsx("span", { className: c.app, children: d.app }),
            /* @__PURE__ */ jsx("span", { className: c.envTag, children: d.env }),
            /* @__PURE__ */ jsx("span", { className: c.mono, children: [KIND_LABEL[d.kind], d.target, d.cluster].filter(Boolean).join(" \xB7 ") })
          ] }),
          d.detail && /* @__PURE__ */ jsx("div", { className: c.rowDetail, title: d.detail, children: d.detail })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: c.rowSide, children: [
          canary && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Bar, { value: canary.weight ?? 0, total: 100, color: t.amber }),
            /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
              canary.weight,
              "%",
              canary.step !== void 0 && canary.steps ? ` \xB7 ${canary.step + 1}/${canary.steps}` : ""
            ] })
          ] }),
          !canary && d.progress && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(Bar, { value: d.progress.done, total: d.progress.total, color: t.sky }),
            /* @__PURE__ */ jsxs("span", { className: c.mono, children: [
              d.progress.done,
              "/",
              d.progress.total
            ] })
          ] }),
          /* @__PURE__ */ jsx("span", { className: c.stateChip, style: toneColors(t, d.tone), children: d.state }),
          d.startedAt && /* @__PURE__ */ jsx("span", { className: c.age, children: fmtAge(now, d.startedAt) }),
          /* @__PURE__ */ jsx(Links, { links: d.links })
        ] })
      ] }, d.key);
    }),
    /* @__PURE__ */ jsx(More, { total: items.length, shown: shown.length }),
    approvals.length > 0 && /* @__PURE__ */ jsxs("div", { id: "ops-approvals", children: [
      /* @__PURE__ */ jsxs("div", { className: c.subhead, children: [
        "Waiting for approval (",
        approvals.length,
        ")"
      ] }),
      approvals.slice(0, 3).map((a) => /* @__PURE__ */ jsxs("div", { className: c.row, children: [
        /* @__PURE__ */ jsx("div", { className: c.rowMain, children: /* @__PURE__ */ jsxs("div", { className: c.rowTop, children: [
          /* @__PURE__ */ jsx("span", { className: c.app, children: a.app }),
          /* @__PURE__ */ jsx("span", { className: c.envTag, children: a.env }),
          /* @__PURE__ */ jsx("span", { className: c.mono, children: "release PR open" })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: c.rowSide, children: [
          /* @__PURE__ */ jsx("span", { className: c.age, children: fmtAge(now, a.since) }),
          /* @__PURE__ */ jsx(Links, { links: a.prUrl ? [{ label: "PR", href: a.prUrl, external: true }] : [] })
        ] })
      ] }, a.key)),
      /* @__PURE__ */ jsx(More, { total: approvals.length, shown: Math.min(3, approvals.length) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: c.subhead, children: [
      "Landed, last ",
      windowLabel,
      " (",
      landed.length,
      ")"
    ] }),
    landedShown.length === 0 ? /* @__PURE__ */ jsx(Empty, { children: "No deploys finished in this window." }) : landedShown.map((l) => /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      /* @__PURE__ */ jsx("div", { className: c.rowMain, children: /* @__PURE__ */ jsxs("div", { className: c.rowTop, children: [
        /* @__PURE__ */ jsx("span", { style: { color: l.ok ? t.good : t.bad }, "aria-label": l.ok ? "succeeded" : "failed", children: l.ok ? "\u2713" : "\u2717" }),
        /* @__PURE__ */ jsx("span", { className: c.app, children: l.app }),
        /* @__PURE__ */ jsx("span", { className: c.envTag, children: l.env }),
        /* @__PURE__ */ jsx("span", { className: c.mono, children: [KIND_LABEL[l.kind], l.cluster].filter(Boolean).join(" \xB7 ") })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: c.rowSide, children: [
        /* @__PURE__ */ jsxs("span", { className: c.age, children: [
          fmtAge(now, l.at),
          " ago"
        ] }),
        /* @__PURE__ */ jsx(Links, { links: l.links })
      ] })
    ] }, l.key)),
    /* @__PURE__ */ jsx(More, { total: landed.length, shown: landedShown.length })
  ] });
}
function Sparkline({ points, color }) {
  if (points.length < 2) return null;
  const w = 90;
  const h = 18;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${(i * step).toFixed(1)},${(h - p.value / max * (h - 2) - 1).toFixed(1)}`).join(" ");
  return /* @__PURE__ */ jsx("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, "aria-hidden": "true", children: /* @__PURE__ */ jsx("polyline", { points: d, fill: "none", stroke: color, strokeWidth: 1.5, strokeLinejoin: "round" }) });
}
function Trend({ now, before, lowerIsBetter }) {
  const { t, c } = useKit();
  if (now === void 0 || before === void 0 || before === now) return null;
  const up = now > before;
  const good = lowerIsBetter ? !up : up;
  return /* @__PURE__ */ jsx("span", { className: c.mono, style: { color: good ? t.good : t.bad }, title: "vs the previous window", children: up ? "\u25B2" : "\u25BC" });
}
function DoraTile({
  label,
  value,
  unit,
  band,
  spark,
  trend,
  note
}) {
  const { t, c } = useKit();
  return /* @__PURE__ */ jsxs("div", { className: c.doraTile, children: [
    /* @__PURE__ */ jsx("div", { className: c.kpiLabel, children: label }),
    /* @__PURE__ */ jsxs("div", { className: c.doraValue, style: { color: band === "neutral" ? t.textHi : bandColor(t, band) }, children: [
      value,
      unit && /* @__PURE__ */ jsx("span", { className: c.doraUnit, children: unit })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: c.doraFoot, children: [
      BAND_LABEL[band] && /* @__PURE__ */ jsx(
        "span",
        {
          className: c.stateChip,
          style: { color: bandColor(t, band), border: `1px solid ${bandColor(t, band)}` },
          children: BAND_LABEL[band]
        }
      ),
      trend,
      spark,
      note && /* @__PURE__ */ jsx("span", { className: c.mono, children: note })
    ] })
  ] });
}
const pct = (r) => r === void 0 ? "\u2014" : `${Math.round(r * 100)}%`;
function DoraPanel({
  snapshot,
  error,
  loading,
  stale,
  sourceLabel,
  windowDays,
  windows,
  onWindow
}) {
  const { t, c } = useKit();
  const [perApp, setPerApp] = useState(false);
  const controls = /* @__PURE__ */ jsxs("span", { className: c.links, children: [
    windows.map((w) => /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        className: `${c.toggle} ${w === windowDays ? c.toggleOn : ""}`,
        onMouseDown: preventFocusScroll,
        onClick: () => onWindow(w),
        children: [
          w,
          "d"
        ]
      },
      w
    )),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        className: `${c.toggle} ${perApp ? c.toggleOn : ""}`,
        onMouseDown: preventFocusScroll,
        onClick: () => setPerApp((v) => !v),
        children: "per app"
      }
    )
  ] });
  let body;
  if (!snapshot && error) {
    body = /* @__PURE__ */ jsxs(Empty, { children: [
      "DORA metrics are unavailable: ",
      sourceLabel,
      " did not answer (",
      error,
      ")."
    ] });
  } else if (!snapshot) {
    body = /* @__PURE__ */ jsx(Empty, { children: loading ? "Loading DORA metrics\u2026" : "No DORA data." });
  } else {
    const s = snapshot;
    const releasesLabel = s.releases !== void 0 ? `${Math.round(s.failures ?? 0)}/${Math.round(s.releases)} releases` : void 0;
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: c.doraGrid, children: [
        /* @__PURE__ */ jsx(
          DoraTile,
          {
            label: "Deploy frequency",
            value: s.deploysPerDay === void 0 ? "\u2014" : s.deploysPerDay.toFixed(s.deploysPerDay < 10 ? 1 : 0),
            unit: "/ day",
            band: deployFrequencyBand(s.deploysPerDay),
            trend: /* @__PURE__ */ jsx(Trend, { now: s.deploysPerDay, before: s.deploysPerDayPrevious }),
            spark: /* @__PURE__ */ jsx(Sparkline, { points: s.deploysDaily, color: t.sky })
          }
        ),
        /* @__PURE__ */ jsx(
          DoraTile,
          {
            label: "Lead time (p50)",
            value: fmtSeconds(s.leadTimeP50Sec),
            band: leadTimeBand(s.leadTimeP50Sec),
            note: "commit \u2192 live"
          }
        ),
        /* @__PURE__ */ jsx(
          DoraTile,
          {
            label: "Change failure rate",
            value: pct(s.changeFailureRate),
            band: changeFailureBand(s.changeFailureRate),
            trend: /* @__PURE__ */ jsx(Trend, { now: s.changeFailureRate, before: s.changeFailureRatePrevious, lowerIsBetter: true }),
            spark: /* @__PURE__ */ jsx(Sparkline, { points: s.failuresDaily, color: t.bad }),
            note: releasesLabel
          }
        ),
        /* @__PURE__ */ jsx(
          DoraTile,
          {
            label: "Time to restore (p50)",
            value: fmtSeconds(s.restoreP50Sec),
            band: restoreBand(s.restoreP50Sec),
            note: "experimental"
          }
        )
      ] }),
      perApp && (s.apps.length === 0 ? /* @__PURE__ */ jsx(Empty, { children: "No releases in this window." }) : /* @__PURE__ */ jsxs("table", { className: c.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: c.th, children: "App" }),
          /* @__PURE__ */ jsx("th", { className: c.th, children: "Deploys" }),
          /* @__PURE__ */ jsx("th", { className: c.th, children: "/ day" }),
          /* @__PURE__ */ jsx("th", { className: c.th, children: "Lead p50" }),
          /* @__PURE__ */ jsx("th", { className: c.th, children: "Fail rate" }),
          /* @__PURE__ */ jsx("th", { className: c.th, children: "Restore p50" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: s.apps.map((a) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { className: c.td, children: a.app }),
          /* @__PURE__ */ jsx("td", { className: c.td, children: a.deploys }),
          /* @__PURE__ */ jsx("td", { className: c.td, children: (a.deploys / s.windowDays).toFixed(2) }),
          /* @__PURE__ */ jsx("td", { className: c.td, style: { color: bandColor(t, leadTimeBand(a.leadTimeP50Sec)) }, children: fmtSeconds(a.leadTimeP50Sec) }),
          /* @__PURE__ */ jsxs("td", { className: c.td, style: { color: bandColor(t, changeFailureBand(a.changeFailureRate)) }, children: [
            pct(a.changeFailureRate),
            " (",
            a.failures,
            "/",
            a.releases,
            ")"
          ] }),
          /* @__PURE__ */ jsx("td", { className: c.td, children: fmtSeconds(a.restoreP50Sec) })
        ] }, a.app)) })
      ] })),
      /* @__PURE__ */ jsxs("div", { className: c.doraNote, children: [
        "Upper-environment releases recorded by Glidepath. Change failure rate counts failed releases, not production incidents; time to restore is the gap from a failed release to the next good one. Source: ",
        sourceLabel,
        "."
      ] })
    ] });
  }
  return /* @__PURE__ */ jsx(OpsPanel, { id: "ops-dora", title: `DORA \xB7 last ${windowDays} days`, meta: controls, stale, children: body });
}
function ActivityPanel({
  items,
  now,
  limit,
  stale,
  error
}) {
  const { t, c } = useKit();
  const shown = items.slice(0, limit);
  return /* @__PURE__ */ jsx(OpsPanel, { id: "ops-activity", title: "Activity", stale, children: shown.length === 0 ? /* @__PURE__ */ jsx(Empty, { children: error ? `Notifications unavailable (${error}).` : "No recent activity." }) : shown.map((n) => {
    const sev = n.payload.severity;
    let edge = "transparent";
    if (sev === "critical" || sev === "high") edge = t.bad;
    else if (sev === "low") edge = t.line;
    const link = n.payload.link;
    return /* @__PURE__ */ jsxs("div", { className: c.row, style: { borderLeftColor: edge }, children: [
      /* @__PURE__ */ jsxs("div", { className: c.rowMain, children: [
        /* @__PURE__ */ jsx("div", { className: c.rowTitle, children: n.payload.title }),
        n.payload.description && /* @__PURE__ */ jsx("div", { className: c.rowDetail, title: n.payload.description, children: n.payload.description.split("\n")[0] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: c.rowSide, children: [
        /* @__PURE__ */ jsx("span", { className: c.age, children: fmtAge(now, String(n.created)) }),
        link && /* @__PURE__ */ jsx(Links, { links: [{ label: "Open", href: link, external: /^https?:/.test(link) }] })
      ] })
    ] }, n.id);
  }) });
}

export { ActivityPanel, AttentionPanel, DeploymentsPanel, DoraPanel, Links, OpsPanel, PipelinesPanel };
//# sourceMappingURL=panels.esm.js.map
