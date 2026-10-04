import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Link from '@material-ui/core/Link';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { currentStep } from '../../environments/lifecycle.esm.js';
import { Button } from '../../ui/index.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { border: ({ t }) => `1px solid ${t.line}`, borderRadius: 6, backgroundColor: ({ t }) => t.panel, padding: "10px 14px" },
  head: { display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" },
  title: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  sub: { fontSize: 12.5, color: ({ t }) => t.textLo },
  list: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 },
  item: { display: "grid", gridTemplateColumns: "18px 1fr", gap: 10, alignItems: "start" },
  dot: { width: 10, height: 10, borderRadius: "50%", marginTop: 4, border: "2px solid transparent" },
  stepTitle: { fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  desc: { fontSize: 12, color: ({ t }) => t.textLo },
  detail: { fontSize: 12, fontFamily: fontMono, color: ({ t }) => t.textLo, marginTop: 2 },
  links: { display: "flex", gap: 12, marginTop: 4, fontSize: 12 }
}));
const LABEL = { done: "done", run: "in progress", pend: "waiting", fail: "failed" };
function dotStyle(state, t) {
  if (state === "done") return { backgroundColor: t.good };
  if (state === "run") return { backgroundColor: t.amber };
  if (state === "fail") return { backgroundColor: t.bad };
  return { backgroundColor: "transparent", borderColor: t.textFaint };
}
function EnvLifecycle({ steps, initiallyOpen = false }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const current = currentStep(steps);
  const [open, setOpen] = useState(initiallyOpen);
  const doneCount = steps.filter((s) => s.state === "done").length;
  if (!current && !open) {
    return /* @__PURE__ */ jsx("div", { className: c.wrap, children: /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsx("span", { className: c.title, children: "Provisioned" }),
      /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setOpen(true), children: "Show steps" })
    ] }) });
  }
  return /* @__PURE__ */ jsxs("div", { className: c.wrap, role: "group", "aria-label": "Provisioning progress", children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: c.title, children: current ? `Provisioning: step ${doneCount + 1} of ${steps.length}` : "Provisioned" }),
        current && /* @__PURE__ */ jsxs("div", { className: c.sub, children: [
          current.title,
          current.detail ? `. ${current.detail}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setOpen((o) => !o), "aria-expanded": open, children: open ? "Hide steps" : "Show steps" })
    ] }),
    open && /* @__PURE__ */ jsx("ol", { className: c.list, children: steps.map((s) => /* @__PURE__ */ jsxs("li", { className: c.item, children: [
      /* @__PURE__ */ jsx("i", { className: c.dot, style: dotStyle(s.state, t), role: "img", "aria-label": LABEL[s.state] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: c.stepTitle, children: s.title }),
        /* @__PURE__ */ jsx("div", { className: c.desc, children: s.desc }),
        s.detail && /* @__PURE__ */ jsx("div", { className: c.detail, children: s.detail }),
        s.links && s.links.length > 0 && /* @__PURE__ */ jsx("div", { className: c.links, children: s.links.map((l) => /* @__PURE__ */ jsxs(Link, { href: l.url, target: "_blank", rel: "noopener noreferrer", children: [
          l.label,
          l.state ? ` (${l.state})` : ""
        ] }, l.url)) })
      ] })
    ] }, s.id)) })
  ] });
}

export { EnvLifecycle };
//# sourceMappingURL=EnvLifecycle.esm.js.map
