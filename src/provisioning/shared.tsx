import { useEffect, useState } from 'react';
import { deriveProvisioning, type Provisioning, type ProvisioningInputs, type StepState } from './deriveProvisioning';

export interface ProvisioningItem {
  inputs: ProvisioningInputs;
  derived: Provisioning;
}

export const fmtDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Re-renders every second so elapsed time and the running step move between polls. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** `typicalByKind` supplies measured typical durations for a kind of service; without it the estimates apply. */
export const toItems = (
  inputs: ProvisioningInputs[],
  now: number,
  typicalByKind?: (kind: string) => Record<string, number> | undefined,
): ProvisioningItem[] =>
  inputs.map(i => ({ inputs: i, derived: deriveProvisioning(i, now, typicalByKind?.(i.xr.kind)) }));

export const stateLabel: Record<StepState, string> = {
  done: 'done',
  run: 'in progress',
  pend: 'waiting',
  fail: 'failed',
};
