import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { Panel, SectionLabel, Chip, Button } from '../../ui/index.esm.js';
import { useUi } from '../../ui/styles.esm.js';

const useStyles = makeStyles(() => ({
  panel: { padding: 16, display: "flex", flexDirection: "column", gap: 12, alignSelf: "start" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  lines: { display: "flex", flexDirection: "column", gap: 12 },
  line: { display: "flex", flexDirection: "column", gap: 2 },
  lineTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  plus: { color: ({ t }) => t.good, marginRight: 4 },
  minus: { color: ({ t }) => t.bad, marginRight: 4 },
  section: { borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 12 },
  prList: { display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, marginTop: 8 },
  buttons: { display: "flex", gap: 8 }
}));
function PendingChanges({
  changes,
  problems,
  notes,
  flightAdds,
  launched,
  owner,
  appName,
  deleteFiles,
  phase,
  onDiscard,
  onOpen
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const several = flightAdds.length > 0;
  const idleLabel = several ? "Open pull requests" : "Open pull request";
  const busyLabel = { launching: "Requesting environment\u2026", submitting: "Opening\u2026" };
  const openLabel = phase === "idle" ? idleLabel : busyLabel[phase];
  const files = ["cicd.yaml", ...deleteFiles.length > 0 ? ["environment values files deleted where they exist"] : []];
  return /* @__PURE__ */ jsxs(Panel, { accent: true, className: c.panel, "aria-label": "Pending changes", children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsx(SectionLabel, { children: "Pending changes" }),
      /* @__PURE__ */ jsxs(Chip, { tone: "flight", children: [
        changes.length,
        " staged"
      ] })
    ] }),
    changes.length === 0 ? /* @__PURE__ */ jsx("div", { className: ui.note, children: "Nothing staged. Add an environment, reorder, or set a cloud environment's resource, then review here." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: c.lines, children: changes.map((l, i) => /* @__PURE__ */ jsxs("div", { className: c.line, children: [
        /* @__PURE__ */ jsxs("span", { className: c.lineTitle, children: [
          l.kind === "add" && /* @__PURE__ */ jsx("span", { className: c.plus, children: "+" }),
          l.kind === "remove" && /* @__PURE__ */ jsx("span", { className: c.minus, children: "-" }),
          l.title
        ] }),
        l.detail && /* @__PURE__ */ jsx("span", { className: c.detail, children: l.detail })
      ] }, `${l.kind}-${l.title}-${i}`)) }),
      problems.map((p) => /* @__PURE__ */ jsx("div", { className: ui.problem, children: p }, p)),
      /* @__PURE__ */ jsxs("div", { className: c.section, children: [
        /* @__PURE__ */ jsx("span", { className: ui.columnLabel, children: several ? "Pull requests this opens, in this order" : "Pull request this opens" }),
        /* @__PURE__ */ jsxs("div", { className: c.prList, children: [
          flightAdds.map((e, i) => /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Chip, { tone: "flight", children: i + 1 }),
            " ",
            /* @__PURE__ */ jsx("b", { children: "tenants repo" }),
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsxs("span", { className: c.detail, children: [
              "ApplicationEnvironment request for ",
              e.name,
              launched[e.name] ? " (already opened)" : ""
            ] })
          ] }, e.name)),
          /* @__PURE__ */ jsxs("span", { children: [
            /* @__PURE__ */ jsx(Chip, { tone: "ground", children: several ? flightAdds.length + 1 : 1 }),
            " ",
            /* @__PURE__ */ jsxs("b", { children: [
              owner,
              "/",
              appName
            ] }),
            /* @__PURE__ */ jsx("br", {}),
            /* @__PURE__ */ jsx("span", { className: c.detail, children: files.join(", ") })
          ] })
        ] })
      ] }),
      notes.map((n) => /* @__PURE__ */ jsx("div", { className: ui.note, children: n }, n)),
      /* @__PURE__ */ jsxs("div", { className: c.buttons, children: [
        /* @__PURE__ */ jsx(Button, { onClick: onDiscard, children: "Discard all" }),
        /* @__PURE__ */ jsx(Button, { variant: "primary", style: { flex: 1 }, disabled: problems.length > 0 || phase !== "idle", onClick: onOpen, children: openLabel })
      ] })
    ] })
  ] });
}

export { PendingChanges };
//# sourceMappingURL=PendingChanges.esm.js.map
