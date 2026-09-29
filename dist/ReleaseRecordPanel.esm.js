import { jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { ReleaseRecordList } from './ReleaseRecordList.esm.js';
import { ReleaseRecordDetail } from './ReleaseRecordDetail.esm.js';
import { ReleaseRecordCompare } from './ReleaseRecordCompare.esm.js';

function ReleaseRecordPanel({
  records,
  totalKnown,
  appName,
  owner,
  gitopsPrs
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
        appName,
        owner,
        gitopsPrs,
        otherRecords: records.filter((r) => r.id !== open.id),
        onCompare: setCompareId,
        onBack: () => setOpenId(null)
      }
    );
  }
  return /* @__PURE__ */ jsx(
    ReleaseRecordList,
    {
      records,
      totalKnown,
      onOpen: (id) => {
        setCompareId(null);
        setOpenId(id);
      }
    }
  );
}

export { ReleaseRecordPanel };
//# sourceMappingURL=ReleaseRecordPanel.esm.js.map
