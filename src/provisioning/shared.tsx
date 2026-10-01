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

export const toItems = (inputs: ProvisioningInputs[], now: number): ProvisioningItem[] =>
  inputs.map(i => ({ inputs: i, derived: deriveProvisioning(i, now) }));

export const stateLabel: Record<StepState, string> = {
  done: 'done',
  run: 'in progress',
  pend: 'waiting',
  fail: 'failed',
};
