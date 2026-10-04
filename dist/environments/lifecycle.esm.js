const prLink = (label, pr) => pr ? [{ label, url: pr.url, state: pr.state }] : void 0;
function prStep(id, title, desc, pr, waiting) {
  if (!pr) return { id, title, desc, state: "pend", detail: waiting };
  if (pr.state === "merged") return { id, title, desc, state: "done", links: prLink(`PR #${pr.number}`, pr) };
  if (pr.state === "closed") return { id, title, desc, state: "fail", detail: "The pull request was closed without merging.", links: prLink(`PR #${pr.number}`, pr) };
  return { id, title, desc, state: "run", detail: "Waiting for the pull request to be merged.", links: prLink(`PR #${pr.number}`, pr) };
}
function deriveEnvLifecycle(i) {
  const cicd = i.declared ? { id: "cicd", title: "cicd.yaml declares it", desc: `${i.env} is in the service's environment list.`, state: "done" } : {
    id: "cicd",
    title: "cicd.yaml change merged",
    desc: `Adds ${i.env} to the service's environment list.`,
    state: i.cicdPrUrl ? "run" : "pend",
    detail: i.cicdPrUrl ? "Waiting for the pull request to be merged." : void 0,
    links: i.cicdPrUrl ? [{ label: "Pull request", url: i.cicdPrUrl, state: "open" }] : void 0
  };
  if (i.tier === "ground") {
    const file = {
      id: "values",
      title: `platform/envs/${i.env}.yaml exists`,
      desc: "The values file the environment deploys from.",
      state: i.valuesFileExists ? "done" : "pend",
      links: i.valuesFileUrl && i.valuesFileExists ? [{ label: "View file", url: i.valuesFileUrl }] : void 0
    };
    const onboarding = prStep(
      "onboarding",
      "Onboarding pull request",
      `Glidepath opens a pull request that adds platform/envs/${i.env}.yaml once cicd.yaml has merged.`,
      i.onboardingPr,
      i.declared ? "Not opened yet: Glidepath opens it shortly after the merge." : "Opens after the cicd.yaml change merges."
    );
    if (!i.declared) onboarding.state = "pend";
    const live = {
      id: "workload",
      title: "Deployed",
      desc: "Argo CD creates the namespace and the first deploy puts the service in it.",
      state: i.deployed ? "done" : "pend",
      detail: i.deployed ? void 0 : "Deploys on the next push to the default branch once the values file exists."
    };
    return [cicd, onboarding, file, live];
  }
  const request = prStep(
    "request",
    "ApplicationEnvironment request",
    "A request pull request on the tenants repo asks for the environment.",
    i.requestPr,
    "Opened with the cicd.yaml change."
  );
  if (i.tenantsRepoUrl && !request.links) request.links = [{ label: "Tenants repo", url: i.tenantsRepoUrl }];
  let applied = {
    id: "applied",
    title: "Applied by Crossplane",
    desc: "Argo CD applies the merged request and Crossplane creates the environment.",
    state: "pend"
  };
  if (i.xr?.found) {
    if (i.xr.failed) applied = { ...applied, state: "fail", detail: i.xr.failed };
    else applied = { ...applied, state: i.xr.synced ? "done" : "run", detail: i.xr.synced ? void 0 : "Reconciling." };
  }
  const ready = (i.files ?? []).filter((f) => f.ready).length;
  const total = (i.files ?? []).length;
  let filesState = "pend";
  if (total > 0) filesState = ready === total ? "done" : "run";
  const files = {
    id: "files",
    title: "Files written to GitHub",
    desc: "The identity, secret store requests and values.yaml are committed.",
    state: filesState,
    detail: total > 0 && ready < total ? `${ready} of ${total} written.` : void 0,
    links: i.gitopsRepoUrl ? [{ label: "GitOps repo", url: i.gitopsRepoUrl }] : void 0
  };
  let secrets = {
    id: "secrets",
    title: "Secret store (Infisical)",
    desc: "A project for this environment, and the identity that reads it.",
    state: "pend"
  };
  if (i.secrets?.found) {
    if (i.secrets.failed) secrets = { ...secrets, state: "fail", detail: i.secrets.failed };
    else secrets = { ...secrets, state: i.secrets.ready ? "done" : "run", detail: i.secrets.ready ? void 0 : "Creating the project." };
  }
  if (i.infisicalUrl && i.secrets?.ready) secrets.links = [{ label: "Infisical project", url: i.infisicalUrl }];
  const values = {
    id: "values",
    title: "Values file ready",
    desc: `${i.env}'s values can be edited here once values.yaml exists.`,
    state: i.valuesFileExists ? "done" : "pend",
    links: i.valuesFileUrl && i.valuesFileExists ? [{ label: "View file", url: i.valuesFileUrl }] : void 0
  };
  const deployed = i.deployed || i.xr?.workloadDeployed;
  const first = {
    id: "workload",
    title: "First deploy",
    desc: "The first release to this environment.",
    state: deployed ? "done" : "pend",
    detail: !deployed && i.xr?.workloadReason === "NoImageYet" ? "Waiting for the first release: nothing has been released to this environment yet." : void 0
  };
  return [cicd, request, applied, files, secrets, values, first];
}
function currentStep(steps) {
  return steps.find((s) => s.state !== "done");
}

export { currentStep, deriveEnvLifecycle };
//# sourceMappingURL=lifecycle.esm.js.map
