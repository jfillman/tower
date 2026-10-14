import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { ReleaseRecordList } from './ReleaseRecordList.esm.js';
import { ReleaseRecordDetail } from './ReleaseRecordDetail.esm.js';
import { ReleaseRecordCompare } from './ReleaseRecordCompare.esm.js';
import { NextReleaseCard } from './NextReleaseCard.esm.js';

function ReleaseRecordPanel({
  records,
  totalKnown,
  appName,
  owner,
  gitopsPrs,
  next,
  names,
  flightEnvs,
  promoteTo,
  onPromote
}) {
  const [openId, setOpenId] = useState(null);
  const [compareId, setCompareId] = useState(null);
  const open = openId ? records.find((r) => r.id === openId) : void 0;
  const compareTarget = compareId ? records.find((r) => r.id === compareId) : void 0;
  if (open && compareTarget) {
    return /* @__PURE__ */ jsx(ReleaseRecordCompare, { left: compareTarget, right: open, onBack: () => setCompareId(null) });
  }
  if (open) {
    return /* @__PURE__ */ jsx(
      ReleaseRecordDetail,
      {
        record: open,
        name: names?.byTag.get(open.imageTag),
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
    next && /* @__PURE__ */ jsx(
      NextReleaseCard,
      {
        next,
        name: names?.next,
        previousName: next.previous ? names?.byTag.get(next.previous.imageTag) : void 0,
        promoteTo,
        onPromote
      }
    ),
    /* @__PURE__ */ jsx(
      ReleaseRecordList,
      {
        records,
        totalKnown,
        names: names?.byTag,
        flightEnvs,
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
