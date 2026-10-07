import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useMemo, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from '../../brand/tokens.esm.js';
import { usePinState, useSubmitPin, promoteCandidates, rollbackCandidate } from '../../environments/releasePins.esm.js';
import { relativeTime } from '../../shared/format.esm.js';
import { SectionLabel, Panel, TierChip, Chip, Button } from '../../ui/index.esm.js';
import { useUi } from '../../ui/styles.esm.js';

const useStyles = makeStyles(() => ({
  row: { padding: 14, display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  name: { fontWeight: 600, fontSize: 15, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo, overflowWrap: "anywhere" },
  pinned: { fontFamily: fontMono, fontSize: 14, color: ({ t }) => t.textHi },
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  select: {
    fontFamily: fontMono,
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 4,
    maxWidth: "100%",
    backgroundColor: ({ t }) => t.panelAlt,
    color: ({ t }) => t.textHi,
    border: ({ t }) => `1px solid ${t.line}`
  },
  ok: { fontSize: 12.5, color: ({ t }) => t.good },
  bad: { fontSize: 12.5, color: ({ t }) => t.bad }
}));
function FlightPins({ owner, appName, flight, deploys }) {
  const ui = useUi({ t: useHangarTokens() });
  if (flight.length === 0) return null;
  return /* @__PURE__ */ jsxs("div", { style: { marginTop: 20 }, children: [
    /* @__PURE__ */ jsx(SectionLabel, { children: "Flight environments" }),
    /* @__PURE__ */ jsx("div", { className: ui.note, style: { margin: "6px 0 10px" }, children: "A Flight environment deploys only a pinned image. Promote and Roll back open a pull request that changes its pin; merging it is the approval, and Glidepath then deploys exactly that image." }),
    flight.map((f) => /* @__PURE__ */ jsx(FlightPinRow, { owner, appName, env: f.name, previous: f.previous, deploys }, f.name))
  ] });
}
function FlightPinRow({
  owner,
  appName,
  env,
  previous,
  deploys
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const [nonce, setNonce] = useState(0);
  const pin = usePinState({ owner, appName, env }, nonce);
  const submit = useSubmitPin();
  const candidates = useMemo(() => promoteCandidates(deploys, previous), [deploys, previous]);
  const [image, setImage] = useState("");
  const [confirmRollback, setConfirmRollback] = useState(false);
  useEffect(() => {
    if (!image && candidates[0]) setImage(candidates[0].image);
  }, [candidates, image]);
  const state = pin.data;
  const current = state?.current;
  const back = rollbackCandidate(state);
  const busy = submit.loading;
  const run = async (body) => {
    setConfirmRollback(false);
    const r = await submit.submit({ owner, appName, env, ...body });
    if (r) setNonce((n) => n + 1);
  };
  return /* @__PURE__ */ jsxs(Panel, { className: c.row, children: [
    /* @__PURE__ */ jsxs("div", { className: c.head, children: [
      /* @__PURE__ */ jsx("span", { className: c.name, children: env }),
      /* @__PURE__ */ jsx(TierChip, { tier: "flight" }),
      /* @__PURE__ */ jsx("span", { className: c.mono, children: state?.path ?? `glidepath/releases/${env}.yaml` }),
      state?.openPr && /* @__PURE__ */ jsx("a", { href: state.openPr.url, target: "_blank", rel: "noreferrer", children: /* @__PURE__ */ jsx(Chip, { tone: "flight", children: "pin PR open \u2197" }) })
    ] }),
    pin.error && /* @__PURE__ */ jsxs("div", { className: c.bad, children: [
      "Could not read the pin: ",
      pin.error
    ] }),
    !pin.error && pin.loading && !state && /* @__PURE__ */ jsx("div", { className: ui.note, children: "Reading the pin\u2026" }),
    state && (current ? /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { className: c.pinned, children: current.tag }),
      /* @__PURE__ */ jsxs("div", { className: c.mono, children: [
        current.digest.slice(0, 19),
        "\u2026",
        current.promotedFrom ? ` \xB7 from ${current.promotedFrom}` : "",
        state.history[0]?.date ? ` \xB7 pinned ${relativeTime(new Date(state.history[0].date))}` : ""
      ] })
    ] }) : /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
      "Nothing pinned yet: ",
      env,
      " has never been released."
    ] })),
    /* @__PURE__ */ jsxs("div", { className: c.actions, children: [
      candidates.length > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          "select",
          {
            "aria-label": `Image to promote to ${env}`,
            className: c.select,
            value: image,
            onChange: (e) => setImage(e.target.value),
            children: candidates.map((o) => /* @__PURE__ */ jsx("option", { value: o.image, children: o.label }, o.image))
          }
        ),
        /* @__PURE__ */ jsxs(
          Button,
          {
            variant: "primary",
            disabled: busy || !image,
            onClick: () => run({ image, promotedFrom: deploys.find((d) => d.imageRef === image)?.env ?? previous }),
            children: [
              "Promote to ",
              env
            ]
          }
        )
      ] }) : /* @__PURE__ */ jsx("span", { className: ui.note, children: "No built image to promote yet." }),
      back?.pin && (confirmRollback ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("span", { className: ui.note, children: [
          "Open a pull request pinning ",
          env,
          " back to ",
          back.pin.tag,
          "?"
        ] }),
        /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: busy, onClick: () => run({ rollbackTo: back.sha }), children: "Open rollback PR" }),
        /* @__PURE__ */ jsx(Button, { onClick: () => setConfirmRollback(false), children: "Cancel" })
      ] }) : /* @__PURE__ */ jsxs(Button, { variant: "danger", disabled: busy, onClick: () => setConfirmRollback(true), children: [
        "Roll back to ",
        back.pin.tag
      ] }))
    ] }),
    submit.error && /* @__PURE__ */ jsx("div", { className: c.bad, children: submit.error }),
    submit.result && (submit.result.unchanged ? /* @__PURE__ */ jsxs("div", { className: ui.note, children: [
      env,
      " is already pinned to ",
      submit.result.pin.tag,
      "; no pull request needed."
    ] }) : /* @__PURE__ */ jsxs("div", { className: c.ok, children: [
      submit.result.alreadyOpen ? "Updated the open pin PR" : "Opened a pin PR",
      " for ",
      submit.result.pin.tag,
      ":",
      " ",
      /* @__PURE__ */ jsx("a", { href: submit.result.prUrl, target: "_blank", rel: "noreferrer", children: submit.result.prUrl }),
      ". Merge it to deploy."
    ] }))
  ] });
}

export { FlightPins };
//# sourceMappingURL=FlightPins.esm.js.map
