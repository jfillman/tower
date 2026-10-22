import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format.esm.js';
import { fontMono, fontDisplay, useHangarTokens } from './brand/tokens.esm.js';
import { NOTE_CATEGORIES, NOTE_LABEL } from './releaseFlow.esm.js';
import { outcomeChip } from './ReleaseOutcome.esm.js';
import { TextLink, SectionTitle, EmptyNote, Card, StatusChip } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  list: { display: "flex", flexDirection: "column", gap: 12, marginTop: 12 },
  head: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10 },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", color: ({ t }) => t.textHi },
  version: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  date: { fontSize: 12, color: ({ t }) => t.textFaint, marginLeft: "auto" },
  section: { fontSize: 13, color: ({ t }) => t.textHi },
  bullets: { margin: "2px 0 0", paddingLeft: 18 }
}));
function ReleaseChangelog({ names, onBack }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const entries = [...names?.index ?? []].reverse();
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2190 Back to records" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 14 }, children: /* @__PURE__ */ jsx(SectionTitle, { children: "Changelog" }) }),
    !names && /* @__PURE__ */ jsx(EmptyNote, { children: "Loading the release history\u2026" }),
    names && entries.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { children: "No release has a record yet." }),
    /* @__PURE__ */ jsx("div", { className: classes.list, children: entries.map((e) => {
      const notes = NOTE_CATEGORIES.filter((c) => (e.notes?.[c]?.length ?? 0) > 0);
      const chip = outcomeChip(e.outcome);
      return /* @__PURE__ */ jsxs(Card, { children: [
        /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
          /* @__PURE__ */ jsx("span", { className: classes.name, children: names.byTag.get(e.imageTag) ?? "" }),
          /* @__PURE__ */ jsx("span", { className: classes.version, children: e.imageTag }),
          chip && /* @__PURE__ */ jsx(StatusChip, { tone: chip.tone, dot: true, children: chip.label }),
          e.githubRelease?.url && /* @__PURE__ */ jsx(TextLink, { href: e.githubRelease.url, children: `${e.githubRelease.tag ?? "GitHub Release"} \u2197` }),
          /* @__PURE__ */ jsxs("span", { className: classes.date, children: [
            formatDateTime(e.generatedAt),
            e.owner ? ` \xB7 ${e.owner}` : ""
          ] })
        ] }),
        e.summary && /* @__PURE__ */ jsx("div", { className: classes.section, children: e.summary }),
        notes.length === 0 && !e.knownIssues?.length && !e.summary && /* @__PURE__ */ jsx(EmptyNote, { children: "No notes were written for this release." }),
        notes.map((c) => /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
          /* @__PURE__ */ jsx("b", { children: NOTE_LABEL[c] }),
          /* @__PURE__ */ jsx("ul", { className: classes.bullets, children: e.notes[c].map((line, i) => /* @__PURE__ */ jsx("li", { children: line }, i)) })
        ] }, c)),
        (e.knownIssues?.length ?? 0) > 0 && /* @__PURE__ */ jsxs("div", { className: classes.section, children: [
          /* @__PURE__ */ jsx("b", { children: "Known issues" }),
          /* @__PURE__ */ jsx("ul", { className: classes.bullets, children: e.knownIssues.map((line, i) => /* @__PURE__ */ jsx("li", { children: line }, i)) })
        ] })
      ] }, e.imageTag);
    }) })
  ] });
}

export { ReleaseChangelog };
//# sourceMappingURL=ReleaseChangelog.esm.js.map
