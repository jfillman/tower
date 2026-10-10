import { useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { preventFocusScroll } from '../../preventFocusScroll';
import { useArgoCapabilities } from '../../useReleaseData';
import type { EnvironmentSummary } from '../../types';

// Restart one pod (2026-10-10; backstage /argo/pod-restart). Delegated through Argo CD, which deletes the pod; its
// ReplicaSet starts a replacement. A delete skips the PodDisruptionBudget, so the backend refuses the last ready pod
// on Flight (the Rollout's Restart pods replaces pods a few at a time instead) and asks for explicit downtime on
// Ground, which this control turns into a second confirmation.

type Step = 'idle' | 'confirm' | 'downtime' | 'busy';

export function PodRestartControl({
  env,
  podName,
  buttonClass,
  noteClass,
  badClass,
}: {
  env: EnvironmentSummary;
  podName: string;
  buttonClass: string;
  noteClass: string;
  badClass: string;
}) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const caps = useArgoCapabilities(env.argoAppName ? env.cluster : undefined, env.argoAppName);
  const [step, setStep] = useState<Step>('idle');
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | undefined>();

  let blocked: string | undefined;
  if (!env.argoAppName) blocked = 'No Argo CD Application is known for this environment.';
  else if (caps.data && !caps.data.podRestart) blocked = "Only the app's owning team (or an admin) can restart its pods.";

  const restart = async (acceptDowntime: boolean) => {
    setStep('busy');
    setMessage(undefined);
    try {
      const base = await discoveryApi.getBaseUrl('glidepath');
      const res = await fetchApi.fetch(`${base}/argo/pod-restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster: env.cluster, appName: env.argoAppName, namespace: env.namespace, podName, ...(acceptDowntime ? { acceptDowntime: true } : {}) }),
      });
      const body = await res.json().catch(() => undefined);
      if (res.status === 409 && body?.canAcceptDowntime) {
        setStep('downtime');
        setMessage({ text: body.error });
        return;
      }
      if (!res.ok) throw new Error(body?.error ?? `request failed with ${res.status}`);
      setStep('idle');
      setMessage({ text: `Restarting ${podName}: its replacement will appear in this list shortly.` });
    } catch (e) {
      setStep('idle');
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    }
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        disabled={!!blocked || step === 'busy'}
        title={blocked ?? 'Delete this pod so its ReplicaSet starts a new one. Changes nothing in git.'}
        onMouseDown={preventFocusScroll}
        onClick={() => setStep('confirm')}
      >
        {step === 'busy' ? 'Restarting…' : 'Restart pod'}
      </button>
      {(step === 'confirm' || step === 'downtime') && (
        <div data-testid="pod-restart-confirm" style={{ flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={noteClass}>
            {step === 'confirm'
              ? `Restart ${podName}? Argo CD deletes it and its ReplicaSet starts a new one. A delete skips the PodDisruptionBudget, so the last ready pod is refused on a Flight environment.`
              : `${message?.text} Restart anyway?`}
          </span>
          <button type="button" className={buttonClass} onMouseDown={preventFocusScroll} onClick={() => restart(step === 'downtime')}>
            {step === 'downtime' ? 'Restart anyway' : 'Restart'}
          </button>
          <button
            type="button"
            className={buttonClass}
            onMouseDown={preventFocusScroll}
            onClick={() => {
              setStep('idle');
              setMessage(undefined);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {message && step === 'idle' && (
        <span className={message.bad ? badClass : noteClass} style={{ flexBasis: '100%' }}>
          {message.text}
        </span>
      )}
    </>
  );
}
