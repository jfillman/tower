import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { Button, TextLink } from '../../ui/index.esm.js';

const useStyles = makeStyles(() => ({
  card: {
    border: ({ t }) => `1px solid ${t.line}`,
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 14,
    backgroundColor: ({ t }) => t.panel,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  title: { fontWeight: 700, fontSize: 14, color: ({ t }) => t.textHi },
  note: { fontSize: 12, color: ({ t }) => t.textLo, lineHeight: 1.5 },
  pkg: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi },
  row: { display: "grid", gridTemplateColumns: "64px minmax(140px, 220px) 1fr", gap: 8, fontSize: 12, alignItems: "baseline" },
  del: { fontFamily: fontMono, fontSize: 10.5, fontWeight: 700, color: ({ t }) => t.bad },
  keep: { fontFamily: fontMono, fontSize: 10.5, color: ({ t }) => t.textFaint },
  mono: { fontFamily: fontMono, fontSize: 11.5 },
  reasons: { color: ({ t }) => t.textLo },
  confirm: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 6,
    backgroundColor: ({ t }) => t.amberSoft,
    color: ({ t }) => t.amberInk,
    fontSize: 12
  },
  bad: { fontSize: 12, fontStyle: "italic", color: ({ t }) => t.bad },
  ok: { fontSize: 12, color: ({ t }) => t.good }
}));
function pruneBlocker(plan) {
  if (!plan.allowed) return "Only the app's owning team (or an admin) can delete its images.";
  if (!plan.configured) return "Pruning is not configured on this Backstage (GHCR_PRUNE_TOKEN is unset): the plan is shown, nothing can be deleted.";
  if (plan.deleteCount === 0) return "Nothing to delete.";
  return void 0;
}
function ImageCleanup({ owner, appName }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [plan, setPlan] = useState();
  const [busy, setBusy] = useState();
  const [error, setError] = useState();
  const [note, setNote] = useState();
  const [confirming, setConfirming] = useState(false);
  const [showKept, setShowKept] = useState(false);
  const [result, setResult] = useState();
  const loadPlan = async (refresh = false) => {
    setBusy("plan");
    setError(void 0);
    setNote(void 0);
    setResult(void 0);
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const q = new URLSearchParams({ owner, appName, ...refresh ? { refresh: "true" } : {} });
      const res = await fetchApi.fetch(`${base}/images/prune-plan?${q}`);
      const body = await res.json().catch(() => void 0);
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setPlan(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(void 0);
    }
  };
  const prune = async () => {
    if (!plan) return;
    setConfirming(false);
    setBusy("prune");
    setError(void 0);
    try {
      const base = await discoveryApi.getBaseUrl("glidepath");
      const res = await fetchApi.fetch(`${base}/images/prune`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, appName, planHash: plan.hash })
      });
      const body = await res.json().catch(() => void 0);
      if (res.status === 409 && body?.plan) {
        setPlan({ ...body.plan, allowed: plan.allowed });
        setNote(body.error);
        return;
      }
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setResult(body);
      setPlan(void 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(void 0);
    }
  };
  const blocker = plan ? pruneBlocker(plan) : void 0;
  let planLabel = plan ? "Plan again" : "Show what would be deleted";
  if (busy === "plan") planLabel = "Planning\u2026";
  const releases = plan?.packages.filter((p) => p.kind !== "cache") ?? [];
  const caches = plan?.packages.filter((p) => p.kind === "cache") ?? [];
  return /* @__PURE__ */ jsxs("div", { className: c.card, "data-testid": "image-cleanup", children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsx("span", { className: c.title, children: "Clean up old images" }),
      /* @__PURE__ */ jsx(Button, { small: true, disabled: !!busy, onClick: () => loadPlan(!!plan), children: planLabel })
    ] }),
    !plan && !result && /* @__PURE__ */ jsxs("span", { className: c.note, children: [
      "Deletes this app's old images from the registry (",
      appName,
      ", ",
      appName,
      "-pr and the build cache), never one that is running, that an old ReplicaSet could scale back to, that git or an open PR names, or that is in an environment's last five healthy releases. You see the plan first."
    ] }),
    plan && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("span", { className: c.note, children: [
        "Also kept: anything younger than ",
        plan.rules.minAgeDays,
        " days, and the ",
        plan.rules.keepNewest,
        " newest builds (build cache: the ",
        plan.rules.keepNewestCache,
        " newest layers)."
      ] }),
      releases.map((p) => {
        const del = p.decisions.filter((d) => !d.keep);
        const kept = p.decisions.filter((d) => d.keep);
        return /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs("span", { className: c.pkg, children: [
            p.name,
            ": ",
            p.decisions.length,
            " releases (",
            p.totalVersions,
            " versions), delete ",
            del.length,
            " (",
            p.deleteIds.length,
            " versions)"
          ] }),
          del.map((d) => /* @__PURE__ */ jsxs("div", { className: c.row, children: [
            /* @__PURE__ */ jsx("span", { className: c.del, children: "DELETE" }),
            /* @__PURE__ */ jsx("span", { className: c.mono, children: d.key }),
            /* @__PURE__ */ jsxs("span", { className: c.reasons, children: [
              "built ",
              relativeTime(d.createdAt),
              "; nothing uses it"
            ] })
          ] }, d.key)),
          showKept && kept.map((d) => /* @__PURE__ */ jsxs("div", { className: c.row, children: [
            /* @__PURE__ */ jsx("span", { className: c.keep, children: "keep" }),
            /* @__PURE__ */ jsx("span", { className: c.mono, children: d.key }),
            /* @__PURE__ */ jsx("span", { className: c.reasons, children: d.reasons.join("; ") })
          ] }, d.key)),
          p.unattributed > 0 && /* @__PURE__ */ jsxs("span", { className: c.note, children: [
            p.unattributed,
            " untagged versions no release claims are kept."
          ] })
        ] }, p.name);
      }),
      caches.map((p) => /* @__PURE__ */ jsxs("span", { className: c.pkg, children: [
        p.name,
        ": delete ",
        p.deleteIds.length,
        " of ",
        p.totalVersions,
        " cache layers"
      ] }, p.name)),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextLink, { expanded: showKept, onClick: () => setShowKept((v) => !v), children: "Why each kept release is kept" }) }),
      /* @__PURE__ */ jsxs("div", { className: c.head, children: [
        /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", disabled: !!busy || !!blocker, title: blocker, onClick: () => setConfirming(true), children: busy === "prune" ? "Deleting\u2026" : `Delete ${plan.deleteCount} versions` }),
        blocker && /* @__PURE__ */ jsx("span", { className: c.note, children: blocker })
      ] }),
      confirming && /* @__PURE__ */ jsxs("div", { className: c.confirm, "data-testid": "prune-confirm", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "Delete ",
          plan.deleteCount,
          " package versions from ghcr.io/",
          owner,
          "? This cannot be undone; a release deleted here can only come back by building it again."
        ] }),
        /* @__PURE__ */ jsx(Button, { small: true, variant: "danger", onClick: prune, children: "Delete" }),
        /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setConfirming(false), children: "Cancel" })
      ] })
    ] }),
    note && /* @__PURE__ */ jsx("span", { className: c.bad, children: note }),
    error && /* @__PURE__ */ jsx("span", { className: c.bad, children: error }),
    result && /* @__PURE__ */ jsxs("span", { className: result.failed.length ? c.bad : c.ok, children: [
      "Deleted ",
      result.deleted,
      " versions",
      result.failed.length ? `; ${result.failed.length} failed (${result.failed[0].error})` : "",
      result.remaining ? `; ${result.remaining} more remain, plan again to continue` : "",
      "."
    ] })
  ] });
}

export { ImageCleanup, pruneBlocker };
//# sourceMappingURL=ImageCleanup.esm.js.map
