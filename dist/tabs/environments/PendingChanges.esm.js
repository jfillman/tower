import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { Chip } from '../../ui/index.esm.js';
import { PendingPanel } from '../../ui/PendingPanel.esm.js';
import { useUi } from '../../ui/styles.esm.js';

const useStyles = makeStyles(() => ({
  section: { borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 12 },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  prList: { display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, marginTop: 8 }
}));
const TONE = { add: "add", remove: "remove" };
const IDLE = { one: "Open pull request", several: "Open pull requests" };
const BUSY = { launching: "Requesting environment\u2026", submitting: "Opening\u2026" };
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
  const files = ["cicd.yaml", ...deleteFiles.length > 0 ? ["environment values files deleted where they exist"] : []];
  return /* @__PURE__ */ jsx(
    PendingPanel,
    {
      lines: changes.map((l) => ({ title: l.title, detail: l.detail, tone: TONE[l.kind] })),
      problems,
      notes,
      emptyText: "Nothing staged. Add an environment, reorder, or set a cloud environment's resource, then review here.",
      busy: phase !== "idle",
      busyLabel: phase === "idle" ? "" : BUSY[phase],
      submitLabel: several ? IDLE.several : IDLE.one,
      onDiscard,
      onSubmit: onOpen,
      children: /* @__PURE__ */ jsxs("div", { className: c.section, children: [
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
      ] })
    }
  );
}

export { PendingChanges };
//# sourceMappingURL=PendingChanges.esm.js.map
