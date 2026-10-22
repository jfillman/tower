import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useRef, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import GitHubIcon from '@material-ui/icons/GitHub';
import { githubAuthApiRef, useApiHolder, useAnalytics } from '@backstage/core-plugin-api';
import { ProxiedSignInPage, UserIdentity } from '@backstage/core-components';
import { HangarMark } from '../brand/HangarMark.esm.js';
import { fontMono, fontBody, fontDisplay, useHangarTokens } from '../brand/tokens.esm.js';
import { Callout, SectionLabel, Panel } from '../ui/index.esm.js';

const PROVIDER_STORAGE_KEY = "@backstage/core:SignInPage:provider";
const GUEST_ID = "guest";
const githubSignInProvider = {
  id: "github-auth-provider",
  title: "GitHub",
  apiRef: githubAuthApiRef,
  icon: /* @__PURE__ */ jsx(GitHubIcon, { fontSize: "small" })
};
const DEFAULT_TAGLINE = "The internal developer platform. Scaffold a service, ship it through a guarded pipeline, run it on any cluster.";
const PRODUCTS = [
  { glyph: "tower", name: "Tower", role: "Release command center" },
  { glyph: "glidepath", name: "Glidepath", role: "Build, scan, sign, promote" },
  { glyph: "airframe", name: "Airframe", role: "The service catalog" },
  { glyph: "apron", name: "Apron", role: "Cluster ground infrastructure" },
  { glyph: "autopilot", name: "Autopilot", role: "Agent workloads, bounded and audited" }
];
function readStored() {
  try {
    return window.localStorage.getItem(PROVIDER_STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id) {
  try {
    if (id === null) window.localStorage.removeItem(PROVIDER_STORAGE_KEY);
    else window.localStorage.setItem(PROVIDER_STORAGE_KEY, id);
  } catch {
  }
}
function signInError(e) {
  if (e.name === "PopupClosedError" && e.message.endsWith("popup was closed")) return void 0;
  if (e.name === "PopupRejectedError") return new Error("The browser blocked the sign-in window. Allow pop-ups for this site and try again.");
  return e;
}
function withSignOut(identity) {
  return {
    getProfileInfo: () => identity.getProfileInfo(),
    getBackstageIdentity: () => identity.getBackstageIdentity(),
    getCredentials: () => identity.getCredentials(),
    signOut: async () => {
      writeStored(null);
      await identity.signOut();
    }
  };
}
const NARROW = "@media (max-width: 959.95px)";
const useStyles = makeStyles(() => ({
  root: {
    position: "relative",
    minHeight: "100vh",
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)",
    alignItems: "center",
    gap: 48,
    padding: "48px clamp(24px, 6vw, 96px)",
    boxSizing: "border-box",
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontBody,
    [NARROW]: {
      gridTemplateColumns: "minmax(0, 1fr)",
      alignItems: "start",
      alignContent: "start",
      gap: 32,
      padding: "32px 16px"
    }
  },
  // The sign-in box sits at the centre of a faint instrument face, like the glyph in the mark.
  boxWrap: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "min(88vh, 760px)",
    [NARROW]: { minHeight: 0 }
  },
  dial: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: "min(88vh, 760px)",
    height: "min(88vh, 760px)",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    [NARROW]: { display: "none" }
  },
  hero: { position: "relative", maxWidth: 620 },
  brand: { display: "flex", alignItems: "center", gap: 20, margin: "12px 0 20px" },
  wordmark: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 32,
    lineHeight: 1,
    letterSpacing: "-0.01em",
    [NARROW]: { fontSize: 32 }
  },
  tagline: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.55,
    color: ({ t }) => t.textLo,
    maxWidth: 520
  },
  products: {
    listStyle: "none",
    margin: "40px 0 0",
    padding: "20px 0 0",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px 24px",
    borderTop: ({ t }) => `1px solid ${t.line}`,
    [NARROW]: { display: "none" }
  },
  product: { display: "flex", alignItems: "center", gap: 12 },
  productName: { display: "block", fontFamily: fontDisplay, fontWeight: 600, fontSize: 15 },
  productRole: { display: "block", fontSize: 12, color: ({ t }) => t.textLo },
  box: {
    position: "relative",
    width: "100%",
    maxWidth: 420,
    justifySelf: "center",
    padding: 32,
    boxSizing: "border-box",
    [NARROW]: { padding: 24, maxWidth: "none" }
  },
  boxHeading: { margin: "6px 0 6px", fontFamily: fontDisplay, fontWeight: 700, fontSize: 22 },
  boxLead: { margin: "0 0 24px", fontSize: 13, color: ({ t }) => t.textLo },
  actions: { display: "flex", flexDirection: "column", gap: 12 },
  provider: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    height: 44,
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bgRaised,
    color: ({ t }) => t.textHi,
    fontFamily: fontBody,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    "&:hover:not(:disabled)": { borderColor: ({ t }) => t.textFaint },
    "&:focus-visible": { outline: ({ t }) => `2px solid ${t.textLo}`, outlineOffset: 2 },
    "&:disabled": { cursor: "default", opacity: 0.6 }
  },
  providerPrimary: {
    borderColor: ({ t }) => t.amber,
    backgroundColor: ({ t }) => t.amberFill,
    color: ({ t }) => t.onAmber,
    "&:hover:not(:disabled)": { backgroundColor: ({ t }) => t.amberFillHover, borderColor: ({ t }) => t.amber },
    "&:active:not(:disabled)": { backgroundColor: ({ t }) => t.amberFillPress }
  },
  providerMessage: { margin: "-4px 0 0", fontSize: 12, color: ({ t }) => t.textLo, textAlign: "center" },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "4px 0",
    fontFamily: fontMono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: ({ t }) => t.textFaint,
    "&::before, &::after": { content: '""', flex: 1, borderTop: ({ t }) => `1px solid ${t.lineSoft}` }
  },
  devTag: {
    fontFamily: fontMono,
    fontSize: 11,
    padding: "1px 6px",
    borderRadius: 4,
    color: ({ t }) => t.textLo,
    border: ({ t }) => `1px solid ${t.line}`
  },
  status: { minHeight: 44, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 },
  statusText: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  errorSpace: { marginBottom: 20 },
  foot: {
    margin: "28px 0 0",
    paddingTop: 16,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textFaint
  }
}));
function DialFace({ className, t }) {
  const minor = Array.from({ length: 72 }, (_, i) => i * 5).filter((a) => a % 45 !== 0);
  return /* @__PURE__ */ jsxs("svg", { className, viewBox: "0 0 96 96", "aria-hidden": true, focusable: "false", children: [
    /* @__PURE__ */ jsx("circle", { cx: "48", cy: "48", r: "40", fill: "none", stroke: t.line, strokeWidth: 0.25 }),
    /* @__PURE__ */ jsx("circle", { cx: "48", cy: "48", r: "31", fill: "none", stroke: t.lineSoft, strokeWidth: 0.2 }),
    /* @__PURE__ */ jsx("g", { stroke: t.lineSoft, strokeWidth: 0.2, children: minor.map((a) => /* @__PURE__ */ jsx("line", { x1: "48", y1: "8", x2: "48", y2: a % 15 === 0 ? 11 : 10, transform: `rotate(${a} 48 48)` }, a)) }),
    /* @__PURE__ */ jsx("g", { stroke: t.line, strokeWidth: 0.45, children: [0, 45, 90, 135, 180, 225, 270, 315].map((a) => /* @__PURE__ */ jsx("line", { x1: "48", y1: "8", x2: "48", y2: "14", transform: `rotate(${a} 48 48)` }, a)) }),
    /* @__PURE__ */ jsx("polygon", { points: "46.5,5 49.5,5 48,7.6", fill: t.amber, opacity: 0.6 })
  ] });
}
function HangarSignInPage({ onSignInSuccess, providers, guest = false, tagline = DEFAULT_TAGLINE }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const apis = useApiHolder();
  const analytics = useAnalytics();
  const [phase, setPhase] = useState("restoring");
  const [busy, setBusy] = useState();
  const [error, setError] = useState();
  const done = useRef(false);
  const finish = (identity) => {
    if (done.current) return;
    done.current = true;
    onSignInSuccess(withSignOut(identity));
    analytics.captureEvent("signIn", "success");
  };
  const authApi = (p) => {
    const api = apis.get(p.apiRef);
    if (!api) throw new Error(`No API registered for ${p.title} (${p.apiRef.id})`);
    return api;
  };
  const complete = async (p, instantPopup) => {
    const api = authApi(p);
    const response = await api.getBackstageIdentity(instantPopup ? { instantPopup: true } : { optional: true });
    if (!response) return false;
    const profile = await api.getProfile();
    finish(UserIdentity.create({ identity: response.identity, profile, authApi: api }));
    return true;
  };
  useEffect(() => {
    const failed = new URLSearchParams(window.location.search).get("error");
    if (failed) setError(new Error(failed));
    const stored = readStored();
    const remembered = providers.find((p) => p.id === stored);
    if (stored === GUEST_ID && guest) {
      setPhase("guest");
      return void 0;
    }
    if (!remembered) {
      setPhase("ready");
      return void 0;
    }
    let cancelled = false;
    complete(remembered, false).then((ok) => {
      if (!ok && !cancelled) setPhase("ready");
    }).catch(() => {
      writeStored(null);
      if (!cancelled) setPhase("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const signIn = async (p) => {
    setBusy(p.id);
    setError(void 0);
    writeStored(p.id);
    try {
      if (!await complete(p, true)) throw new Error(`The ${p.title} provider is not configured to support sign-in`);
    } catch (e) {
      writeStored(null);
      setBusy(void 0);
      setError(signInError(e));
    }
  };
  const signInAsGuest = () => {
    setError(void 0);
    writeStored(GUEST_ID);
    setPhase("guest");
  };
  const [GuestFailed] = useState(
    () => function GuestFailed2({ error: guestError }) {
      useEffect(() => {
        writeStored(null);
        setError(new Error(`Guest sign-in failed: ${guestError?.message ?? "no response from the auth backend"}`));
        setPhase("ready");
      }, [guestError]);
      return null;
    }
  );
  let body;
  if (phase === "restoring") {
    body = /* @__PURE__ */ jsx("div", { className: classes.status, children: /* @__PURE__ */ jsx("span", { className: classes.statusText, children: "Checking for a session\u2026" }) });
  } else if (phase === "guest") {
    body = /* @__PURE__ */ jsxs("div", { className: classes.status, children: [
      /* @__PURE__ */ jsx("span", { className: classes.statusText, children: "Signing in as guest\u2026" }),
      /* @__PURE__ */ jsx(ProxiedSignInPage, { provider: GUEST_ID, onSignInSuccess: finish, ErrorComponent: GuestFailed })
    ] });
  } else {
    body = /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
      providers.map((p, i) => /* @__PURE__ */ jsxs("div", { className: classes.actions, children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: `${classes.provider} ${i === 0 ? classes.providerPrimary : ""}`,
            disabled: busy !== void 0,
            onClick: () => signIn(p),
            children: [
              p.icon,
              busy === p.id ? `Waiting for ${p.title}\u2026` : `Continue with ${p.title}`
            ]
          }
        ),
        p.message && /* @__PURE__ */ jsx("p", { className: classes.providerMessage, children: p.message })
      ] }, p.id)),
      guest && /* @__PURE__ */ jsxs(Fragment, { children: [
        providers.length > 0 && /* @__PURE__ */ jsx("span", { className: classes.divider, children: "or" }),
        /* @__PURE__ */ jsxs("button", { type: "button", className: classes.provider, disabled: busy !== void 0, onClick: signInAsGuest, children: [
          "Continue as guest ",
          /* @__PURE__ */ jsx("span", { className: classes.devTag, children: "dev" })
        ] })
      ] }),
      providers.length === 0 && !guest && /* @__PURE__ */ jsx(Callout, { tone: "warn", title: "No sign-in method is configured", children: "Pass at least one provider to createHangarSignInModule." })
    ] });
  }
  return /* @__PURE__ */ jsxs("main", { className: classes.root, children: [
    /* @__PURE__ */ jsxs("section", { className: classes.hero, "aria-label": "Hangar", children: [
      /* @__PURE__ */ jsx(SectionLabel, { children: "Hangar platform" }),
      /* @__PURE__ */ jsxs("div", { className: classes.brand, children: [
        /* @__PURE__ */ jsx(HangarMark, { glyph: "hangar", size: 88 }),
        /* @__PURE__ */ jsx("span", { className: classes.wordmark, children: "Hangar" })
      ] }),
      /* @__PURE__ */ jsx("p", { className: classes.tagline, children: tagline }),
      /* @__PURE__ */ jsx("ul", { className: classes.products, children: PRODUCTS.map((p) => /* @__PURE__ */ jsxs("li", { className: classes.product, children: [
        /* @__PURE__ */ jsx(HangarMark, { glyph: p.glyph, size: 36 }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: classes.productName, children: p.name }),
          /* @__PURE__ */ jsx("span", { className: classes.productRole, children: p.role })
        ] })
      ] }, p.name)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: classes.boxWrap, children: [
      /* @__PURE__ */ jsx(DialFace, { className: classes.dial, t }),
      /* @__PURE__ */ jsxs(Panel, { className: classes.box, children: [
        /* @__PURE__ */ jsx(SectionLabel, { children: "Sign in" }),
        /* @__PURE__ */ jsx("h1", { className: classes.boxHeading, children: "Welcome to Hangar" }),
        /* @__PURE__ */ jsx("p", { className: classes.boxLead, children: "Sign in with your organization account to continue." }),
        error && /* @__PURE__ */ jsx("div", { className: classes.errorSpace, children: /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "Sign-in failed", children: error.message }) }),
        body,
        /* @__PURE__ */ jsx("p", { className: classes.foot, children: "Tower \xB7 Backstage" })
      ] })
    ] })
  ] });
}

export { HangarSignInPage, githubSignInProvider, signInError };
//# sourceMappingURL=HangarSignInPage.esm.js.map
