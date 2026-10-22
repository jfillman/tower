import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, fontBody, useHangarTokens } from '../brand/tokens.esm.js';
import { preventFocusScroll } from '../preventFocusScroll.esm.js';
import { SearchField, Hint } from '../ui/index.esm.js';
import { searchSettings } from './settingIndex.esm.js';
import { useSettingFiles } from './useSettingFiles.esm.js';

const useStyles = makeStyles(() => ({
  wrap: { position: "relative", width: 380, maxWidth: "100%" },
  list: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    zIndex: 5,
    width: 460,
    maxWidth: "90vw",
    maxHeight: 420,
    overflowY: "auto",
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.panel,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
  },
  head: {
    padding: "8px 12px",
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: ({ t }) => t.textLo,
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`
  },
  hit: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    width: "100%",
    textAlign: "left",
    padding: "8px 12px",
    border: "none",
    borderBottom: ({ t }) => `1px solid ${t.lineSoft}`,
    background: "none",
    cursor: "pointer",
    color: ({ t }) => t.textHi,
    "&:hover, &:focus-visible": { backgroundColor: ({ t }) => t.panelAlt, outline: "none" }
  },
  hitTop: { display: "flex", justifyContent: "space-between", gap: 12, fontFamily: fontBody, fontSize: 13 },
  hitKey: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.sky, overflowWrap: "anywhere" },
  hitValue: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textHi, flexShrink: 0, maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  hitPath: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textLo }
}));
const SUBTAB_NAME = { environments: "Environments", config: "Shared values", glidepath: "Pipeline" };
function SettingFinder({ onOpen }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const files = useSettingFiles(query.trim().length >= 2);
  const hits = useMemo(() => searchSettings(files.files, query), [files.files, query]);
  if (!files.available) return null;
  const showList = open && query.trim().length >= 2;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: c.wrap,
      onFocus: () => setOpen(true),
      onBlur: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      },
      onKeyDown: (e) => {
        if (e.key === "Escape") setOpen(false);
      },
      children: [
        /* @__PURE__ */ jsx(SearchField, { label: "Find a setting", placeholder: "Find a setting: replicas, cache, 1.42.0\u2026", value: query, onChange: setQuery }),
        showList && /* @__PURE__ */ jsxs("div", { className: c.list, role: "listbox", "aria-label": "Settings found", children: [
          /* @__PURE__ */ jsx("div", { className: c.head, children: files.loading ? "Reading the files\u2026" : `${hits.length === 20 ? "20+" : hits.length} found in ${new Set(hits.map((h) => h.file.path)).size} file(s)` }),
          !files.loading && hits.length === 0 && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
            'Nothing in cicd.yaml or the values files matches "',
            query.trim(),
            '".'
          ] }),
          hits.map((hit) => /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              role: "option",
              "aria-selected": false,
              className: c.hit,
              onMouseDown: preventFocusScroll,
              onClick: () => {
                setOpen(false);
                onOpen(hit);
              },
              children: [
                /* @__PURE__ */ jsxs("span", { className: c.hitTop, children: [
                  /* @__PURE__ */ jsxs("span", { children: [
                    SUBTAB_NAME[hit.file.subtab],
                    " \u203A ",
                    hit.file.label
                  ] }),
                  /* @__PURE__ */ jsx("span", { className: c.hitValue, children: hit.value })
                ] }),
                /* @__PURE__ */ jsx("span", { className: c.hitKey, children: hit.key }),
                /* @__PURE__ */ jsx("span", { className: c.hitPath, children: hit.file.path })
              ]
            },
            `${hit.file.path}:${hit.key}`
          )),
          files.failed > 0 && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
            files.failed,
            " file(s) could not be read; results may be incomplete."
          ] })
        ] })
      ]
    }
  );
}

export { SettingFinder };
//# sourceMappingURL=SettingFinder.esm.js.map
