import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontBody, fontMono, useHangarTokens } from '../brand/tokens.esm.js';
import { Tooltip } from './Tooltip.esm.js';

function prNumberFromUrl(url) {
  const m = url?.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : void 0;
}
function prFromSummary(pr) {
  let state = "open";
  if (pr.state === "merged") state = "merged";
  else if (pr.draft) state = "draft";
  return { number: pr.number, url: pr.url, title: pr.title, state, repo: pr.repo, ci: pr.ci, review: pr.review };
}
function prDetail(pr) {
  const ci = pr.ci;
  if (!ci) return pr.title;
  const notPassing = (ci.checks ?? []).filter(
    (run) => run.status !== "completed" || run.conclusion && run.conclusion !== "success" && run.conclusion !== "skipped"
  );
  const lines = [
    pr.title,
    `Checks: ${ci.passedChecks} of ${ci.totalChecks} passed`,
    ...notPassing.map((run) => `  ${run.name}: ${run.status === "completed" ? run.conclusion : run.status.replace("_", " ")}`)
  ].filter(Boolean);
  return lines.join("\n");
}
const GLYPH = { open: "\u25CB", draft: "\u25CC", merged: "\u2713", closed: "\u2715" };
function glyphColor(t, s) {
  if (s === "open") return t.sky;
  if (s === "merged") return t.good;
  return t.textFaint;
}
function ciColor(t, ci) {
  if (ci.state === "success") return t.good;
  if (ci.state === "failure") return t.bad;
  if (ci.state === "pending") return t.sky;
  return t.textFaint;
}
function prWord(pr) {
  if (pr.state === "merged") return { text: "merged", tone: "neutral" };
  if (pr.state === "closed") return { text: "closed", tone: "neutral" };
  if (pr.state === "draft") return { text: "draft", tone: "neutral" };
  if (pr.ci?.state === "failure") {
    const failing = pr.ci.totalChecks - pr.ci.passedChecks;
    return { text: failing > 0 ? `${failing} failing` : "checks failing", tone: "bad" };
  }
  if (pr.review?.state === "changes_requested") return { text: "changes requested", tone: "bad" };
  if (pr.ci?.state === "pending") return { text: "checks running", tone: "info" };
  if (pr.review?.state === "approved") return { text: pr.ci?.state === "success" ? "ready to merge" : "approved", tone: "ok" };
  return void 0;
}
const useStyles = makeStyles(() => ({
  inline: { fontFamily: fontMono, fontSize: "0.96em", color: ({ t }) => t.sky, textDecoration: "none", whiteSpace: "nowrap", "&:hover": { textDecoration: "underline" } },
  inlineDone: { color: ({ t }) => t.textLo },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fontMono,
    fontSize: 11,
    lineHeight: 1,
    padding: "4px 8px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    textDecoration: "none",
    whiteSpace: "nowrap",
    "&:hover": { borderColor: ({ t }) => t.textFaint }
  },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "9px 14px",
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    color: ({ t }) => t.textHi,
    textDecoration: "none",
    "&:hover": { borderColor: ({ t }) => t.textFaint }
  },
  cardBody: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flexGrow: 1 },
  cardTop: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 },
  num: { fontFamily: fontMono, fontSize: 12, flexShrink: 0 },
  title: { fontFamily: fontBody, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  dot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  word: { fontFamily: fontMono, fontSize: 11, whiteSpace: "nowrap", padding: "3px 9px", borderRadius: 999, border: "1px solid" },
  arrow: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textFaint, flexShrink: 0 },
  // receipt
  receipt: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    borderRadius: 6,
    border: "1px solid"
  },
  receiptHead: { display: "flex", alignItems: "center", gap: 8, fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: ({ t }) => t.textHi },
  receiptNext: { fontFamily: fontBody, fontSize: 12, color: ({ t }) => t.textLo }
}));
function wordStyle(t, w) {
  if (w.tone === "ok") return { color: t.good, backgroundColor: t.goodSoft, borderColor: t.good };
  if (w.tone === "bad") return { color: t.bad, backgroundColor: t.badSoft, borderColor: t.bad };
  if (w.tone === "info") return { color: t.sky, backgroundColor: t.skySoft, borderColor: t.skyLine };
  return { color: t.textLo, backgroundColor: t.panelAlt, borderColor: t.line };
}
function PrRef({
  pr,
  size = "chip",
  meta,
  className,
  label
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const state = pr.state ?? "open";
  const n = pr.number ?? prNumberFromUrl(pr.url);
  const numText = n !== void 0 ? `PR #${n}` : "PR";
  const done = state === "merged" || state === "closed";
  const glyph = /* @__PURE__ */ jsx("span", { style: { color: glyphColor(t, state), fontFamily: fontMono }, children: GLYPH[state] });
  const word = prWord({ ...pr, state });
  const cx = (...xs) => xs.filter(Boolean).join(" ");
  if (size === "inline") {
    return /* @__PURE__ */ jsxs("a", { className: cx(c.inline, done && c.inlineDone, className), href: pr.url, target: "_blank", rel: "noopener noreferrer", title: pr.title, children: [
      state === "merged" && /* @__PURE__ */ jsx("span", { style: { color: t.good }, children: "\u2713 " }),
      label ? `${label} ` : "",
      numText,
      " \u2197"
    ] });
  }
  if (size === "chip") {
    return /* @__PURE__ */ jsx(Tooltip, { title: prDetail(pr), children: /* @__PURE__ */ jsxs("a", { className: cx(c.chip, className), href: pr.url, target: "_blank", rel: "noopener noreferrer", children: [
      glyph,
      /* @__PURE__ */ jsxs("span", { style: { color: state === "open" ? t.sky : t.textLo, textDecoration: state === "closed" ? "line-through" : void 0 }, children: [
        "#",
        n ?? "?"
      ] }),
      !done && pr.ci && /* @__PURE__ */ jsx("span", { className: c.dot, style: { backgroundColor: ciColor(t, pr.ci) } }),
      word && /* @__PURE__ */ jsx("span", { style: { color: word.tone === "bad" ? t.bad : t.textLo }, children: word.text })
    ] }) });
  }
  const metaLine = meta ?? [pr.repo, pr.ci ? `${pr.ci.passedChecks}/${pr.ci.totalChecks} checks` : void 0].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ jsx(Tooltip, { title: pr.ci ? prDetail(pr) : void 0, children: /* @__PURE__ */ jsxs("a", { className: cx(c.card, className), href: pr.url, target: "_blank", rel: "noopener noreferrer", children: [
    glyph,
    /* @__PURE__ */ jsxs("span", { className: c.cardBody, children: [
      /* @__PURE__ */ jsxs("span", { className: c.cardTop, children: [
        /* @__PURE__ */ jsx("span", { className: c.num, style: { color: state === "open" ? t.sky : t.textLo }, children: numText }),
        pr.title && /* @__PURE__ */ jsx("span", { className: c.title, style: { color: done ? t.textLo : t.textHi }, title: pr.title, children: pr.title })
      ] }),
      metaLine && /* @__PURE__ */ jsx("span", { className: c.meta, children: metaLine })
    ] }),
    !done && pr.ci && !word && /* @__PURE__ */ jsx("span", { className: c.dot, style: { backgroundColor: ciColor(t, pr.ci) } }),
    word && /* @__PURE__ */ jsx("span", { className: c.word, style: wordStyle(t, word), children: word.text }),
    /* @__PURE__ */ jsx("span", { className: c.arrow, children: "\u2197" })
  ] }) });
}
function PrReceipt({
  prUrl,
  title,
  alreadyOpen,
  updated,
  next,
  className
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const n = prNumberFromUrl(prUrl);
  const numText = n !== void 0 ? `PR #${n}` : "The PR";
  const box = alreadyOpen ? { backgroundColor: t.panel, borderColor: t.line } : { backgroundColor: t.goodSoft, borderColor: t.good };
  return /* @__PURE__ */ jsxs("div", { className: [c.receipt, className].filter(Boolean).join(" "), style: box, role: "status", "data-testid": "pr-receipt", children: [
    /* @__PURE__ */ jsx("div", { className: c.receiptHead, children: alreadyOpen ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("span", { style: { color: t.sky, fontFamily: fontMono }, children: "\u25CB" }),
      numText,
      " was already open",
      updated ? " \xB7 updated" : ""
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("span", { style: { color: t.good }, children: "\u2713" }),
      numText,
      " opened"
    ] }) }),
    /* @__PURE__ */ jsx(PrRef, { pr: { url: prUrl, number: n, title }, size: "card", meta: "" }),
    next && /* @__PURE__ */ jsxs("div", { className: c.receiptNext, children: [
      "Next: ",
      next
    ] })
  ] });
}
const OPENING_PR = "Opening PR\u2026";

export { OPENING_PR, PrReceipt, PrRef, prFromSummary, prNumberFromUrl, prWord };
//# sourceMappingURL=PrRef.esm.js.map
