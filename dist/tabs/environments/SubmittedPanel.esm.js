import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { Panel, SectionLabel, Button } from '../../ui/index.esm.js';
import { useUi } from '../../ui/styles.esm.js';

const useStyles = makeStyles(() => ({
  panel: { padding: 16, display: "flex", flexDirection: "column", gap: 12 },
  record: { display: "flex", flexDirection: "column", gap: 4, borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 10 },
  title: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  detail: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textLo },
  links: { display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12.5 },
  actions: { display: "flex", gap: 8 }
}));
function SubmittedPanel({
  records,
  onCheck,
  onDismiss
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  if (records.length === 0) return null;
  return /* @__PURE__ */ jsxs(Panel, { className: c.panel, role: "region", "aria-label": "Open pull requests", children: [
    /* @__PURE__ */ jsx(SectionLabel, { children: "Open pull requests" }),
    /* @__PURE__ */ jsx("div", { className: ui.note, children: "Waiting for merge. This updates by itself every half minute." }),
    records.map((r) => /* @__PURE__ */ jsxs("div", { className: c.record, children: [
      /* @__PURE__ */ jsx("span", { className: c.title, children: r.summary.filter((s) => !s.startsWith("Convert the environment list")).join(", ") || "Change to cicd.yaml" }),
      /* @__PURE__ */ jsxs("span", { className: c.detail, children: [
        "opened ",
        relativeTime(new Date(r.at).toISOString())
      ] }),
      /* @__PURE__ */ jsxs("div", { className: c.links, children: [
        Object.entries(r.requests).map(([env, url]) => /* @__PURE__ */ jsxs(Link, { href: url, target: "_blank", rel: "noopener noreferrer", children: [
          env,
          ": ApplicationEnvironment request"
        ] }, env)),
        /* @__PURE__ */ jsx(Link, { href: r.prUrl, target: "_blank", rel: "noopener noreferrer", children: "cicd.yaml pull request" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: c.actions, children: /* @__PURE__ */ jsx(Button, { small: true, onClick: () => onDismiss(r.id), children: "Dismiss" }) })
    ] }, r.id)),
    /* @__PURE__ */ jsx("div", { className: c.actions, children: /* @__PURE__ */ jsx(Button, { small: true, onClick: onCheck, children: "Check again" }) })
  ] });
}

export { SubmittedPanel };
//# sourceMappingURL=SubmittedPanel.esm.js.map
