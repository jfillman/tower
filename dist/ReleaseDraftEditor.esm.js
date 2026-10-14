import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime } from './shared/format.esm.js';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { NOTE_CATEGORIES, NOTE_LABEL } from './releaseFlow.esm.js';
import { TextLink, Field, Button, Hint } from './ui/index.esm.js';

const MAIN = ["added", "changed", "fixed", "security"];
const useStyles = makeStyles(() => ({
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  summary: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, fontSize: 12.5, color: ({ t }) => t.textLo },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    "@media (max-width: 860px)": { gridTemplateColumns: "1fr" }
  },
  textarea: { fontFamily: fontMono, fontSize: 12, minHeight: 64, resize: "vertical", width: "100%" },
  line: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 },
  saved: { fontSize: 12, color: ({ t }) => t.textLo },
  error: { fontSize: 12, color: ({ t }) => t.bad }
}));
const toText = (l) => (l ?? []).join("\n");
const toLines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
function formOf(d) {
  return {
    owner: d?.owner ?? "",
    notes: Object.fromEntries(NOTE_CATEGORIES.map((c) => [c, toText(d?.notes?.[c])])),
    knownIssues: toText(d?.knownIssues),
    riskLevel: d?.risk?.level ?? "",
    riskNotes: d?.risk?.notes ?? "",
    rollback: d?.risk?.rollback ?? "",
    targetDate: d?.targetDate ?? "",
    milestone: d?.milestone ?? "",
    publishGithubRelease: d?.publishGithubRelease ?? false
  };
}
function draftOf(f) {
  const notes = {};
  NOTE_CATEGORIES.forEach((c) => {
    const l = toLines(f.notes[c]);
    if (l.length > 0) notes[c] = l;
  });
  return {
    owner: f.owner.trim() || void 0,
    notes,
    knownIssues: toLines(f.knownIssues),
    risk: { level: f.riskLevel || void 0, notes: f.riskNotes.trim() || void 0, rollback: f.rollback.trim() || void 0 },
    targetDate: f.targetDate || void 0,
    milestone: f.milestone.trim() || void 0,
    publishGithubRelease: f.publishGithubRelease || void 0
  };
}
function ReleaseDraftEditor({
  saved,
  suggested,
  canEdit,
  saving,
  error,
  commitUrl,
  onSave
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState(() => formOf(saved));
  useEffect(() => setForm(formOf(saved)), [saved]);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(formOf(saved)), [form, saved]);
  const noteCount = NOTE_CATEGORIES.reduce((n, c) => n + (saved?.notes?.[c]?.length ?? 0), 0);
  const canSuggest = NOTE_CATEGORIES.some((c) => !form.notes[c].trim() && (suggested[c]?.length ?? 0) > 0);
  const shown = showAll ? [...NOTE_CATEGORIES] : NOTE_CATEGORIES.filter((c) => MAIN.includes(c) || form.notes[c].trim());
  return /* @__PURE__ */ jsxs("div", { className: classes.wrap, children: [
    /* @__PURE__ */ jsxs("div", { className: classes.summary, children: [
      /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: "Notes and owner" }),
      /* @__PURE__ */ jsxs("span", { children: [
        noteCount > 0 ? `${noteCount} note${noteCount === 1 ? "" : "s"}` : "No notes yet",
        " \xB7 owner",
        " ",
        saved?.owner ?? "not named",
        saved?.targetDate && ` \xB7 target ${saved.targetDate}`,
        saved?.updatedAt && ` \xB7 saved ${relativeTime(saved.updatedAt)}${saved.updatedBy ? ` by ${saved.updatedBy.replace(/^user:default\//, "")}` : ""}`
      ] })
    ] }),
    open && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: classes.grid, children: shown.map((c) => /* @__PURE__ */ jsx(Field, { id: `rd-notes-${c}`, label: `${NOTE_LABEL[c]} (one per line)`, children: (props) => /* @__PURE__ */ jsx(
        "textarea",
        {
          ...props,
          className: `${props.className} ${classes.textarea}`,
          value: form.notes[c],
          disabled: !canEdit,
          onChange: (e) => setForm((f) => ({ ...f, notes: { ...f.notes, [c]: e.target.value } }))
        }
      ) }, c)) }),
      /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
        canEdit && canSuggest && /* @__PURE__ */ jsx(
          TextLink,
          {
            onClick: () => setForm((f) => ({
              ...f,
              notes: Object.fromEntries(
                NOTE_CATEGORIES.map((c) => [c, f.notes[c].trim() ? f.notes[c] : toText(suggested[c])])
              )
            })),
            children: "Fill empty sections from the merged PRs"
          }
        ),
        !showAll && /* @__PURE__ */ jsx(TextLink, { onClick: () => setShowAll(true), children: "Deprecated and Removed sections" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.grid, children: [
        /* @__PURE__ */ jsx(Field, { id: "rd-known-issues", label: "Known issues (one per line)", children: (props) => /* @__PURE__ */ jsx(
          "textarea",
          {
            ...props,
            className: `${props.className} ${classes.textarea}`,
            value: form.knownIssues,
            disabled: !canEdit,
            onChange: (e) => setForm((f) => ({ ...f, knownIssues: e.target.value }))
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { id: "rd-rollback", label: "Rollback notes (data, migrations, flags)", children: (props) => /* @__PURE__ */ jsx(
          "textarea",
          {
            ...props,
            className: `${props.className} ${classes.textarea}`,
            value: form.rollback,
            disabled: !canEdit,
            onChange: (e) => setForm((f) => ({ ...f, rollback: e.target.value }))
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { id: "rd-target", label: "Target date (optional)", children: (props) => /* @__PURE__ */ jsx(
          "input",
          {
            ...props,
            type: "date",
            value: form.targetDate,
            disabled: !canEdit,
            onChange: (e) => setForm((f) => ({ ...f, targetDate: e.target.value }))
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { id: "rd-milestone", label: "GitHub milestone (planned scope, optional)", children: (props) => /* @__PURE__ */ jsx(
          "input",
          {
            ...props,
            value: form.milestone,
            disabled: !canEdit,
            placeholder: "Its title or number",
            onChange: (e) => setForm((f) => ({ ...f, milestone: e.target.value }))
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { id: "rd-owner", label: "Release owner", children: (props) => /* @__PURE__ */ jsx(
          "input",
          {
            ...props,
            value: form.owner,
            disabled: !canEdit,
            placeholder: "Who makes the go / no-go call",
            onChange: (e) => setForm((f) => ({ ...f, owner: e.target.value }))
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { id: "rd-risk", label: "Risk", children: (props) => /* @__PURE__ */ jsxs(
          "select",
          {
            ...props,
            value: form.riskLevel,
            disabled: !canEdit,
            onChange: (e) => setForm((f) => ({ ...f, riskLevel: e.target.value })),
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Not assessed" }),
              /* @__PURE__ */ jsx("option", { value: "low", children: "Low" }),
              /* @__PURE__ */ jsx("option", { value: "medium", children: "Medium" }),
              /* @__PURE__ */ jsx("option", { value: "high", children: "High" })
            ]
          }
        ) }),
        /* @__PURE__ */ jsx(Field, { id: "rd-risk-notes", label: "Risk notes", children: (props) => /* @__PURE__ */ jsx(
          "textarea",
          {
            ...props,
            className: `${props.className} ${classes.textarea}`,
            value: form.riskNotes,
            disabled: !canEdit,
            onChange: (e) => setForm((f) => ({ ...f, riskNotes: e.target.value }))
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs("label", { className: classes.line, htmlFor: "rd-gh-release", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            id: "rd-gh-release",
            type: "checkbox",
            checked: form.publishGithubRelease,
            disabled: !canEdit,
            onChange: (e) => setForm((f) => ({ ...f, publishGithubRelease: e.target.checked }))
          }
        ),
        "Publish a GitHub Release (tag v<version>, these notes) when this release is healthy in production"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: classes.line, children: [
        canEdit ? /* @__PURE__ */ jsx(Button, { small: true, disabled: !dirty || saving, onClick: () => onSave(draftOf(form)), children: saving ? "Saving\u2026" : "Save draft" }) : /* @__PURE__ */ jsx(Hint, { children: "Only the app's owners and admins can edit the draft." }),
        commitUrl && !dirty && /* @__PURE__ */ jsxs("span", { className: classes.saved, children: [
          "Saved to glidepath/releases/next.yaml \xB7 ",
          /* @__PURE__ */ jsx(TextLink, { href: commitUrl, children: "commit \u2197" })
        ] }),
        error && /* @__PURE__ */ jsx("span", { className: classes.error, children: error })
      ] }),
      /* @__PURE__ */ jsx(Hint, { children: "Saved as a commit to glidepath/releases/next.yaml in the app's repo (it builds nothing). When this release reaches Flight, Tower copies the draft into its record and clears it for the next one." })
    ] })
  ] });
}

export { ReleaseDraftEditor, draftOf };
//# sourceMappingURL=ReleaseDraftEditor.esm.js.map
