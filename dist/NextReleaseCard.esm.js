import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { NicknameChip } from './tabs/deployments/ImageTagPill.esm.js';
import { Button, Card, Tile, SectionTitle, EmptyNote, TextLink, Hint, StatusChip } from './ui/index.esm.js';

const SCOPE_SHOWN = 6;
const INCOMING_SHOWN = 3;
const useStyles = makeStyles(() => ({
  // The kit Card, in the dashed amber of the record's Human context band.
  draft: {
    borderStyle: "dashed",
    borderColor: ({ t }) => t.amberLine,
    backgroundColor: ({ t }) => t.amberSoft,
    marginBottom: 14
  },
  meta: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 19, letterSpacing: "0.06em", color: ({ t }) => t.textHi },
  version: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.amberInk },
  after: { fontSize: 12, color: ({ t }) => t.textLo },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr 1fr",
    gap: 12,
    "@media (max-width: 980px)": { gridTemplateColumns: "1fr" }
  },
  column: { minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
  item: { display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "2px 0", minWidth: 0 },
  prTitle: { color: ({ t }) => t.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  faint: { color: ({ t }) => t.textFaint, fontSize: 12 },
  sub: { borderTop: ({ t }) => `1px solid ${t.lineSoft}`, marginTop: 8, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 },
  issues: { display: "flex", flexWrap: "wrap", gap: 8, fontFamily: fontMono, fontSize: 11, marginTop: 4 },
  tag: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi },
  cand: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 },
  leadMark: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.amberInk, letterSpacing: "0.06em" },
  meter: { height: 6, borderRadius: 3, backgroundColor: ({ t }) => t.panelAlt, overflow: "hidden", margin: "2px 0 6px" },
  meterFill: { display: "block", height: "100%", backgroundColor: ({ t }) => t.amber },
  check: { fontFamily: fontMono, width: 14, flex: "0 0 14px", textAlign: "center" },
  checkLabel: { color: ({ t }) => t.textHi, flex: "none" }
}));
const CHECK = { ok: "\u2713", todo: "!", unknown: "?" };
function checkColor(t, state) {
  if (state === "ok") return t.good;
  if (state === "todo") return t.amberInk;
  return t.textFaint;
}
function soakText(c) {
  if (c.liveOn.length > 0) return `${c.liveOn.join(", ")} \xB7 ${relativeTime(c.firstGroundAt).replace(/ ago$/, "")}`;
  return c.firstGroundAt ? "no longer on Ground" : "not deployed";
}
function NextReleaseCard({
  next,
  name,
  previousName,
  promoteTo,
  onPromote
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { scope, incoming, issues, candidates, leading, readiness, previous } = next;
  const ok = readiness.filter((i) => i.state === "ok").length;
  const previousLabel = previous ? `${previousName ?? ""}${previousName ? " \xB7 " : ""}${previous.version ?? previous.imageTag}` : void 0;
  const scopeIssues = issues.filter((i) => i.merged);
  const incomingIssues = issues.filter((i) => !i.merged);
  const promote = leading && (leading.liveOn.length > 0 || leading.image) && promoteTo && onPromote ? /* @__PURE__ */ jsx(Button, { variant: "primary", small: true, onClick: () => onPromote(leading), children: `Promote ${leading.nickname ?? leading.imageTag} to ${promoteTo}` }) : void 0;
  return /* @__PURE__ */ jsxs(
    Card,
    {
      className: classes.draft,
      "aria-label": "Next release",
      title: name ? /* @__PURE__ */ jsx("span", { className: classes.name, children: name }) : "Next release",
      meta: /* @__PURE__ */ jsxs("span", { className: classes.meta, children: [
        /* @__PURE__ */ jsx(StatusChip, { tone: "warn", dot: true, children: name ? "next release \xB7 draft" : "draft" }),
        next.suggestedVersion && /* @__PURE__ */ jsxs("span", { className: classes.version, title: `From the merged PRs${next.breaking ? ", including a breaking change" : ""}`, children: [
          "v",
          next.suggestedVersion,
          " suggested"
        ] }),
        previousLabel && /* @__PURE__ */ jsxs("span", { className: classes.after, children: [
          "after ",
          previousLabel
        ] })
      ] }),
      actions: promote,
      children: [
        /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
          /* @__PURE__ */ jsxs(Tile, { className: classes.column, children: [
            /* @__PURE__ */ jsxs(SectionTitle, { level: 2, children: [
              `Scope \xB7 ${scope.length} PR${scope.length === 1 ? "" : "s"}`,
              next.changeCategories.features + next.changeCategories.fixes > 0 && ` \xB7 ${next.changeCategories.features} feat / ${next.changeCategories.fixes} fix`
            ] }),
            scope.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "Nothing merged to main since the last release." }),
            [...scope].reverse().slice(0, SCOPE_SHOWN).map((pr) => /* @__PURE__ */ jsxs("div", { className: classes.item, children: [
              /* @__PURE__ */ jsxs(TextLink, { href: pr.url, children: [
                "#",
                pr.number
              ] }),
              /* @__PURE__ */ jsx("span", { className: classes.prTitle, title: pr.title, children: pr.title })
            ] }, pr.number)),
            scope.length > SCOPE_SHOWN && /* @__PURE__ */ jsxs("span", { className: classes.faint, children: [
              "+ ",
              scope.length - SCOPE_SHOWN,
              " older"
            ] }),
            next.scopeMayBeIncomplete && /* @__PURE__ */ jsx(Hint, { children: "Tower only sees the 20 newest merged PRs; older ones in this release aren't listed." }),
            scopeIssues.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.issues, children: [
              /* @__PURE__ */ jsx("span", { className: classes.faint, children: "Closes" }),
              scopeIssues.map((i) => /* @__PURE__ */ jsxs(TextLink, { href: i.url, children: [
                "#",
                i.number
              ] }, i.url))
            ] }),
            /* @__PURE__ */ jsxs("div", { className: classes.sub, children: [
              /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: `Incoming \xB7 ${incoming.length} open` }),
              incoming.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "No open PRs." }),
              incoming.slice(0, INCOMING_SHOWN).map((pr) => /* @__PURE__ */ jsxs("div", { className: classes.item, children: [
                /* @__PURE__ */ jsxs(TextLink, { href: pr.url, children: [
                  "#",
                  pr.number
                ] }),
                /* @__PURE__ */ jsx("span", { className: classes.prTitle, title: pr.title, children: pr.title }),
                pr.draft && /* @__PURE__ */ jsx("span", { className: classes.faint, children: "draft" })
              ] }, pr.number)),
              incoming.length > INCOMING_SHOWN && /* @__PURE__ */ jsxs("span", { className: classes.faint, children: [
                "+ ",
                incoming.length - INCOMING_SHOWN,
                " more"
              ] }),
              incomingIssues.length > 0 && /* @__PURE__ */ jsxs("div", { className: classes.issues, children: [
                /* @__PURE__ */ jsx("span", { className: classes.faint, children: "Would close" }),
                incomingIssues.map((i) => /* @__PURE__ */ jsxs(TextLink, { href: i.url, children: [
                  "#",
                  i.number
                ] }, i.url))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs(Tile, { className: classes.column, children: [
            /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: `Candidates \xB7 ${candidates.length}` }),
            candidates.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "No image built from main since the last release." }),
            candidates.map((c) => /* @__PURE__ */ jsxs("div", { className: classes.cand, children: [
              c.nickname && /* @__PURE__ */ jsx(NicknameChip, { nickname: c.nickname }),
              /* @__PURE__ */ jsx("span", { className: classes.tag, children: c.imageTag }),
              /* @__PURE__ */ jsx("span", { className: classes.faint, children: soakText(c) }),
              /* @__PURE__ */ jsxs("span", { className: classes.faint, children: [
                c.prCount,
                " PR",
                c.prCount === 1 ? "" : "s"
              ] }),
              c === leading && /* @__PURE__ */ jsx("span", { className: classes.leadMark, children: "LEADING" })
            ] }, c.imageTag))
          ] }),
          /* @__PURE__ */ jsxs(Tile, { className: classes.column, children: [
            /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: `Readiness \xB7 ${ok} of ${readiness.length}` }),
            /* @__PURE__ */ jsx("div", { className: classes.meter, role: "img", "aria-label": `${ok} of ${readiness.length} readiness checks pass`, children: /* @__PURE__ */ jsx("span", { className: classes.meterFill, style: { width: `${readiness.length ? ok / readiness.length * 100 : 0}%` } }) }),
            readiness.map((item) => /* @__PURE__ */ jsxs("div", { className: classes.item, title: item.detail, children: [
              /* @__PURE__ */ jsx("span", { className: classes.check, style: { color: checkColor(t, item.state) }, children: CHECK[item.state] }),
              /* @__PURE__ */ jsx("span", { className: classes.checkLabel, children: item.label }),
              /* @__PURE__ */ jsx("span", { className: classes.faint, children: item.detail })
            ] }, item.id))
          ] })
        ] }),
        /* @__PURE__ */ jsx(Hint, { children: "Built from merged PRs and images. Nothing is saved until this release reaches Flight and its record is written." })
      ]
    }
  );
}

export { NextReleaseCard };
//# sourceMappingURL=NextReleaseCard.esm.js.map
