import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { buildEnvironmentRows } from '../environmentRows.esm.js';
import { readEnvironments, applyStaged, describeChanges, addedFlightEnvs, validateEnvironments, validateAddedFlight, validateRemovals, planReleaseSteps, releaseStepEnvs, followUps, deleteFilesFor, pipelinesNamingEnv, envFilePaths, stageSetBlock, buildDeploy } from '../environments/stagedChanges.esm.js';
import { useLaunchApplicationEnvironment } from '../environments/applicationEnvironment.esm.js';
import { DEPLOY_TARGETS } from '../serviceClass.esm.js';
import { relativeTime, formatDateTime } from '../shared/format.esm.js';
import { useCicdConfig, useSubmitCicdConfigChange } from '../useConfigData.esm.js';
import { useReleaseContext } from '../useReleaseContext.esm.js';
import { PageHeader, Button, Segmented, Panel, ColumnLabel, Chip, TierChip, HEALTH_LABEL, StatusDot, IconButton } from '../ui/index.esm.js';
import { AddEnvironmentDialog, RemoveEnvironmentDialog, ChangeResultDialog } from './environments/dialogs.esm.js';
import { PendingChanges } from './environments/PendingChanges.esm.js';
import { RowDetail } from './environments/RowDetail.esm.js';
import { same, TARGET_BLOCK } from './environments/shared.esm.js';

