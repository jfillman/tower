const CLOUD_BLOCKS = ["ecs", "lambda", "azureContainerApps"];
const TARGET_BLOCK = {
  "aws-ecs": "ecs",
  "aws-lambda": "lambda",
  "azure-container-apps": "azureContainerApps"
};
const ENV_NAME = /^[a-z][a-z0-9-]{0,30}$/;
const asBlock = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : void 0;
function readEnvironments(deploy) {
  const d = deploy ?? {};
  const declared = d.environments;
  if (Array.isArray(declared) && declared.length > 0) {
    const envs2 = [];
    for (const raw of declared) {
      const e = asBlock(raw);
      if (!e || typeof e.name !== "string") continue;
      const env = { name: e.name, tier: e.tier === "flight" ? "flight" : "ground" };
      if (typeof e.cluster === "string" && e.cluster) env.cluster = e.cluster;
      for (const b of CLOUD_BLOCKS) {
        const v = asBlock(e[b]);
        if (v) env[b] = v;
      }
      envs2.push(env);
    }
    return { shape: "new", envs: envs2 };
  }
  const lower = Array.isArray(d.lowerEnvironments) ? d.lowerEnvironments : ["dev"];
  const upper = (Array.isArray(d.upperEnvironments) ? d.upperEnvironments : []).map(
    (u) => typeof u === "string" ? { name: u } : u
  );
  const envs = [
    ...lower.map((name) => ({ name, tier: "ground" })),
    ...upper.map((u) => u.cluster ? { name: u.name, tier: "flight", cluster: u.cluster } : { name: u.name, tier: "flight" })
  ];
  const order = Array.isArray(d.promotionOrder) ? d.promotionOrder : [];
  const names = envs.map((e) => e.name);
  if (order.length === names.length && new Set(order).size === order.length && order.every((n) => names.includes(n))) {
    return { shape: "old", envs: order.map((n) => envs.find((e) => e.name === n)) };
  }
  return { shape: "old", envs };
}
const firstIndexOfTier = (envs, tier) => envs.findIndex((e) => e.tier === tier);
function applyStaged(envs, staged) {
  let out = envs.map((e) => ({ ...e }));
  for (const s of staged) {
    if (s.kind === "add") {
      const at = s.env.tier === "ground" ? firstIndexOfTier(out, "flight") : -1;
      if (at === -1) out.push({ ...s.env });
      else out.splice(at, 0, { ...s.env });
    } else if (s.kind === "remove") {
      out = out.filter((e) => e.name !== s.name);
    } else if (s.kind === "setBlock") {
      out = out.map((e) => {
        if (e.name !== s.name) return e;
        const next = { ...e };
        if (s.value && Object.keys(s.value).length > 0) next[s.block] = s.value;
        else delete next[s.block];
        return next;
      });
    } else {
      const i = out.findIndex((e) => e.name === s.name);
      if (i === -1) continue;
      const j = i + (s.direction === "up" ? -1 : 1);
      if (out[j] && out[j].tier === out[i].tier) {
        [out[i], out[j]] = [out[j], out[i]];
      }
    }
  }
  return out;
}
function stageSetBlock(staged, name, block, value) {
  return [
    ...staged.filter((s) => !(s.kind === "setBlock" && s.name === name && s.block === block)),
    { kind: "setBlock", name, block, value }
  ];
}
function validateEnvironments(envs, target) {
  const problems = [];
  const t = target || "k8s-rollout";
  const wantBlock = TARGET_BLOCK[t];
  const cloud = t !== "k8s-rollout";
  if (envs.length === 0) problems.push("An app needs at least one environment.");
  const seen = /* @__PURE__ */ new Set();
  for (const e of envs) {
    if (!ENV_NAME.test(e.name)) {
      problems.push(`"${e.name}" is not a valid environment name (lowercase letters, digits and "-", starting with a letter, at most 31 characters).`);
    }
    if (seen.has(e.name)) problems.push(`Environment "${e.name}" is listed twice.`);
    seen.add(e.name);
    if (e.tier === "ground" && e.cluster) {
      problems.push(`Ground environment "${e.name}" sets a cluster. Ground environments on other clusters are not supported yet.`);
    }
    if (e.tier === "flight" && cloud) {
      problems.push(`Flight environment "${e.name}" is not supported for ${t} yet: cloud targets have no approval path for Flight environments.`);
    }
    for (const b of CLOUD_BLOCKS) {
      if (e[b] && b !== wantBlock) {
        problems.push(`Environment "${e.name}" sets ${b}, but this app's target is ${t}.`);
      }
    }
  }
  return problems;
}
function buildDeploy(originalDeploy, envs) {
  const {
    lowerEnvironments: _l,
    upperEnvironments: _u,
    promotionOrder: _p,
    environments: _e,
    ...rest
  } = originalDeploy ?? {};
  const serialize = (e) => {
    const o = { name: e.name, tier: e.tier };
    if (e.cluster) o.cluster = e.cluster;
    for (const b of CLOUD_BLOCKS) if (e[b]) o[b] = e[b];
    return o;
  };
  return { ...rest, environments: envs.map(serialize) };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function describeChanges(before, after, shape) {
  const lines = [];
  const beforeBy = new Map(before.map((e) => [e.name, e]));
  const afterBy = new Map(after.map((e) => [e.name, e]));
  after.forEach((e, i) => {
    if (!beforeBy.has(e.name)) {
      const prev = after[i - 1];
      lines.push({
        kind: "add",
        title: `Add environment ${e.name}`,
        detail: `${e.tier === "flight" ? "Flight" : "Ground"}${prev ? `, after ${prev.name}` : ""}`
      });
    }
  });
  before.forEach((e) => {
    if (!afterBy.has(e.name)) lines.push({ kind: "remove", title: `Remove environment ${e.name}` });
  });
  for (const e of after) {
    const old = beforeBy.get(e.name);
    if (!old) continue;
    for (const b of CLOUD_BLOCKS) {
      const keys = /* @__PURE__ */ new Set([...Object.keys(old[b] ?? {}), ...Object.keys(e[b] ?? {})]);
      for (const k of [...keys].sort()) {
        const was = old[b]?.[k];
        const now = e[b]?.[k];
        if (!same(was, now)) {
          lines.push({
            kind: "edit",
            title: `${e.name}: ${b}.${k}`,
            detail: now === void 0 ? `${String(was)} removed (the app-level value applies)` : `${was === void 0 ? "app-level value" : String(was)} to ${String(now)}`
          });
        }
      }
    }
  }
  const keptBefore = before.filter((e) => afterBy.has(e.name)).map((e) => e.name);
  const keptAfter = after.filter((e) => beforeBy.has(e.name)).map((e) => e.name);
  if (!same(keptBefore, keptAfter)) {
    lines.push({ kind: "reorder", title: "Change the promotion order", detail: after.map((e) => e.name).join(" to ") });
  }
  if (lines.length > 0 && shape === "old") {
    lines.unshift({
      kind: "migrate",
      title: "Convert the environment list to deploy.environments",
      detail: "lowerEnvironments, upperEnvironments and promotionOrder are replaced by one list. Nothing else changes."
    });
  }
  return lines;
}
function envFilePaths(env) {
  return ["platform", "glidepath"].flatMap((dir) => [`${dir}/envs/${env}.yaml`, `${dir}/envs/${env}.release.yaml`]);
}
function pipelinesNamingEnv(pipelines, env) {
  let entries = [];
  if (Array.isArray(pipelines)) entries = pipelines.map((p, i) => [String(p?.name ?? i), p]);
  else if (pipelines && typeof pipelines === "object") entries = Object.entries(pipelines);
  return entries.filter(([, p]) => {
    const steps = Array.isArray(p) ? p : p?.steps;
    return Array.isArray(steps) && steps.some((st) => st?.env === env);
  }).map(([name]) => name);
}
function removedEnvs(before, after) {
  const kept = new Set(after.map((e) => e.name));
  return before.filter((e) => !kept.has(e.name));
}
function validateRemovals(before, after, pipelines) {
  const problems = [];
  for (const e of removedEnvs(before, after)) {
    if (e.tier === "flight") {
      problems.push(`Flight environment "${e.name}" cannot be removed from here: removing it by hand is described in its row.`);
    }
    for (const p of pipelinesNamingEnv(pipelines, e.name)) {
      problems.push(`Pipeline "${p}" still has a step for "${e.name}". Remove that step in the Glidepath tab first.`);
    }
  }
  return problems;
}
function deleteFilesFor(before, after, target) {
  if ((target) !== "k8s-rollout") return [];
  return removedEnvs(before, after).filter((e) => e.tier === "ground").flatMap((e) => envFilePaths(e.name));
}
function followUps(before, after, target, appName) {
  const out = [];
  const had = new Set(before.map((e) => e.name));
  const cloud = (target) !== "k8s-rollout";
  for (const e of removedEnvs(before, after)) {
    if (e.tier !== "ground") continue;
    out.push(
      cloud ? `${e.name} is removed from cicd.yaml only. The ${target} resource it deployed to is not deleted: remove it in your cloud account.` : `The pull request also deletes platform/envs/${e.name}.yaml. After it merges Argo CD removes ${appName ? `${appName}-${e.name}` : `the ${e.name} Application`} and everything running in the ${appName ? `app-${appName}-${e.name}` : e.name} namespace.`
    );
  }
  for (const e of after) {
    if (had.has(e.name)) continue;
    if (e.tier === "flight" && !cloud) {
      out.push(
        `${e.name} is created by an ApplicationEnvironment request on the tenants repo, opened first. Merge that one before the cicd.yaml change, so the environment exists when cicd.yaml names it. Crossplane then adds its gitops directory and the Application.`
      );
    }
    if (e.tier === "ground" && !cloud) {
      out.push(`Glidepath then opens a pull request on the source repo adding platform/envs/${e.name}.yaml. Merge it to finish creating ${e.name}.`);
    }
  }
  return out;
}
function addedFlightEnvs(before, after) {
  const had = new Set(before.map((e) => e.name));
  return after.filter((e) => e.tier === "flight" && !had.has(e.name));
}
function validateAddedFlight(before, after, target) {
  const out = [];
  const cloud = (target || "k8s-rollout") !== "k8s-rollout";
  for (const e of addedFlightEnvs(before, after)) {
    if (cloud) continue;
    if (!e.cluster) out.push(`Flight environment "${e.name}" needs the cluster it runs on, for example kind-prod.`);
  }
  return out;
}
const isStage = (st, ...stages) => stages.includes(String(st.stage));
function pipelineSlots(pipelines) {
  const clone = JSON.parse(JSON.stringify(pipelines ?? null));
  const slots = [];
  const add = (name, holder) => {
    const steps = holder.steps;
    if (!Array.isArray(steps)) return;
    slots.push({
      name,
      steps,
      get: () => holder.steps,
      set: (next) => {
        holder.steps = next;
      }
    });
  };
  if (Array.isArray(clone)) {
    clone.forEach((p, i) => {
      if (p && typeof p === "object" && !Array.isArray(p)) add(String(p.name ?? i), p);
    });
  } else if (clone && typeof clone === "object") {
    for (const [name, p] of Object.entries(clone)) {
      if (p && typeof p === "object" && !Array.isArray(p)) add(name, p);
    }
  }
  return { copy: clone, slots };
}
function planReleaseSteps(pipelines, envs, names) {
  const { copy, slots } = pipelineSlots(pipelines);
  const plan = { pipelines, added: [], skipped: [] };
  if (names.length === 0) return plan;
  if (slots.length === 0) {
    plan.skipped = names.map((env) => ({ env, reason: "the service has no pipeline with steps to add it to" }));
    return plan;
  }
  const weight = (sl) => sl.steps.filter((st) => isStage(st, "deploy", "release")).length;
  const main = slots.reduce((best, sl) => weight(sl) > weight(best) ? sl : best, slots[0]);
  for (const env of names) {
    if (slots.some((sl) => sl.steps.some((st) => st.env === env))) {
      plan.skipped.push({ env, reason: "a pipeline already has a step for it" });
      continue;
    }
    const i = envs.findIndex((e) => e.name === env);
    const prev = i > 0 ? envs[i - 1].name : void 0;
    const steps = [...main.get()];
    let at = steps.length;
    if (prev) {
      for (let k = steps.length - 1; k >= 0; k--) {
        if (steps[k].env === prev) {
          at = k + 1;
          break;
        }
      }
    }
    steps.splice(at, 0, { stage: "release", env });
    main.set(steps);
    plan.added.push({ env, pipeline: main.name, ...prev && at > 0 && steps[at - 1].env === prev ? { after: prev } : {} });
  }
  if (plan.added.length > 0) plan.pipelines = copy;
  return plan;
}
function releaseStepEnvs(staged, after) {
  const alive = new Set(after.filter((e) => e.tier === "flight").map((e) => e.name));
  return staged.flatMap((s) => s.kind === "add" && s.releaseStep && alive.has(s.env.name) ? [s.env.name] : []);
}
function copiedEnvs(staged, after) {
  return staged.flatMap((s) => {
    if (s.kind !== "add" || !s.copyValuesFrom) return [];
    const env = after.find((e) => e.name === s.env.name);
    return env ? [{ env, from: s.copyValuesFrom }] : [];
  });
}

export { CLOUD_BLOCKS, addedFlightEnvs, applyStaged, buildDeploy, copiedEnvs, deleteFilesFor, describeChanges, envFilePaths, followUps, pipelinesNamingEnv, planReleaseSteps, readEnvironments, releaseStepEnvs, removedEnvs, stageSetBlock, validateAddedFlight, validateEnvironments, validateRemovals };
//# sourceMappingURL=stagedChanges.esm.js.map
