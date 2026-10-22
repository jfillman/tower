import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { StatusChip, Callout, Button, EmptyNote, Tile, Stat } from './ui/index.esm.js';
import { PrRef, prFromSummary } from './ui/PrRef.esm.js';
import { outcomeChip } from './ReleaseOutcome.esm.js';
import { statusPill } from './ReleaseRecordList.esm.js';
import { readinessCount, bakeProgress } from './releaseCards.esm.js';
import { displayScore } from './useReleaseRecords.esm.js';
import { commitProofOf, commitProofChip, commitProofLine } from './commitProof.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  cards: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1.15fr) minmax(0, 0.85fr)",
    gap: 14,
    marginBottom: 18,
    "@media (max-width: 1100px)": { gridTemplateColumns: "minmax(0, 1fr)" }
  },
  card: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: ({ t }) => t.panel,
    border: ({ t }) => `1px solid ${t.line}`
  },
  body: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: 11, flex: 1, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eyebrow: { fontFamily: fontMono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" },
  push: { marginLeft: "auto" },
  nameRow: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 22, letterSpacing: "0.04em", color: ({ t }) => t.textHi, lineHeight: 1.1 },
  nameSmall: { fontSize: 22 },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, overflowWrap: "anywhere" },
  path: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" },
  arrow: { color: ({ t }) => t.textFaint, fontSize: 12 },
  minis: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  line: { fontSize: 12, color: ({ t }) => t.textLo },
  bad: { color: ({ t }) => t.bad },
  bake: { display: "grid", gap: 4 },
  bakeSeg: { height: 7, borderRadius: 3 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", alignItems: "center" }
}));
const STEP_TONE = {
  live: "ok",
  pr: "info",
  blocked: "bad",
  waiting: "neutral"
};
function CommitLine({ proof, className }) {
  const chip = commitProofChip(proof);
  if (!chip || proof.state === "not-recorded") return null;
  let who = "";
  if (proof.evidence?.mergedBy) who = ` by ${proof.evidence.mergedBy}`;
  else if (proof.evidence?.signer) who = `, ${proof.evidence.signer}`;
  return /* @__PURE__ */ jsx(Tooltip, { title: commitProofLine(proof), children: /* @__PURE__ */ jsxs("span", { className, children: [
    "Commit: ",
    chip,
    who
  ] }) });
}
function Mini({ label, value, caption, tone }) {
  return /* @__PURE__ */ jsx(Tile, { children: /* @__PURE__ */ jsx(Stat, { label, value, caption, tone }) });
}
function scoreTone(score) {
  if (score >= 80) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}
