import { jsxs, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { displayScore } from './useReleaseRecords.esm.js';
import { TextLink, Hint } from './ui/index.esm.js';

const RECENT = 5;
function autolandEligibility(records, signoffEnv) {
  const recent = [...records].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, RECENT);
  const closed = records.filter((r) => r.outcome?.result);
  const rolledBack = closed.filter((r) => r.outcome?.result === "rolled-back").length;
  const items = [];
  const withTests = recent.filter((r) => r.testResults.length > 0).length;
  items.push({
    id: "tests",
    label: "Tests report results",
    state: recent.length > 0 && withTests === recent.length ? "ok" : "todo",
    detail: `${withTests} of the last ${recent.length} releases carry per-test results`
  });
  const prod = recent[0]?.deployments.find((d) => d.env.toLowerCase() === (signoffEnv ?? "").toLowerCase());
  items.push({
    id: "canary",
    label: "Canary rollout in production",
    state: prod?.rolloutStrategy === "canary" ? "ok" : "todo",
    detail: prod?.rolloutStrategy ? `${signoffEnv} rolls out with ${prod.rolloutStrategy}` : `No rollout strategy seen on ${signoffEnv ?? "production"}`
  });
  items.push({
    id: "metrics",
    label: "Production metrics",
    state: "todo",
    detail: "Judging a canary and the bake window needs production metrics; the production cluster's Prometheus is off"
  });
  const cfr = closed.length > 0 ? rolledBack / closed.length : void 0;
  items.push({
    id: "outcomes",
    label: "Clean release history",
    state: closed.length >= RECENT && cfr !== void 0 && cfr < 0.15 ? "ok" : "todo",
    detail: closed.length >= RECENT ? `${rolledBack} of ${closed.length} recorded releases rolled back (${Math.round((cfr ?? 0) * 100)}%, needs under 15%)` : `${closed.length} recorded outcome${closed.length === 1 ? "" : "s"}; needs at least ${RECENT}`
  });
  const avg = recent.length ? Math.round(recent.reduce((n, r) => n + displayScore(r), 0) / recent.length) : 0;
  items.push({
    id: "readiness",
    label: "High readiness",
    state: recent.length > 0 && avg >= 80 ? "ok" : "todo",
    detail: `Average readiness ${avg} over the last ${recent.length} releases (needs 80)`
  });
  return items;
}
const useStyles = makeStyles(() => ({
  wrap: { marginBottom: 12, fontSize: 12.5 },
  list: { display: "flex", flexDirection: "column", gap: 4, marginTop: 6 },
  item: { display: "flex", gap: 8, alignItems: "baseline" },
  mark: { fontFamily: fontMono, width: 14, textAlign: "center" },
  name: { color: ({ t }) => t.textHi },
  detail: { color: ({ t }) => t.textFaint }
}));
function AutolandEligibility({ records, signoffEnv }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [open, setOpen] = useState(false);
  const items = autolandEligibility(records, signoffEnv);
  const ok = items.filter((i) => i.state === "ok").length;
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: `Autoland eligibility \xB7 ${ok} of ${items.length}` }),
    open && /* @__PURE__ */ jsxs("div", { className: classes.list, children: [
      items.map((i) => /* @__PURE__ */ jsxs("div", { className: classes.item, children: [
        /* @__PURE__ */ jsx("span", { className: classes.mark, style: { color: i.state === "ok" ? t.good : t.amberInk }, children: i.state === "ok" ? "\u2713" : "!" }),
        /* @__PURE__ */ jsx("span", { className: classes.name, children: i.label }),
        /* @__PURE__ */ jsx("span", { className: classes.detail, children: i.detail })
      ] }, i.id)),
      /* @__PURE__ */ jsx(Hint, { children: "Autoland is not available yet. This says what this app would need first; it changes nothing today." })
    ] })
  ] });
}

export { AutolandEligibility, autolandEligibility };
//# sourceMappingURL=AutolandEligibility.esm.js.map
