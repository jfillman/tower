import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

// How many changes are staged under a part of the page, without each editor knowing it is inside Configure. Every
// editing view stages through the kit PendingPanel, which reports its line count to the nearest StagedScope; the
// Configure tab puts one scope around each sub-tab and marks the sub-tabs that hold unopened changes.

type Report = (panelId: string, count: number) => void;
const StagedContext = createContext<Report | undefined>(undefined);

let nextId = 0;

/** Called by PendingPanel with its own line count. Outside a StagedScope it does nothing. */
export function useReportStaged(count: number) {
  const report = useContext(StagedContext);
  const id = useRef(`staged-${nextId++}`).current;
  useEffect(() => {
    report?.(id, count);
  }, [report, id, count]);
  useEffect(() => () => report?.(id, 0), [report, id]);
}

export function StagedScope({ onTotal, children }: { onTotal: (total: number) => void; children: ReactNode }) {
  const counts = useRef(new Map<string, number>());
  const report = useCallback<Report>(
    (panelId, count) => {
      if (count > 0) counts.current.set(panelId, count);
      else counts.current.delete(panelId);
      onTotal([...counts.current.values()].reduce((a, b) => a + b, 0));
    },
    [onTotal],
  );
  return <StagedContext.Provider value={report}>{children}</StagedContext.Provider>;
}
