import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import RouterIcon from '@material-ui/icons/Router';
import DeviceHubIcon from '@material-ui/icons/DeviceHub';
import LayersIcon from '@material-ui/icons/Layers';
import AppsIcon from '@material-ui/icons/Apps';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import { fontMono, fontDisplay, useHangarTokens } from '../../brand/tokens.esm.js';
import { preventFocusScroll } from '../../preventFocusScroll.esm.js';
import { CanaryRampChart } from '../../CanaryRampChart.esm.js';
import { YamlView } from './YamlView.esm.js';
import { MetricsPanel } from './MetricsPanel.esm.js';
import { PodsPanel } from './PodsPanel.esm.js';

function findResource(resources, kind, name) {
  return resources.find((r) => r.kind === kind && r.name === name);
}
function autoPromoteLabel(blueGreen) {
  if (blueGreen?.autoPromotionEnabled === void 0) return "\u2014";
  if (blueGreen.autoPromotionEnabled) return "yes";
  return `no \xB7 ${blueGreen.scaleDownDelaySeconds ?? "?"}s scale-down delay`;
}
const useStyles = makeStyles(() => ({
  head: { display: "flex", alignItems: "center", gap: 9 },
  headIcon: { display: "flex", color: ({ t }) => t.sky, flexShrink: 0 },
  title: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 14.5, color: ({ t }) => t.textHi },
  note: { fontSize: 12.5, fontStyle: "italic", color: ({ t }) => t.textLo },
  body: { display: "flex", flexDirection: "column", gap: 14 },
  bigCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 18px",
    borderRadius: 10,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panelAlt
  },
  bigIcon: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    flexShrink: 0
  },
  bigLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 14,
    color: ({ t }) => t.sky,
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" }
  },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint },
  // auto-fit (not auto-fill): with few items and a wide container, auto-fill
  // still lays out as many empty minmax(220px,1fr) tracks as fit, so a
  // single real item only ever occupies the first narrow track instead of
  // stretching - that's what squashed the Service panel down to a ~250px
  // column on an otherwise-empty row (2026-09-17 bug report). auto-fit
  // collapses the empty tracks so real items actually share the full width.
  serviceGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  serviceCard: {
    textAlign: "left",
    borderRadius: 8,
    border: ({ t }) => `1px solid ${t.lineSoft}`,
    backgroundColor: ({ t }) => t.panelAlt,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "pointer",
    "&:hover": { backgroundColor: ({ t }) => t.bg }
  },
  serviceCardSelected: { borderColor: ({ t }) => t.skyLine, backgroundColor: ({ t }) => t.skySoft },
  serviceName: { fontFamily: fontMono, fontWeight: 700, fontSize: 12, color: ({ t }) => t.textHi },
  serviceMeta: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  fullWidthDetail: { marginTop: 4 },
  yamlBtn: {
    alignSelf: "flex-start",
    fontFamily: fontMono,
    fontSize: 10.5,
    color: ({ t }) => t.sky,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0
  },
  strategyGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px 20px" },
  kv: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  kvLabel: { fontFamily: fontMono, fontSize: 10, lineHeight: 1.4, textTransform: "uppercase", letterSpacing: "0.04em", color: ({ t }) => t.textFaint },
  kvValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  stepsList: { display: "flex", flexDirection: "column", gap: 4 },
  stepRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
  stepIndex: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.textFaint, width: 18, flexShrink: 0 }
}));
function RouteDetail({ env, classes, t }) {
  const routeResource = findResource(env.resources, "HTTPRoute", env.appName ?? "") ?? env.resources.find((r) => r.kind === "HTTPRoute" || r.kind === "Ingress");
  const [showYaml, setShowYaml] = useState(false);
  return /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(RouterIcon, { fontSize: "small" }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Route" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.bigCard, children: [
      /* @__PURE__ */ jsx("span", { className: classes.bigIcon, style: { backgroundColor: env.ingressUrl ? t.skySoft : t.panelAlt, color: env.ingressUrl ? t.sky : t.textFaint }, children: /* @__PURE__ */ jsx(RouterIcon, { fontSize: "inherit" }) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
        env.ingressUrl ? /* @__PURE__ */ jsxs("a", { className: classes.bigLink, href: env.ingressUrl, target: "_blank", rel: "noopener noreferrer", children: [
          env.ingressUrl,
          " ",
          /* @__PURE__ */ jsx(OpenInNewIcon, { style: { fontSize: 14 } })
        ] }) : /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No external route configured for this environment." }),
        routeResource && /* @__PURE__ */ jsxs("span", { className: classes.meta, children: [
          routeResource.kind,
          " \xB7 ",
          routeResource.name
        ] })
      ] })
    ] }),
    routeResource && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: classes.yamlBtn, onMouseDown: preventFocusScroll, onClick: () => setShowYaml((v) => !v), children: showYaml ? "\u25BE hide YAML" : "\u25B8 view route YAML" }),
      showYaml && /* @__PURE__ */ jsx(YamlView, { resource: routeResource })
    ] })
  ] });
}
function ServiceDetail({ env, classes }) {
  const [selected, setSelected] = useState(env.services.length === 1 ? env.services[0].name : null);
  const [showYaml, setShowYaml] = useState(false);
  const selectedResource = selected ? findResource(env.resources, "Service", selected) : void 0;
  return /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(DeviceHubIcon, { fontSize: "small" }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Service" })
    ] }),
    env.services.length === 0 ? /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No Service resolved for this environment." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: classes.serviceGrid, children: env.services.map((svc) => {
        const isSelected = selected === svc.name;
        return /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: `${classes.serviceCard} ${isSelected ? classes.serviceCardSelected : ""}`,
            onMouseDown: preventFocusScroll,
            onClick: () => {
              setSelected(isSelected ? null : svc.name);
              setShowYaml(false);
            },
            children: [
              /* @__PURE__ */ jsx("span", { className: classes.serviceName, children: svc.name }),
              /* @__PURE__ */ jsxs("span", { className: classes.serviceMeta, children: [
                svc.type ?? "ClusterIP",
                " \xB7 ",
                svc.clusterIP ?? "\u2014"
              ] }),
              /* @__PURE__ */ jsx("span", { className: classes.serviceMeta, children: svc.ports.length ? svc.ports.map((p) => `${p.port}${p.targetPort ? `\u2192${p.targetPort}` : ""}/${p.protocol ?? "TCP"}`).join(", ") : "no ports" })
            ]
          },
          svc.name
        );
      }) }),
      selectedResource && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.yamlBtn, onMouseDown: preventFocusScroll, onClick: () => setShowYaml((v) => !v), children: showYaml ? "\u25BE hide YAML" : "\u25B8 view service YAML" }),
        showYaml && /* @__PURE__ */ jsx("div", { className: classes.fullWidthDetail, children: /* @__PURE__ */ jsx(YamlView, { resource: selectedResource }) })
      ] })
    ] })
  ] });
}
function WorkloadDetail({ env, classes }) {
  const [showYaml, setShowYaml] = useState(false);
  const workload = env.workload;
  const workloadResource = workload ? findResource(env.resources, workload.kind, workload.name) : void 0;
  const podNames = env.pods.map((p) => p.name);
  return /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(LayersIcon, { fontSize: "small" }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: workload ? `${workload.kind} \u2014 ${workload.name}` : "Workload" })
    ] }),
    !workload ? /* @__PURE__ */ jsx(Typography, { className: classes.note, children: "No Rollout or Deployment found for this environment." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: classes.strategyGrid, children: [
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Strategy" }),
          /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: env.strategy ?? "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Replicas" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            env.availableReplicas ?? "\u2014",
            " / ",
            env.desiredReplicas ?? "\u2014"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "CPU request / limit" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            env.cpuRequest ?? "\u2014",
            " / ",
            env.cpuLimit ?? "\u2014"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Memory request / limit" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            env.memoryRequest ?? "\u2014",
            " / ",
            env.memoryLimit ?? "\u2014"
          ] })
        ] }),
        workload.canaryServices && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Canary / Stable service" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            workload.canaryServices.canary ?? "\u2014",
            " / ",
            workload.canaryServices.stable ?? "\u2014"
          ] })
        ] }),
        workload.blueGreen && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Active / Preview service" }),
            /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
              workload.blueGreen.activeService ?? "\u2014",
              " / ",
              workload.blueGreen.previewService ?? "\u2014"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
            /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "Auto-promote" }),
            /* @__PURE__ */ jsx("span", { className: classes.kvValue, children: autoPromoteLabel(workload.blueGreen) })
          ] })
        ] }),
        workload.hpa && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "HPA (min / max / target CPU)" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            workload.hpa.minReplicas ?? "\u2014",
            " / ",
            workload.hpa.maxReplicas ?? "\u2014",
            " / ",
            workload.hpa.targetCpuUtilization !== void 0 ? `${workload.hpa.targetCpuUtilization}%` : "\u2014"
          ] })
        ] }),
        workload.pdb && /* @__PURE__ */ jsxs("div", { className: classes.kv, children: [
          /* @__PURE__ */ jsx("span", { className: classes.kvLabel, children: "PDB (min avail / max unavail)" }),
          /* @__PURE__ */ jsxs("span", { className: classes.kvValue, children: [
            workload.pdb.minAvailable ?? "\u2014",
            " / ",
            workload.pdb.maxUnavailable ?? "\u2014",
            workload.pdb.disruptionsAllowed !== void 0 ? ` \xB7 ${workload.pdb.disruptionsAllowed} disruption${workload.pdb.disruptionsAllowed === 1 ? "" : "s"} allowed` : ""
          ] })
        ] })
      ] }),
      workload.canaryProgress ? /* @__PURE__ */ jsx(
        CanaryRampChart,
        {
          cluster: env.cluster,
          namespace: env.namespace,
          rolloutName: workload.name,
          podHash: workload.currentPodHash,
          progress: workload.canaryProgress
        }
      ) : workload.canarySteps && workload.canarySteps.length > 0 && /* @__PURE__ */ jsx("div", { className: classes.stepsList, children: workload.canarySteps.map((step, i) => /* @__PURE__ */ jsxs("div", { className: classes.stepRow, children: [
        /* @__PURE__ */ jsx("span", { className: classes.stepIndex, children: i + 1 }),
        /* @__PURE__ */ jsx("span", { children: step.label })
      ] }, i)) }),
      /* @__PURE__ */ jsx(MetricsPanel, { cluster: env.cluster, namespace: env.namespace, podNames, title: "Workload performance" }),
      workloadResource && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: classes.yamlBtn, onMouseDown: preventFocusScroll, onClick: () => setShowYaml((v) => !v), children: showYaml ? "\u25BE hide YAML" : "\u25B8 view workload YAML" }),
        showYaml && /* @__PURE__ */ jsx(YamlView, { resource: workloadResource })
      ] })
    ] })
  ] });
}
function PodsDetail({ env, classes }) {
  return /* @__PURE__ */ jsxs("div", { className: classes.body, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.head, children: [
      /* @__PURE__ */ jsx("span", { className: classes.headIcon, children: /* @__PURE__ */ jsx(AppsIcon, { fontSize: "small" }) }),
      /* @__PURE__ */ jsx(Typography, { className: classes.title, children: "Pods" })
    ] }),
    /* @__PURE__ */ jsx(PodsPanel, { env })
  ] });
}
function TopologyStageDetail({ env, selectedKey }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (selectedKey === "route") return /* @__PURE__ */ jsx(RouteDetail, { env, classes, t });
  if (selectedKey === "service") return /* @__PURE__ */ jsx(ServiceDetail, { env, classes });
  if (selectedKey === "workload") return /* @__PURE__ */ jsx(WorkloadDetail, { env, classes });
  return /* @__PURE__ */ jsx(PodsDetail, { env, classes });
}

export { TopologyStageDetail };
//# sourceMappingURL=StageDetail.esm.js.map
