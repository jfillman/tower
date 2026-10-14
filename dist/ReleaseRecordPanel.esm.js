import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { ReleaseRecordList } from './ReleaseRecordList.esm.js';
import { ReleaseRecordDetail } from './ReleaseRecordDetail.esm.js';
import { ReleaseRecordCompare } from './ReleaseRecordCompare.esm.js';
import { NextReleaseCard } from './NextReleaseCard.esm.js';
import { ReleaseChangelog } from './ReleaseChangelog.esm.js';
import { AutolandEligibility } from './AutolandEligibility.esm.js';
import { withRecordedEvidence } from './useReleaseRecords.esm.js';

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
  signoffEnv
}) {
  const records = useMemo(() => {
    const byTag = new Map((names?.index ?? []).map((e) => [e.imageTag, e]));
    return liveRecords.map((r) => withRecordedEvidence(r, byTag.get(r.imageTag)));
  }, [liveRecords, names]);
  const [openId, setOpenId] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [compareId, setCompareId] = useState(null);
  const open = openId ? records.find((r) => r.id === openId) : void 0;
  const compareTarget = compareId ? records.find((r) => r.id === compareId) : void 0;
  if (showChangelog) return /* @__PURE__ */ jsx(ReleaseChangelog, { names, onBack: () => setShowChangelog(false) });
  if (open && compareTarget) {
    return /* @__PURE__ */ jsx(ReleaseRecordCompare, { left: compareTarget, right: open, onBack: () => setCompareId(null) });
  }
  if (open) {
    return /* @__PURE__ */ jsx(
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
    );
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
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
        onChangelog: names ? () => setShowChangelog(true) : void 0,
        onOpen: (id) => {
          setCompareId(null);
          setOpenId(id);
        }
      }
    )
  ] });
}

export { ReleaseRecordPanel };
//# sourceMappingURL=ReleaseRecordPanel.esm.js.map
