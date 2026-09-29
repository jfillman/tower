import { jsx, jsxs } from 'react/jsx-runtime';
import RouterIcon from '@material-ui/icons/Router';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import LayersIcon from '@material-ui/icons/Layers';
import AppsIcon from '@material-ui/icons/Apps';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import { fontMono } from '../../brand/tokens.esm.js';
import { useSignalRailStyles, TallArrow } from '../../SignalRail.esm.js';
import { health } from '../../types.esm.js';

function buildTopoStages(env) {
  const h = health(env);
  const readyPods = env.pods.filter((p) => p.ready).length;
  const totalPods = env.pods.length;
  let workloadStatus = "pending";
  if (h === "healthy") workloadStatus = "good";
  else if (h === "degraded") workloadStatus = "bad";
  else if (h === "progressing" || h === "paused") workloadStatus = "current";
  let podsStatus = "pending";
  if (totalPods > 0) {
    if (readyPods === totalPods) podsStatus = "good";
    else if (readyPods > 0) podsStatus = "current";
    else podsStatus = "bad";
  }
  return [
    {
      key: "route",
      label: "Route",
      status: env.ingressUrl ? "good" : "pending",
      meta: env.ingressUrl ? env.ingressUrl.replace(/^https?:\/\//, "") : "no route"
    },
    {
      key: "service",
      label: "Service",
      status: env.services.length > 0 ? "good" : "pending",
      meta: env.services.length > 0 ? `${env.services.length} service${env.services.length === 1 ? "" : "s"}` : "no service"
    },
    {
      key: "workload",
      label: "Workload",
      status: env.workload ? workloadStatus : "pending",
      meta: env.workload ? env.strategy ?? env.workload.kind : "no workload"
    },
    {
      key: "pods",
      label: "Pods",
      status: podsStatus,
      meta: totalPods > 0 ? `${readyPods}/${totalPods} ready` : "no pods"
    }
  ];
}
function dotStyle(t, status) {
  switch (status) {
    case "good":
      return { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good };
    case "current":
      return { backgroundColor: t.amberSoft, borderColor: t.amber, color: t.amberInk };
    case "bad":
      return { backgroundColor: t.badSoft, borderColor: t.bad, color: t.bad };
    default:
      return { backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint };
  }
}
function StageIcon({ stageKey, status }) {
  if (status === "bad") return /* @__PURE__ */ jsx(ErrorOutlineIcon, { fontSize: "inherit" });
  if (stageKey === "route") return /* @__PURE__ */ jsx(RouterIcon, { fontSize: "inherit" });
  if (stageKey === "service") return /* @__PURE__ */ jsx(DeviceHubIcon, { fontSize: "inherit" });
  if (stageKey === "workload") return /* @__PURE__ */ jsx(LayersIcon, { fontSize: "inherit" });
  return /* @__PURE__ */ jsx(AppsIcon, { fontSize: "inherit" });
}
function TopoDag({
  stages,
  selectedKey,
  onSelectKey,
  t
}) {
  const classes = useSignalRailStyles({ t });
  return /* @__PURE__ */ jsx("div", { className: classes.rail, children: stages.map((stage, i) => /* @__PURE__ */ jsxs("div", { style: { display: "contents" }, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: `${classes.node} ${classes.nodeClickable} ${stage.key === selectedKey ? classes.nodeSelected : ""}`,
        role: "button",
        tabIndex: 0,
        onClick: () => onSelectKey(stage.key),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") onSelectKey(stage.key);
        },
        onMouseDown: (e) => e.preventDefault(),
        children: [
          /* @__PURE__ */ jsx("span", { className: `${classes.dot} ${stage.status === "current" ? classes.dotCurrent : ""}`, style: dotStyle(t, stage.status), children: /* @__PURE__ */ jsx(StageIcon, { stageKey: stage.key, status: stage.status }) }),
          /* @__PURE__ */ jsx("span", { className: classes.label, children: stage.label }),
          /* @__PURE__ */ jsx("span", { className: classes.meta, style: { fontFamily: fontMono }, children: stage.meta })
        ]
      }
    ),
    i < stages.length - 1 && /* @__PURE__ */ jsx("div", { className: classes.connector, children: /* @__PURE__ */ jsx("span", { className: classes.connectorArrow, style: { color: t.amber }, children: /* @__PURE__ */ jsx(TallArrow, { size: 18 }) }) })
  ] }, stage.key)) });
}

export { TopoDag, buildTopoStages };
//# sourceMappingURL=TopoDag.esm.js.map
