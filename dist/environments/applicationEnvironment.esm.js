import { useState, useCallback } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

const APPLICATION_ENVIRONMENT_TEMPLATE = "template:default/applicationenvironments.catalog.hangar.io-v1alpha1";
const ENV_NAME = /^[a-z][a-z0-9-]{0,30}$/;
function templateValues(input) {
  return {
    appName: input.appName,
    appType: "app",
    cluster: input.cluster,
    configMapGenerator: false,
    env: input.env,
    // Open the request pull request, not just a downloadable manifest.
    pushToGit: true
  };
}
function validateLaunchInput(input) {
  if (!input.appName) return "The application name is missing.";
  if (!ENV_NAME.test(input.env)) {
    return 'The environment name must be lowercase letters, digits and "-", start with a letter, and be at most 31 characters.';
  }
  if (!input.cluster) return "Choose the cluster the environment runs on.";
  return void 0;
}
async function launchApplicationEnvironment({ discoveryApi, fetchApi }, input) {
  const problem = validateLaunchInput(input);
  if (problem) throw new Error(problem);
  const base = await discoveryApi.getBaseUrl("scaffolder");
  const res = await fetchApi.fetch(`${base}/v2/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateRef: APPLICATION_ENVIRONMENT_TEMPLATE, values: templateValues(input) })
  });
  if (res.status === 403 || res.status === 401) {
    throw new Error(
      "Backstage did not allow running the environment template. Creating environments is limited to the platform admin."
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => void 0);
    throw new Error(body?.error?.message ?? `Launching the template failed with ${res.status}.`);
  }
  const { id } = await res.json();
  if (!id) throw new Error("The scaffolder did not return a task id.");
  return id;
}
const completionOf = (events) => events.find((e) => e.type === "completion");
function prUrlFromEvents(events) {
  const links = completionOf(events)?.body?.output?.links ?? [];
  const named = links.find((l) => /pull request/i.test(l.title ?? "") && l.url);
  return (named ?? links.find((l) => /\/pull\//.test(l.url ?? "")))?.url;
}
function failureFromEvents(events) {
  const c = completionOf(events);
  if (!c) return void 0;
  if (c.body?.error) return c.body.error.message ?? c.body.error.name ?? "The template run failed.";
  return /failed|cancel/i.test(c.body?.message ?? "") ? c.body?.message : void 0;
}
async function waitForTask({ discoveryApi, fetchApi }, taskId, timeoutMs = 12e4) {
  const base = await discoveryApi.getBaseUrl("scaffolder");
  const deadline = Date.now() + timeoutMs;
  const seen = [];
  let after;
  while (Date.now() < deadline) {
    const res = await fetchApi.fetch(`${base}/v2/tasks/${encodeURIComponent(taskId)}/events${after === void 0 ? "" : `?after=${after}`}`);
    if (!res.ok) return { ok: false, error: `Reading the template run failed with ${res.status}.` };
    const events = await res.json();
    seen.push(...events);
    if (events.length > 0) after = events[events.length - 1].id;
    if (completionOf(seen)) {
      const error = failureFromEvents(seen);
      if (error) return { ok: false, error };
      const prUrl = prUrlFromEvents(seen);
      return prUrl ? { ok: true, prUrl } : { ok: false, error: "The template finished but did not report a pull request." };
    }
  }
  return { ok: false, error: "The template run did not finish in time. Check it in the Create page." };
}
function useLaunchApplicationEnvironment() {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [state, setState] = useState({ status: "idle" });
  const launch = useCallback(
    async (input) => {
      setState({ status: "running" });
      let result;
      try {
        const api = { discoveryApi, fetchApi };
        const taskId = await launchApplicationEnvironment(api, input);
        const outcome = await waitForTask(api, taskId);
        result = outcome.ok ? { status: "done", prUrl: outcome.prUrl } : { status: "failed", error: outcome.error };
      } catch (e) {
        result = { status: "failed", error: e.message };
      }
      setState(result);
      return result;
    },
    [discoveryApi, fetchApi]
  );
  return { state, launch, reset: () => setState({ status: "idle" }) };
}

export { APPLICATION_ENVIRONMENT_TEMPLATE, failureFromEvents, launchApplicationEnvironment, prUrlFromEvents, templateValues, useLaunchApplicationEnvironment, validateLaunchInput, waitForTask };
//# sourceMappingURL=applicationEnvironment.esm.js.map
