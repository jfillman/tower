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
function followUps(before, after, target) {
  const out = [];
  const had = new Set(before.map((e) => e.name));
  const cloud = (target) !== "k8s-rollout";
  for (const e of after) {
    if (had.has(e.name)) continue;
    if (e.tier === "ground" && !cloud) {
      out.push(`Glidepath then opens a pull request on the source repo adding platform/envs/${e.name}.yaml. Merge it to finish creating ${e.name}.`);
    }
  }
  return out;
}

export { CLOUD_BLOCKS, applyStaged, buildDeploy, describeChanges, followUps, readEnvironments, stageSetBlock, validateEnvironments };
//# sourceMappingURL=stagedChanges.esm.js.map
