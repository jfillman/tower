import { useCallback, useState } from 'react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

// Creating a Flight environment. A Flight environment is not something Tower or Glidepath can scaffold
// itself: Airframe's ApplicationEnvironment XR creates it (it commits <cluster>/<env>/values.yaml into
// the app's gitops repo and the identity file the tenant ApplicationSet reads). Backstage already has a
// scaffolder template for requesting that XR, which opens a pull request on the tenants repo. This
// launches that same template through the scaffolder API, as the signed-in user, and reads the PR it
// opened. Nothing is created here that the template does not already create.
//
// Decision and the reasoning: glidepath docs/admin/envs-overhaul-requirements.md, Q2.

export const APPLICATION_ENVIRONMENT_TEMPLATE = 'template:default/applicationenvironments.catalog.hangar.io-v1alpha1';

const ENV_NAME = /^[a-z][a-z0-9-]{0,30}$/;

export interface LaunchEnvironmentInput {
  appName: string;
  env: string;
  /** The registered upper cluster the environment runs on, for example kind-prod. */
  cluster: string;
}

/** The template's own parameters (read from the live template: appName, appType, cluster, configMapGenerator, env, pushToGit). */
export function templateValues(input: LaunchEnvironmentInput) {
  return {
    appName: input.appName,
    appType: 'app',
    cluster: input.cluster,
    configMapGenerator: false,
    env: input.env,
    // Open the request pull request, not just a downloadable manifest.
    pushToGit: true,
  };
}

/** Why this input would not be accepted, or undefined. Checked before anything is launched. */
export function validateLaunchInput(input: LaunchEnvironmentInput): string | undefined {
  if (!input.appName) return 'The application name is missing.';
  if (!ENV_NAME.test(input.env)) {
    return 'The environment name must be lowercase letters, digits and "-", start with a letter, and be at most 31 characters.';
  }
  if (!input.cluster) return 'Choose the cluster the environment runs on.';
  return undefined;
}

interface Api {
  discoveryApi: { getBaseUrl(id: string): Promise<string> };
  fetchApi: { fetch: typeof fetch };
}

export async function launchApplicationEnvironment({ discoveryApi, fetchApi }: Api, input: LaunchEnvironmentInput): Promise<string> {
  const problem = validateLaunchInput(input);
  if (problem) throw new Error(problem);
  const base = await discoveryApi.getBaseUrl('scaffolder');
  const res = await fetchApi.fetch(`${base}/v2/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateRef: APPLICATION_ENVIRONMENT_TEMPLATE, values: templateValues(input) }),
  });
  if (res.status === 403 || res.status === 401) {
    throw new Error(
      'Backstage did not allow running the environment template. Creating environments is limited to the platform admin.',
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(body?.error?.message ?? `Launching the template failed with ${res.status}.`);
  }
  const { id } = (await res.json()) as { id?: string };
  if (!id) throw new Error('The scaffolder did not return a task id.');
  return id;
}

export interface TaskEvent {
  id: number;
  type: string;
  body?: {
    message?: string;
    output?: { links?: Array<{ title?: string; url?: string }> };
    error?: { message?: string; name?: string };
  };
}

const completionOf = (events: TaskEvent[]) => events.find(e => e.type === 'completion');

/** The pull request the template opened, from its output links ("Open Pull Request"). */
export function prUrlFromEvents(events: TaskEvent[]): string | undefined {
  const links = completionOf(events)?.body?.output?.links ?? [];
  const named = links.find(l => /pull request/i.test(l.title ?? '') && l.url);
  return (named ?? links.find(l => /\/pull\//.test(l.url ?? '')))?.url;
}

/** What went wrong, if the run failed. */
export function failureFromEvents(events: TaskEvent[]): string | undefined {
  const c = completionOf(events);
  if (!c) return undefined;
  if (c.body?.error) return c.body.error.message ?? c.body.error.name ?? 'The template run failed.';
  return /failed|cancel/i.test(c.body?.message ?? '') ? c.body?.message : undefined;
}

export interface LaunchOutcome {
  ok: boolean;
  prUrl?: string;
  error?: string;
}

/**
 * Follows a launched task until it completes. The events endpoint long-polls (up to 30s per call), so
 * this is a loop of those calls with the last seen event id, not a tight poll.
 */
export async function waitForTask({ discoveryApi, fetchApi }: Api, taskId: string, timeoutMs = 120000): Promise<LaunchOutcome> {
  const base = await discoveryApi.getBaseUrl('scaffolder');
  const deadline = Date.now() + timeoutMs;
  const seen: TaskEvent[] = [];
  let after: number | undefined;
  while (Date.now() < deadline) {
    const res = await fetchApi.fetch(`${base}/v2/tasks/${encodeURIComponent(taskId)}/events${after === undefined ? '' : `?after=${after}`}`);
    if (!res.ok) return { ok: false, error: `Reading the template run failed with ${res.status}.` };
    const events = (await res.json()) as TaskEvent[];
    seen.push(...events);
    if (events.length > 0) after = events[events.length - 1].id;
    if (completionOf(seen)) {
      const error = failureFromEvents(seen);
      if (error) return { ok: false, error };
      const prUrl = prUrlFromEvents(seen);
      return prUrl ? { ok: true, prUrl } : { ok: false, error: 'The template finished but did not report a pull request.' };
    }
  }
  return { ok: false, error: 'The template run did not finish in time. Check it in the Create page.' };
}

export type LaunchState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; prUrl: string }
  | { status: 'failed'; error: string };

/** Launches the ApplicationEnvironment template and follows it to the pull request it opens. */
export function useLaunchApplicationEnvironment() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState<LaunchState>({ status: 'idle' });

  const launch = useCallback(
    async (input: LaunchEnvironmentInput): Promise<LaunchState> => {
      setState({ status: 'running' });
      let result: LaunchState;
      try {
        const api = { discoveryApi, fetchApi };
        const taskId = await launchApplicationEnvironment(api, input);
        const outcome = await waitForTask(api, taskId);
        result = outcome.ok ? { status: 'done', prUrl: outcome.prUrl as string } : { status: 'failed', error: outcome.error as string };
      } catch (e) {
        result = { status: 'failed', error: (e as Error).message };
      }
      setState(result);
      return result;
    },
    [discoveryApi, fetchApi],
  );

  return { state, launch, reset: () => setState({ status: 'idle' }) };
}
