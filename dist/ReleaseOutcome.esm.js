import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format.esm.js';
import { useHangarTokens } from './brand/tokens.esm.js';
import { RecordColumn } from './RecordColumn.esm.js';
import { OUTCOME_LABEL } from './releaseFlow.esm.js';
import { EmptyNote, FactGrid, Fact, TextLink, Hint, StatusChip } from './ui/index.esm.js';

const DAY = 864e5;
const OUTCOME_TONE = {
  clean: "ok",
  "rolled-back": "bad",
  "replaced-before-healthy": "warn",
  "stopped-before-production": "neutral"
};
function outcomeChip(outcome, now = Date.now()) {
  if (!outcome) return void 0;
  if (outcome.result) return { label: OUTCOME_LABEL[outcome.result], tone: OUTCOME_TONE[outcome.result] };
  if (outcome.healthyAt && outcome.state === "healthy") {
    const day = Math.min(outcome.bakeDays, Math.floor((now - Date.parse(outcome.healthyAt)) / DAY) + 1);
    return { label: `baking \xB7 day ${day} of ${outcome.bakeDays}`, tone: "info" };
  }
  return { label: outcome.state.replace(/-/g, " "), tone: "info" };
}
function toneColour(t, tone) {
  if (tone === "ok") return t.good;
  if (tone === "bad") return t.bad;
  if (tone === "warn") return t.amber;
  if (tone === "info") return t.sky;
  return t.textFaint;
}
const useStyles = makeStyles(() => ({
  line: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, fontSize: 12 }
}));
function ReleaseOutcomePanel({
  outcome,
  names,
  githubRelease
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const chip = outcomeChip(outcome);
  const label = (tag) => tag ? `${names?.get(tag) ? `${names.get(tag)} \xB7 ` : ""}${tag}` : void 0;
  let closedBy;
  if (outcome?.closedBy === "superseded") closedBy = `Replaced by ${label(outcome.supersededBy) ?? "a newer release"}`;
  else if (outcome?.closedBy === "rolled-back") closedBy = `Rolled back to ${label(outcome.rolledBackBy) ?? "an earlier release"}`;
  else if (outcome?.closedBy === "bake-complete") closedBy = `Healthy for the whole ${outcome.bakeDays}-day bake window`;
  else if (outcome?.closedBy === "moved-on") closedBy = `Never reached production; ${outcome.env ?? "its last environment"} moved on`;
  return /* @__PURE__ */ jsxs(
    RecordColumn,
    {
      title: "Outcome",
      strip: chip ? toneColour(t, chip.tone) : t.line,
      meta: chip ? /* @__PURE__ */ jsx(StatusChip, { tone: chip.tone, dot: true, children: chip.label }) : void 0,
      children: [
        !outcome && /* @__PURE__ */ jsx(EmptyNote, { children: "No outcome recorded. Tower writes it back once a release is final; releases older than Glidepath's 14-day tracking window, and cloud targets, have none." }),
        outcome && /* @__PURE__ */ jsxs(FactGrid, { children: [
          closedBy && /* @__PURE__ */ jsx(Fact, { label: "What happened", children: closedBy }),
          outcome.rollbackReason && /* @__PURE__ */ jsx(Fact, { label: "Rollback reason", children: outcome.rollbackReason }),
          outcome.env && /* @__PURE__ */ jsx(Fact, { label: "Decided in", children: outcome.env }),
          outcome.healthyAt && /* @__PURE__ */ jsx(Fact, { label: "Healthy since", children: formatDateTime(outcome.healthyAt) }),
          outcome.closedAt && /* @__PURE__ */ jsx(Fact, { label: "Closed", children: formatDateTime(outcome.closedAt) })
        ] }),
        githubRelease?.url && /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
          "GitHub Release ",
          /* @__PURE__ */ jsx(TextLink, { href: githubRelease.url, children: `${githubRelease.tag ?? "release"} \u2197` })
        ] }),
        githubRelease?.skipped && /* @__PURE__ */ jsx(Hint, { children: `GitHub Release not published: ${githubRelease.skipped}.` }),
        outcome && /* @__PURE__ */ jsx(Hint, { children: "SLO burn during the bake window is not read yet. The production cluster's Prometheus is on and canary analysis uses it, but the outcome is still decided from the rollout alone." })
      ]
    }
  );
}

export { OUTCOME_TONE, ReleaseOutcomePanel, outcomeChip };
//# sourceMappingURL=ReleaseOutcome.esm.js.map
