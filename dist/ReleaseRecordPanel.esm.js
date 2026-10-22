import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { fontMono, useHangarTokens } from './brand/tokens.esm.js';
import { StatusChip, TextLink } from './ui/index.esm.js';
import { ReleaseRecordList } from './ReleaseRecordList.esm.js';
import { ReleaseRecordDetail } from './ReleaseRecordDetail.esm.js';
import { ReleaseRecordCompare } from './ReleaseRecordCompare.esm.js';
import { NextReleaseCard } from './NextReleaseCard.esm.js';
import { AutolandEligibility } from './AutolandEligibility.esm.js';
import { withRecordedEvidence } from './useReleaseRecords.esm.js';
import { Tooltip } from './ui/Tooltip.esm.js';

const useStyles = makeStyles(() => ({
  picker: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  pickerLabel: { fontFamily: fontMono, fontSize: 11, letterSpacing: "0.12em", color: ({ t }) => t.textLo },
  chipOn: { fontWeight: 600, boxShadow: ({ t }) => `inset 0 0 0 1px ${t.amber}` }
}));
const PICKER_RECENT = 5;
function ReleaseRecordPanel({
  records: liveRecords,
  totalKnown,
  appName,
  owner,
  gitopsPrs,
  next,
  names,
  flightEnvs,
  promoteTo,
  onPromote,
  modeBar,
  draftEditor,
  modeLabel,
  signoffEnv,
  openId: controlledOpenId,
  onOpenIdChange,
  onChangelog
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const records = useMemo(() => {
    const byTag = new Map((names?.index ?? []).map((e) => [e.imageTag, e]));
    return liveRecords.map((r) => withRecordedEvidence(r, byTag.get(r.imageTag)));
  }, [liveRecords, names]);
  const [ownOpenId, setOwnOpenId] = useState(null);
  const openId = controlledOpenId !== void 0 ? controlledOpenId : ownOpenId;
  const [compareId, setCompareId] = useState(null);
  const setOpenId = (id) => {
    setCompareId(null);
    if (onOpenIdChange) onOpenIdChange(id);
    else setOwnOpenId(id);
  };
  const open = openId ? records.find((r) => r.id === openId) : void 0;
  const compareTarget = compareId ? records.find((r) => r.id === compareId) : void 0;
  const nameOf = (r) => names?.byTag.get(r.imageTag) ?? r.version ?? r.imageTag;
  const recent = records.slice(0, PICKER_RECENT);
  const picker = /* @__PURE__ */ jsxs("div", { className: classes.picker, "aria-label": "Pick a release", children: [
    /* @__PURE__ */ jsx("span", { className: classes.pickerLabel, children: "RELEASE" }),
    next && /* @__PURE__ */ jsxs(StatusChip, { tone: "warn", onClick: () => setOpenId(null), className: !open ? classes.chipOn : void 0, children: [
      names?.next ?? "Next",
      " \xB7 draft"
    ] }),
    recent.map((r) => /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", onClick: () => setOpenId(r.id), className: open?.id === r.id ? classes.chipOn : void 0, children: nameOf(r) }, r.id)),
    records.length > PICKER_RECENT && /* @__PURE__ */ jsx(Tooltip, { title: "Every record is in the list below the draft", children: /* @__PURE__ */ jsxs(TextLink, { onClick: () => setOpenId(null), children: [
      "+ ",
      records.length - PICKER_RECENT,
      " older"
    ] }) })
  ] });
  if (open && compareTarget) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      picker,
      /* @__PURE__ */ jsx(ReleaseRecordCompare, { left: compareTarget, right: open, onBack: () => setCompareId(null) })
    ] });
  }
  if (open) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      picker,
      /* @__PURE__ */ jsx(
        ReleaseRecordDetail,
        {
          record: open,
          name: names?.byTag.get(open.imageTag),
          allNames: names?.byTag,
          signoffEnv,
          appName,
          owner,
          gitopsPrs,
          otherRecords: records.filter((r) => r.id !== open.id),
          onCompare: setCompareId,
          onBack: () => setOpenId(null)
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    picker,
    modeBar,
    modeBar && records.length > 0 && /* @__PURE__ */ jsx(AutolandEligibility, { records, signoffEnv }),
    next && /* @__PURE__ */ jsx(
      NextReleaseCard,
      {
        next,
        name: names?.next,
        previousName: next.previous ? names?.byTag.get(next.previous.imageTag) : void 0,
        promoteTo,
        onPromote,
        modeLabel,
        children: draftEditor
      }
    ),
    /* @__PURE__ */ jsx(
      ReleaseRecordList,
      {
        records,
        totalKnown,
        names: names?.byTag,
        flightEnvs,
        onChangelog: names ? onChangelog : void 0,
        onOpen: setOpenId
      }
    )
  ] });
}

export { ReleaseRecordPanel };
//# sourceMappingURL=ReleaseRecordPanel.esm.js.map