function groundTone(step) {
  if (step.kind === "flight") return STEP_TONE[step.state];
  return step.env ? "ok" : "neutral";
}
function signoffCaption(signoffs) {
  if (signoffs === void 0) return "not recorded yet";
  return signoffs > 0 ? "counted" : "none counted";
}
function HeroCard({ strip, highlight, children }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  return /* @__PURE__ */ jsx("section", { className: classes.card, style: { borderTop: `4px solid ${strip}`, ...highlight ? { borderColor: t.amberLine, borderTopColor: strip } : {} }, children: /* @__PURE__ */ jsx("div", { className: classes.body, children }) });
}
function stepLabel(step) {
  if (step.kind === "ground") return step.env ? `${step.env} \u2713` : "not on Ground";
  if (step.state === "live") return `${step.env} \u2713`;
  if (step.pr) return `${step.env} \xB7 PR #${step.pr.number}`;
  return step.env;
}
function ReleaseHeroes({
  next,
  live,
  liveName,
  liveEnvCount,
  flightEnvCount,
  signoffEnv,
  last,
  lastName,
  nameOf,
  onOpenDraft,
  onOpenRecord
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const nextCard = /* @__PURE__ */ jsxs(HeroCard, { strip: t.amber, highlight: true, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.eyebrow, style: { color: t.amberInk }, children: "Next release" }),
      /* @__PURE__ */ jsx(StatusChip, { tone: "warn", className: classes.push, children: "draft" })
    ] }),
    next ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.nameRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.name, children: next.name ?? "Next release" }),
        /* @__PURE__ */ jsxs("span", { className: classes.mono, children: [
          next.next.suggestedVersion ? `v${next.next.suggestedVersion} suggested` : "no new version yet",
          next.next.leading ? ` \xB7 ${next.next.leading.imageTag}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: classes.path, "aria-label": "Where it is", children: next.path.map((step, i) => /* @__PURE__ */ jsxs("span", { style: { display: "contents" }, children: [
        i > 0 && /* @__PURE__ */ jsx("span", { className: classes.arrow, children: "\u2192" }),
        /* @__PURE__ */ jsx(StatusChip, { tone: groundTone(step), children: stepLabel(step) })
      ] }, step.kind === "ground" ? "ground" : step.env)) }),
      /* @__PURE__ */ jsxs("div", { className: classes.minis, children: [
        /* @__PURE__ */ jsx(
          Mini,
          {
            label: "Readiness",
            value: (() => {
              const { ok, total } = readinessCount(next.next.readiness);
              return `${ok} of ${total}`;
            })()
          }
        ),
        /* @__PURE__ */ jsx(
          Mini,
          {
            label: "Scope",
            value: `${next.next.scope.length} PR${next.next.scope.length === 1 ? "" : "s"}`,
            caption: `${next.next.issues.length} issue${next.next.issues.length === 1 ? "" : "s"}`
          }
        ),
        /* @__PURE__ */ jsx(Mini, { label: "Notes", value: next.notes, caption: next.owner ? `owner ${next.owner}` : "no owner yet" })
      ] }),
      next.openPr?.pr && /* @__PURE__ */ jsx(CommitLine, { proof: commitProofOf({ guardrails: next.openPr.pr.ci, guardrailsPrUrl: next.openPr.pr.url }), className: classes.line }),
      next.blocked?.pr && /* @__PURE__ */ jsxs(Callout, { tone: "bad", title: `Blocked on ${next.blocked.env}`, children: [
        "Release PR #",
        next.blocked.pr.number,
        " has failing checks."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsxs(Button, { variant: "primary", small: true, onClick: onOpenDraft, children: [
          "Open ",
          next.name ?? "the draft"
        ] }),
        next.openPr?.pr && /* @__PURE__ */ jsx(PrRef, { pr: prFromSummary(next.openPr.pr), size: "chip" })
      ] })
    ] }) : /* @__PURE__ */ jsx(EmptyNote, { children: "Nothing to release yet." })
  ] });
  const bake = bakeProgress(live?.outcome);
  const liveChip = live ? outcomeChip(live.outcome) ?? statusPill(live) : void 0;
  const liveCard = /* @__PURE__ */ jsxs(HeroCard, { strip: t.sky, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsxs("span", { className: classes.eyebrow, style: { color: t.sky }, children: [
        "Live in ",
        signoffEnv ?? "production"
      ] }),
      liveChip && /* @__PURE__ */ jsx(StatusChip, { tone: liveChip.tone, dot: true, className: classes.push, children: liveChip.label })
    ] }),
    live ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.nameRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.name, children: liveName ?? live.version ?? live.imageTag }),
        /* @__PURE__ */ jsx("span", { className: classes.mono, children: live.imageTag })
      ] }),
      bake && /* @__PURE__ */ jsx("div", { className: classes.bake, style: { gridTemplateColumns: `repeat(${bake.of}, minmax(0, 1fr))` }, "aria-label": `Baking, day ${bake.day} of ${bake.of}`, children: Array.from({ length: bake.of }, (_, i) => /* @__PURE__ */ jsx("div", { className: classes.bakeSeg, style: { backgroundColor: i < bake.day ? t.sky : t.lineSoft } }, i)) }),
      /* @__PURE__ */ jsxs("div", { className: classes.minis, children: [
        /* @__PURE__ */ jsx(Mini, { label: "Score", value: displayScore(live), caption: "readiness", tone: scoreTone(displayScore(live)) }),
        /* @__PURE__ */ jsx(Mini, { label: "Sign-off", value: live.signoffs ?? "\u2014", caption: signoffCaption(live.signoffs), tone: live.signoffs === 0 ? "bad" : void 0 }),
        /* @__PURE__ */ jsx(Mini, { label: "Live in", value: `${liveEnvCount} of ${flightEnvCount}`, caption: "Flight environments" })
      ] }),
      /* @__PURE__ */ jsx(CommitLine, { proof: commitProofOf(live), className: classes.line }),
      /* @__PURE__ */ jsx("div", { className: classes.actions, children: /* @__PURE__ */ jsx(Button, { small: true, onClick: () => onOpenRecord(live.id), children: "Open record" }) })
    ] }) : /* @__PURE__ */ jsxs(EmptyNote, { children: [
      "No release is live in ",
      signoffEnv ?? "production",
      " yet."
    ] })
  ] });
  const lastChip = last ? outcomeChip(last.outcome) : void 0;
  const lastCard = /* @__PURE__ */ jsxs(HeroCard, { strip: last?.outcome?.result === "rolled-back" ? t.bad : t.good, children: [
    /* @__PURE__ */ jsx("div", { className: classes.head, children: /* @__PURE__ */ jsx("span", { className: classes.eyebrow, style: { color: t.good }, children: "Last outcome" }) }),
    last ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.nameRow, children: [
        /* @__PURE__ */ jsx("span", { className: `${classes.name} ${classes.nameSmall}`, children: lastName ?? last.version ?? last.imageTag }),
        lastChip && /* @__PURE__ */ jsx(StatusChip, { tone: lastChip.tone, children: lastChip.label })
      ] }),
      /* @__PURE__ */ jsx("span", { className: classes.mono, children: last.imageTag }),
      /* @__PURE__ */ jsx("span", { className: classes.line, children: howItEnded(last, nameOf) }),
      last.signoffs === 0 && /* @__PURE__ */ jsx("span", { className: `${classes.line} ${classes.bad}`, children: "Shipped without a sign-off." }),
      /* @__PURE__ */ jsx("div", { className: classes.actions, children: /* @__PURE__ */ jsx(Button, { small: true, onClick: () => onOpenRecord(last.id), children: "Open record" }) })
    ] }) : /* @__PURE__ */ jsx(EmptyNote, { children: "No release has a final outcome yet." })
  ] });
  return /* @__PURE__ */ jsxs("div", { className: classes.cards, children: [
    nextCard,
    liveCard,
    lastCard
  ] });
}
function howItEnded(record, nameOf) {
  const o = record.outcome;
  if (!o) return "";
  const by = (tag) => nameOf(tag) ?? tag;
  if (o.result === "rolled-back") return `Rolled back to ${by(o.rolledBackBy) ?? "an earlier release"}${o.rollbackReason ? `: ${o.rollbackReason}` : "."}`;
  if (o.closedBy === "bake-complete") return `Healthy through the ${o.bakeDays}-day bake.`;
  if (o.result === "replaced-before-healthy") return `Replaced${o.supersededBy ? ` by ${by(o.supersededBy)}` : ""} before it was healthy.`;
  if (o.result === "stopped-before-production") return "Never reached production.";
  return `Healthy, then replaced${o.supersededBy ? ` by ${by(o.supersededBy)}` : ""}.`;
}

export { ReleaseHeroes };
//# sourceMappingURL=ReleaseHeroes.esm.js.map