const COLUMNS = "20px 120px 80px 110px 100px 90px minmax(0, 1fr) 36px";
const useStyles = makeStyles(() => ({
  wrap: { padding: "20px 24px 40px", maxWidth: 1380 },
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 350px", gap: 18, alignItems: "start" },
  main: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
  toolbar: { display: "flex", gap: 10, alignItems: "center" },
  hint: { color: ({ t }) => t.textLo, fontSize: 12.5 },
  scroll: { overflowX: "auto" },
  table: { minWidth: 760 },
  headRow: { display: "grid", gridTemplateColumns: COLUMNS, gap: 10, padding: "9px 14px", borderLeft: "3px solid transparent" },
  row: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    gap: 10,
    alignItems: "center",
    padding: "11px 14px",
    borderTop: ({ t }) => `1px solid ${t.line}`,
    borderLeft: "3px solid transparent"
  },
  rowClickable: { cursor: "pointer", "&:hover": { backgroundColor: ({ t }) => t.panelAlt } },
  rowOpen: { backgroundColor: ({ t }) => t.panelAlt },
  rowNew: { backgroundColor: ({ t }) => t.panelAlt, borderLeftColor: ({ t }) => t.good },
  rowEdited: { backgroundColor: ({ t }) => t.panelAlt, borderLeftColor: ({ t }) => t.amber },
  rowRemoved: { borderLeftColor: ({ t }) => t.bad },
  rowDragOver: { boxShadow: ({ t }) => `inset 0 2px 0 ${t.amber}` },
  grip: {
    color: ({ t }) => t.textLo,
    letterSpacing: "-2px",
    fontFamily: fontMono,
    fontWeight: 700,
    fontSize: 12,
    cursor: "grab",
    userSelect: "none"
  },
  nameCell: { display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" },
  name: { fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: ({ t }) => t.textHi },
  nameRemoved: { textDecoration: "line-through", color: ({ t }) => t.textLo },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  health: { display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 },
  empty: { padding: 24, color: ({ t }) => t.textLo, textAlign: "center", fontSize: 13 }
}));
const STATE_CLASS = { new: "rowNew", edited: "rowEdited", removed: "rowRemoved" };
const STATE_TONE = { new: "ok", edited: "flight", removed: "bad" };
const STATE_LABEL = { new: "new", edited: "edit", removed: "remove" };
function EnvironmentsTab() {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const { environments, pipelineOrder, loading, error, owner, appName } = useReleaseContext();
  const [searchParams] = useSearchParams();
  const [nonce, setNonce] = useState(0);
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : void 0, nonce);
  const submit = useSubmitCicdConfigChange();
  const launcher = useLaunchApplicationEnvironment();
  const [phase, setPhase] = useState("idle");
  const [launched, setLaunched] = useState({});
  const [failure, setFailure] = useState();
  const [staged, setStaged] = useState([]);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState();
  const [removing, setRemoving] = useState();
  const [filter, setFilter] = useState("all");
  const [menu, setMenu] = useState();
  const [dragging, setDragging] = useState();
  const [dragOver, setDragOver] = useState();
  const liveRows = useMemo(
    () => buildEnvironmentRows(environments, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
    [environments, pipelineOrder.lower, pipelineOrder.upper]
  );
  const deploy = cicd.data?.values.deploy;
  const pipelines = cicd.data?.values?.pipelines;
  const canEdit = Boolean(cicd.data && owner && appName);
  const targetId = typeof deploy?.target === "string" && deploy.target || "k8s-rollout";
  const cloudBlock = TARGET_BLOCK[targetId];
  const targetLabel = DEPLOY_TARGETS[targetId]?.label ?? targetId;
  const { shape, envs: before } = useMemo(() => readEnvironments(deploy), [deploy]);
  const after = useMemo(() => applyStaged(before, staged), [before, staged]);
  const envChanges = useMemo(() => describeChanges(before, after, shape), [before, after, shape]);
  const flightAdds = useMemo(() => addedFlightEnvs(before, after), [before, after]);
  const problems = useMemo(
    () => [
      ...validateEnvironments(after, targetId),
      ...validateAddedFlight(before, after, targetId),
      ...validateRemovals(before, after, pipelines)
    ],
    [before, after, targetId, pipelines]
  );
  const releasePlan = useMemo(() => planReleaseSteps(pipelines, after, releaseStepEnvs(staged, after)), [pipelines, after, staged]);
  const releaseLines = useMemo(
    () => releasePlan.added.map((a) => ({
      kind: "edit",
      title: `Add a release step for ${a.env}`,
      detail: `pipeline ${a.pipeline}${a.after ? `, after the step for ${a.after}` : ", at the end"}`
    })),
    [releasePlan]
  );
  const changes = useMemo(() => [...envChanges, ...releaseLines], [envChanges, releaseLines]);
  const notes = useMemo(
    () => [
      ...followUps(before, after, targetId, appName),
      ...releasePlan.skipped.map((k) => `No release step added for ${k.env}: ${k.reason}.`)
    ],
    [before, after, targetId, appName, releasePlan]
  );
  const deleteFiles = useMemo(() => deleteFilesFor(before, after, targetId), [before, after, targetId]);
  const rows = useMemo(() => {
    const live = new Map(liveRows.map((r) => [r.name, r]));
    if (!canEdit) return liveRows.map((r) => ({ ...r }));
    const beforeBy = new Map(before.map((e) => [e.name, e]));
    const toRow = (def, state) => {
      const l = live.get(def.name);
      return {
        name: def.name,
        tier: def.tier,
        target: l?.target ?? targetLabel,
        where: l?.where ?? "\u2014",
        health: l?.health ?? "unknown",
        deployed: l?.deployed ?? false,
        image: l?.image,
        deployedAt: l?.deployedAt,
        def,
        state
      };
    };
    const out = after.map((def) => {
      const prior = beforeBy.get(def.name);
      let state;
      if (!prior) state = "new";
      else if (!same(prior, def)) state = "edited";
      return toRow(def, state);
    });
    before.forEach((def, i) => {
      if (after.some((e) => e.name === def.name)) return;
      let at = 0;
      for (let k = i - 1; k >= 0; k--) {
        const idx = out.findIndex((r) => r.name === before[k].name);
        if (idx !== -1) {
          at = idx + 1;
          break;
        }
      }
      out.splice(at, 0, toRow(def, "removed"));
    });
    for (const r of liveRows) if (!out.some((o) => o.name === r.name)) out.push({ ...r });
    return out;
  }, [canEdit, liveRows, before, after, targetLabel]);
  if (loading && rows.length === 0) return /* @__PURE__ */ jsx(Progress, {});
  if (error && rows.length === 0) return /* @__PURE__ */ jsx(ResponseErrorPanel, { error: new Error(String(error)) });
  const isCloudRow = (r) => r.target !== "Kubernetes" || Boolean(cloudBlock);
  const counts = {
    all: rows.length,
    ground: rows.filter((r) => r.tier === "ground").length,
    flight: rows.filter((r) => r.tier === "flight").length,
    cloud: rows.filter(isCloudRow).length
  };
  const shown = rows.filter((r) => filter === "all" || (filter === "cloud" ? isCloudRow(r) : r.tier === filter));
  const move = (name, direction) => setStaged((s) => [...s, { kind: "move", name, direction }]);
  const canMove = (name, direction) => {
    const i = after.findIndex((e) => e.name === name);
    const j = i + (direction === "up" ? -1 : 1);
    return i !== -1 && Boolean(after[j]) && after[j].tier === after[i].tier;
  };
  const canEditRow = (r) => canEdit && Boolean(r.def);
  const movable = (r) => canEditRow(r) && r.def?.tier === "ground" && r.state !== "removed" && (canMove(r.name, "up") || canMove(r.name, "down"));
  const dropOn = (target) => {
    const from = dragging;
    setDragging(void 0);
    setDragOver(void 0);
    if (!from || from === target) return;
    const i = after.findIndex((e) => e.name === from);
    const j = after.findIndex((e) => e.name === target);
    if (i === -1 || j === -1 || after[i].tier !== after[j].tier) return;
    const direction = j > i ? "down" : "up";
    setStaged((s) => [...s, ...Array.from({ length: Math.abs(j - i) }, () => ({ kind: "move", name: from, direction }))]);
  };
  const stageRemove = (name) => {
    if (before.some((e) => e.name === name)) setStaged((s) => [...s, { kind: "remove", name }]);
    else setStaged((s) => s.filter((x) => !("env" in x && x.env.name === name) && !("name" in x && x.name === name)));
    setRemoving(void 0);
    setOpen(void 0);
  };
  const undoRemove = (name) => setStaged((s) => s.filter((x) => !(x.kind === "remove" && x.name === name)));
  const setField = (env, block, field, value) => {
    const current = { ...env[block] ?? {} };
    if (value.trim()) current[field] = value;
    else delete current[field];
    setStaged((s) => stageSetBlock(s, env.name, block, current));
  };
  const openPr = async () => {
    if (!owner || !appName) return;
    setFailure(void 0);
    const done = { ...launched };
    for (const e of flightAdds) {
      if (done[e.name]) continue;
      setPhase("launching");
      const r = await launcher.launch({ appName, env: e.name, cluster: e.cluster });
      if (r.status !== "done") {
        setLaunched(done);
        setPhase("idle");
        setFailure(
          `Creating ${e.name} failed: ${r.status === "failed" ? r.error : "the request did not finish"}. Nothing was changed in cicd.yaml.`
        );
        return;
      }
      done[e.name] = r.prUrl;
    }
    setLaunched(done);
    setPhase("submitting");
    await submit.submit({
      owner,
      appName,
      patch: { deploy: buildDeploy(deploy, after), ...releasePlan.added.length > 0 ? { pipelines: releasePlan.pipelines } : {} },
      summary: changes.map((l) => l.title),
      ...deleteFiles.length > 0 ? { deleteFiles } : {}
    });
    setPhase("idle");
  };
  const closeResult = () => {
    const succeeded = Boolean(submit.result);
    submit.reset();
    setFailure(void 0);
    if (succeeded) {
      setStaged([]);
      setLaunched({});
      setNonce((n) => n + 1);
    }
  };
  const detailCtx = {
    owner,
    appName,
    entity: searchParams.get("entity") ?? "",
    deploy,
    pipelines,
    targetLabel,
    cloudBlock,
    onSetField: setField,
    onRemove: setRemoving,
    onUndoRemove: undoRemove
  };
  const menuRow = menu ? rows.find((r) => r.name === menu.name) : void 0;
  const closeMenu = () => setMenu(void 0);
  const menuGround = menuRow?.def?.tier === "ground" && menuRow.state !== "removed";
  return /* @__PURE__ */ jsxs("div", { className: c.wrap, children: [
    /* @__PURE__ */ jsx(
      PageHeader,
      {
        title: "Environments",
        subtitle: canEdit ? "Edit in the table. Changes stage on the right, then open together." : "Every environment of this service, in promotion order.",
        actions: canEdit && /* @__PURE__ */ jsx(Button, { variant: "primary", onClick: () => setAdding(true), children: "Add environment" })
      }
    ),
    !canEdit && /* @__PURE__ */ jsx("div", { className: c.hint, style: { marginBottom: 12 }, children: "Read-only: this service has no cicd.yaml Tower can edit. Change the list and its order in the Glidepath tab; Flight environment values are in App Configuration." }),
    /* @__PURE__ */ jsxs("div", { className: canEdit ? c.layout : void 0, children: [
      /* @__PURE__ */ jsxs("div", { className: c.main, children: [
        /* @__PURE__ */ jsxs("div", { className: c.toolbar, children: [
          /* @__PURE__ */ jsx(
            Segmented,
            {
              label: "Filter environments",
              value: filter,
              onChange: setFilter,
              options: [
                { id: "all", label: "All", count: counts.all },
                { id: "ground", label: "Ground", count: counts.ground },
                { id: "flight", label: "Flight", count: counts.flight },
                { id: "cloud", label: "Cloud", count: counts.cloud }
              ]
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { flex: 1 } }),
          canEdit && /* @__PURE__ */ jsx("span", { className: c.hint, children: "Drag the handle to reorder" })
        ] }),
        /* @__PURE__ */ jsx(Panel, { children: shown.length === 0 ? /* @__PURE__ */ jsx("div", { className: c.empty, children: rows.length === 0 ? "No environments yet. They appear here once the service declares or deploys to one." : "No environments match this filter." }) : /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("div", { className: c.table, role: "table", "aria-label": "Environments", children: [
          /* @__PURE__ */ jsxs("div", { className: c.headRow, role: "row", children: [
            /* @__PURE__ */ jsx("span", { role: "presentation" }),
            ["Environment", "Tier", "Target", "Where", "Health", "Live image"].map((h) => /* @__PURE__ */ jsx("span", { role: "columnheader", children: /* @__PURE__ */ jsx(ColumnLabel, { children: h }) }, h)),
            /* @__PURE__ */ jsx("span", { role: "presentation" })
          ] }),
          shown.map((r) => {
            const editable = canEditRow(r);
            const isOpen = open === r.name;
            const stateClass = r.state ? c[STATE_CLASS[r.state]] : "";
            const rowClass = [c.row, editable && c.rowClickable, isOpen && c.rowOpen, stateClass, dragOver === r.name && c.rowDragOver].filter(Boolean).join(" ");
            return /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsxs(
                "div",
                {
                  role: "row",
                  className: rowClass,
                  onClick: editable ? () => setOpen(isOpen ? void 0 : r.name) : void 0,
                  onDragOver: dragging && dragging !== r.name ? (e) => {
                    e.preventDefault();
                    setDragOver(r.name);
                  } : void 0,
                  onDrop: dragging ? (e) => {
                    e.preventDefault();
                    dropOn(r.name);
                  } : void 0,
                  children: [
                    /* @__PURE__ */ jsx("span", { role: "cell", children: movable(r) && /* @__PURE__ */ jsx(
                      "span",
                      {
                        className: c.grip,
                        role: "img",
                        "aria-label": `Drag ${r.name} to reorder`,
                        draggable: true,
                        onClick: (e) => e.stopPropagation(),
                        onDragStart: (e) => {
                          e.dataTransfer?.setData("text/plain", r.name);
                          setDragging(r.name);
                        },
                        onDragEnd: () => {
                          setDragging(void 0);
                          setDragOver(void 0);
                        },
                        children: "::"
                      }
                    ) }),
                    /* @__PURE__ */ jsxs("span", { role: "cell", className: c.nameCell, children: [
                      /* @__PURE__ */ jsx("b", { className: `${c.name} ${r.state === "removed" ? c.nameRemoved : ""}`, children: r.name }),
                      r.state && /* @__PURE__ */ jsxs(Chip, { tone: STATE_TONE[r.state], children: [
                        "staged: ",
                        STATE_LABEL[r.state]
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx("span", { role: "cell", children: /* @__PURE__ */ jsx(TierChip, { tier: r.tier }) }),
                    /* @__PURE__ */ jsx("span", { role: "cell", children: r.target }),
                    /* @__PURE__ */ jsx("span", { role: "cell", className: c.mono, children: r.where }),
                    /* @__PURE__ */ jsxs("span", { role: "cell", className: c.health, children: [
                      /* @__PURE__ */ jsx(StatusDot, { health: r.health }),
                      HEALTH_LABEL[r.health]
                    ] }),
                    /* @__PURE__ */ jsxs("span", { role: "cell", className: c.mono, children: [
                      r.deployed ? r.image : "not deployed yet",
                      r.deployedAt && /* @__PURE__ */ jsxs(Fragment, { children: [
                        "  ",
                        /* @__PURE__ */ jsx("span", { title: formatDateTime(r.deployedAt), children: relativeTime(r.deployedAt) })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx("span", { role: "cell", onClick: (e) => e.stopPropagation(), children: editable && /* @__PURE__ */ jsx(
                      IconButton,
                      {
                        "aria-label": `Actions for ${r.name}`,
                        "aria-haspopup": "menu",
                        onClick: (e) => setMenu({ name: r.name, el: e.currentTarget }),
                        children: isOpen ? "v" : "..."
                      }
                    ) })
                  ]
                }
              ),
              isOpen && r.def && /* @__PURE__ */ jsx(RowDetail, { row: r, ctx: detailCtx })
            ] }, r.name);
          })
        ] }) }) })
      ] }),
      canEdit && /* @__PURE__ */ jsx(
        PendingChanges,
        {
          changes,
          problems,
          notes,
          flightAdds,
          launched,
          owner,
          appName,
          deleteFiles,
          phase,
          onDiscard: () => setStaged([]),
          onOpen: openPr
        }
      )
    ] }),
    /* @__PURE__ */ jsxs(Menu, { anchorEl: menu?.el, open: Boolean(menu && menuRow), onClose: closeMenu, children: [
      /* @__PURE__ */ jsx(
        MenuItem,
        {
          onClick: () => {
            if (menuRow) setOpen(open === menuRow.name ? void 0 : menuRow.name);
            closeMenu();
          },
          children: menuRow && open === menuRow.name ? "Close details" : "Edit details"
        }
      ),
      menuGround && /* @__PURE__ */ jsx(
        MenuItem,
        {
          disabled: !menuRow || !canMove(menuRow.name, "up"),
          onClick: () => {
            if (menuRow) move(menuRow.name, "up");
            closeMenu();
          },
          children: "Move earlier"
        }
      ),
      menuGround && /* @__PURE__ */ jsx(
        MenuItem,
        {
          disabled: !menuRow || !canMove(menuRow.name, "down"),
          onClick: () => {
            if (menuRow) move(menuRow.name, "down");
            closeMenu();
          },
          children: "Move later"
        }
      ),
      menuRow?.state === "removed" && /* @__PURE__ */ jsx(
        MenuItem,
        {
          onClick: () => {
            undoRemove(menuRow.name);
            closeMenu();
          },
          children: "Undo removal"
        }
      ),
      menuGround && /* @__PURE__ */ jsx(
        MenuItem,
        {
          onClick: () => {
            if (menuRow) setRemoving(menuRow.name);
            closeMenu();
          },
          children: "Remove\u2026"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      AddEnvironmentDialog,
      {
        open: adding,
        onClose: () => setAdding(false),
        current: after,
        problems,
        targetId,
        targetLabel,
        cloudBlock,
        onStage: (env, releaseStep) => {
          setStaged((s) => [...s, { kind: "add", env, releaseStep }]);
          setAdding(false);
        }
      }
    ),
    removing && /* @__PURE__ */ jsx(
      RemoveEnvironmentDialog,
      {
        name: removing,
        appName,
        cloud: Boolean(cloudBlock),
        files: envFilePaths(removing),
        blockedBy: pipelinesNamingEnv(pipelines, removing),
        onCancel: () => setRemoving(void 0),
        onConfirm: () => stageRemove(removing)
      }
    ),
    (submit.result || submit.error || failure) && /* @__PURE__ */ jsx(
      ChangeResultDialog,
      {
        requests: flightAdds.filter((e) => launched[e.name]).map((e) => ({ env: e.name, url: launched[e.name] })),
        cicdPrUrl: submit.result?.prUrl,
        error: failure ?? submit.error,
        onClose: closeResult
      }
    )
  ] });
}

export { EnvironmentsTab };
//# sourceMappingURL=EnvironmentsTab.esm.js.map
