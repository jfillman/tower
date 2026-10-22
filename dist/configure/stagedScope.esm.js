import { jsx } from 'react/jsx-runtime';
import { createContext, useRef, useCallback, useContext, useEffect } from 'react';

const StagedContext = createContext(void 0);
let nextId = 0;
function useReportStaged(count) {
  const report = useContext(StagedContext);
  const id = useRef(`staged-${nextId++}`).current;
  useEffect(() => {
    report?.(id, count);
  }, [report, id, count]);
  useEffect(() => () => report?.(id, 0), [report, id]);
}
function StagedScope({ onTotal, children }) {
  const counts = useRef(/* @__PURE__ */ new Map());
  const report = useCallback(
    (panelId, count) => {
      if (count > 0) counts.current.set(panelId, count);
      else counts.current.delete(panelId);
      onTotal([...counts.current.values()].reduce((a, b) => a + b, 0));
    },
    [onTotal]
  );
  return /* @__PURE__ */ jsx(StagedContext.Provider, { value: report, children });
}

export { StagedScope, useReportStaged };
//# sourceMappingURL=stagedScope.esm.js.map
