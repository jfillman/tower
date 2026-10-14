import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format.esm.js';
import { useHangarTokens } from './brand/tokens.esm.js';
import { RecordColumn } from './RecordColumn.esm.js';
import { NOTE_CATEGORIES, NOTE_LABEL, SIGNOFF_LABEL, RELEASE_MODE_LABEL } from './releaseFlow.esm.js';
import { Tile, SectionTitle, EmptyNote, FactGrid, Fact, StatusChip, TextLink, Hint } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  grid: {
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr",
    gap: 12,
    "@media (max-width: 900px)": { gridTemplateColumns: "1fr" }
  },
  column: { minWidth: 0, display: "flex", flexDirection: "column", gap: 8 },
  section: { fontSize: 12.5, color: ({ t }) => t.textHi },
  list: { margin: "2px 0 0", paddingLeft: 18 },
  line: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 12.5 },
  faint: { color: ({ t }) => t.textFaint, fontSize: 12 }
}));
const SIGNOFF_TONE = {
  awaiting: "warn",
  approved: "ok",
  signed: "ok",
  "self-approved": "bad",
  "shipped-without": "bad"
};
function approvalNote(a, mergedBy) {
  if (!a.beforeMerge) return " \xB7 after the merge";
  if (a.by === mergedBy) return " \xB7 the merger";
  if (a.notApprover) return " \xB7 not one of this app's owners or an admin, so it doesn't count";
  if (a.approverUnknown) return " \xB7 couldn't check that this reviewer may sign off, so it doesn't count";
  return "";
}
function ReleaseSignoffPanel({
  release,
  signoff,
  signoffEnv,
  mode,
  loading,
  live,
  addedAfter
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const notes = NOTE_CATEGORIES.filter((c) => (release?.notes?.[c]?.length ?? 0) > 0);
  const requiresSignoff = mode === "hand-flown";
  const missing = signoff && (signoff.status === "shipped-without" || signoff.status === "self-approved");
  return /* @__PURE__ */ jsx(
    RecordColumn,
    {
      title: "Release notes and sign-off",
      strip: t.amber,
      meta: mode ? /* @__PURE__ */ jsx(StatusChip, { tone: requiresSignoff ? "warn" : "info", dot: true, children: RELEASE_MODE_LABEL[mode] }) : void 0,
      children: /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
        /* @__PURE__ */ jsxs(Tile, { className: classes.column, children: [
          /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: "Release notes" }),
          release?.summary && /* @__PURE__ */ jsx("div", { className: classes.section, children: release.summary }),
          !release && !addedAfter?.summary && /* @__PURE__ */ jsx(EmptyNote, { children: "Written before release notes were part of the record." }),
          release && notes.length === 0 && !release.summary && /* @__PURE__ */ jsx(EmptyNote, { children: "No notes were written for this release." }),
          notes.map((c) => /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
            /* @__PURE__ */ jsx("b", { children: NOTE_LABEL[c] }),
            /* @__PURE__ */ jsx("ul", { className: classes.list, children: release.notes[c].map((line, i) => /* @__PURE__ */ jsx("li", { children: line }, i)) })
          ] }, c)),
          (release?.knownIssues?.length ?? 0) > 0 && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
            /* @__PURE__ */ jsx("b", { children: "Known issues" }),
            /* @__PURE__ */ jsx("ul", { className: classes.list, children: release.knownIssues.map((line, i) => /* @__PURE__ */ jsx("li", { children: line }, i)) })
          ] }),
          (addedAfter?.summary || addedAfter?.risk || addedAfter?.riskNotes) && /* @__PURE__ */ jsxs(FactGrid, { children: [
            addedAfter.summary && /* @__PURE__ */ jsx(Fact, { label: "Summary (added after release)", children: addedAfter.summary }),
            addedAfter.risk && /* @__PURE__ */ jsx(Fact, { label: "Risk (added after release)", children: addedAfter.risk }),
            addedAfter.riskNotes && /* @__PURE__ */ jsx(Fact, { label: "Risk notes (added after release)", children: addedAfter.riskNotes })
          ] }),
          release && (release.owner || release.risk) && /* @__PURE__ */ jsxs(FactGrid, { children: [
            release.owner && /* @__PURE__ */ jsx(Fact, { label: "Owner", children: release.owner }),
            release.risk?.level && /* @__PURE__ */ jsx(Fact, { label: "Risk", children: release.risk.level }),
            release.risk?.notes && /* @__PURE__ */ jsx(Fact, { label: "Risk notes", children: release.risk.notes }),
            release.risk?.rollback && /* @__PURE__ */ jsx(Fact, { label: "Rollback notes", children: release.risk.rollback })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Tile, { className: classes.column, children: [
          /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: `Sign-off${signoffEnv ? ` \xB7 ${signoffEnv}` : ""}` }),
          loading && !signoff && /* @__PURE__ */ jsx(EmptyNote, { children: "Reading the release PR\u2026" }),
          !loading && !signoff && /* @__PURE__ */ jsx(EmptyNote, { children: signoffEnv ? `This image has no release PR to ${signoffEnv} yet.` : "This app has no Flight environment to sign off." }),
          signoff && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
              /* @__PURE__ */ jsx(StatusChip, { tone: missing && !requiresSignoff ? "neutral" : SIGNOFF_TONE[signoff.status], dot: true, children: SIGNOFF_LABEL[signoff.status] }),
              /* @__PURE__ */ jsx(TextLink, { href: signoff.prUrl, children: `PR #${signoff.prNumber} \u2197` }),
              signoff.mergedBy && /* @__PURE__ */ jsxs("span", { className: classes.faint, children: [
                "merged by ",
                signoff.mergedBy,
                signoff.mergedAt ? ` \xB7 ${formatDateTime(signoff.mergedAt)}` : ""
              ] })
            ] }),
            signoff.approvals.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "No approving reviews." }),
            signoff.approvals.map((a) => /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
              /* @__PURE__ */ jsx("span", { children: a.counts ? "\u2713" : "\xB7" }),
              /* @__PURE__ */ jsx("span", { children: a.by }),
              /* @__PURE__ */ jsxs("span", { className: classes.faint, children: [
                formatDateTime(a.at),
                approvalNote(a, signoff.mergedBy)
              ] })
            ] }, a.by)),
            missing && requiresSignoff && /* @__PURE__ */ jsxs(Hint, { children: [
              "Hand-flown: this release reached ",
              signoff.env,
              " without an approval from someone other than the person who merged it."
            ] }),
            missing && !requiresSignoff && /* @__PURE__ */ jsx(Hint, { children: "Assisted: a sign-off is recorded, not required." }),
            live && signoff.approvals.some((a) => a.counts) && /* @__PURE__ */ jsx(Hint, { children: "Read live from the PR. It counts toward the score once the record carries it." })
          ] })
        ] })
      ] })
    }
  );
}

export { ReleaseSignoffPanel };
//# sourceMappingURL=ReleaseSignoffPanel.esm.js.map
