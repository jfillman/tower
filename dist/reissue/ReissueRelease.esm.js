import { jsx, jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { StatusChip, Chip, Button, Hint, Callout } from '../ui/index.esm.js';
import { PrRef } from '../ui/PrRef.esm.js';
import { reissueDisabledReason, tagOf, postReissue } from './reissue.esm.js';
import { ActionReason } from '../ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  stack: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  entryBox: { display: "flex", flexDirection: "column", gap: 6, padding: "8px 12px", borderRadius: 6, border: ({ t }) => `1px solid ${t.line}`, backgroundColor: ({ t }) => t.panel },
  head: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  grow: { flex: 1, minWidth: 0 },
  mono: { fontFamily: fontMono, fontSize: 11 },
  confirm: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }
}));
function ReissueConfirm({
  owner,
  appName,
  entry,
  onDone,
  onCancel
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const submit = async () => {
    setBusy(true);
    setError(void 0);
    try {
      onDone(await postReissue(discoveryApi, fetchApi, owner, appName, entry.chainId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { "data-testid": "reissue-confirm", children: [
    /* @__PURE__ */ jsxs("div", { className: c.confirm, children: [
      /* @__PURE__ */ jsxs(Hint, { children: [
        "Open a fresh release PR for ",
        /* @__PURE__ */ jsx("span", { className: c.mono, children: tagOf(entry.image) }),
        " on ",
        entry.env,
        "? It is cut from the gitops repository's current default branch with the same image and commit; the closed PR is not reopened, and every check runs again."
      ] }),
      /* @__PURE__ */ jsx(Button, { small: true, variant: "primary", disabled: busy, onClick: submit, children: busy ? "Reissuing\u2026" : "Open fresh release PR" }),
      /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: onCancel, children: "Cancel" })
    ] }),
    error && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: error })
  ] });
}
function ReissuePanel({
  owner,
  appName,
  releases,
  allowed,
  onStarted
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [asking, setAsking] = useState();
  if (releases.length === 0) return null;
  return /* @__PURE__ */ jsx("div", { className: c.stack, "aria-label": "Release PRs closed without merging", children: releases.map((entry) => {
    const reason = reissueDisabledReason(entry, allowed);
    const reasonId = `reissue-reason-${entry.chainId}`;
    return /* @__PURE__ */ jsxs("div", { className: c.entryBox, "data-testid": "reissue-row", children: [
      /* @__PURE__ */ jsxs("div", { className: c.head, children: [
        /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "PR closed, not merged" }),
        /* @__PURE__ */ jsx(Chip, { tone: "flight", children: entry.env }),
        /* @__PURE__ */ jsx("span", { className: `${c.grow} ${c.mono}`, children: tagOf(entry.image) }),
        /* @__PURE__ */ jsx(PrRef, { pr: { url: entry.prUrl, state: "closed" }, size: "inline" }),
        /* @__PURE__ */ jsx(Button, { small: true, disabled: Boolean(reason), "aria-describedby": reason ? reasonId : void 0, onClick: () => setAsking(entry.chainId), children: "Reissue release PR" })
      ] }),
      reason && /* @__PURE__ */ jsx(ActionReason, { id: reasonId, children: reason }),
      !reason && asking === entry.chainId && /* @__PURE__ */ jsx(
        ReissueConfirm,
        {
          owner,
          appName,
          entry,
          onCancel: () => setAsking(void 0),
          onDone: (started) => {
            setAsking(void 0);
            onStarted(entry, started);
          }
        }
      )
    ] }, entry.chainId);
  }) });
}

export { ReissueConfirm, ReissuePanel };
//# sourceMappingURL=ReissueRelease.esm.js.map
