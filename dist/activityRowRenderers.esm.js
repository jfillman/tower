import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { Fragment as Fragment$1 } from 'react';
import Typography from '@material-ui/core/Typography';
import { relativeTime, formatDateTime } from './shared/format.esm.js';
import { imageTag, ENV_TIER_LABEL, envTierOf } from './types.esm.js';
import { slugHue } from './PipelineRunList.esm.js';
import { nicknameForImageTag } from './useReleaseContext.esm.js';
import { CommitIcon, ImageIcon, EnvIcon, PreviewIcon, PipelineIcon, ConfigIcon } from './activityIcons.esm.js';

function extractLine(description, label) {
  if (!description) return void 0;
  return description.match(new RegExp(`^${label}: (.+)$`, "m"))?.[1];
}
function extractEnvLine(description, label) {
  return extractLine(description, label)?.toLowerCase();
}
function prNumberFromUrl(url) {
  return url.match(/\/pull\/(\d+)/)?.[1];
}
function PillChain({
  items,
  n,
  ctx
}) {
  return /* @__PURE__ */ jsxs("div", { className: ctx.classes.pillChain, children: [
    /* @__PURE__ */ jsx(
      "span",
      {
        className: ctx.classes.time,
        title: formatDateTime(String(n.created)),
        children: relativeTime(n.created)
      }
    ),
    items.map((item, i) => {
      const plain = item.variant === "plain";
      const interactive = Boolean(item.href || item.onClick);
      let className = ctx.classes.pillStatic;
      if (plain) className = ctx.classes.authorLink;
      else if (interactive) className = ctx.classes.pill;
      const style = plain ? void 0 : { color: item.fg ?? ctx.fg, backgroundColor: item.bg ?? ctx.bg };
      const inner = /* @__PURE__ */ jsxs(Fragment, { children: [
        item.icon && /* @__PURE__ */ jsx(item.icon, { width: 11, height: 11 }),
        item.label
      ] });
      let node;
      if (item.href) {
        node = /* @__PURE__ */ jsx(
          "a",
          {
            className,
            style,
            href: item.href,
            target: "_blank",
            rel: "noopener noreferrer",
            title: item.title,
            children: inner
          }
        );
      } else if (item.onClick) {
        node = /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className,
            style,
            onClick: item.onClick,
            title: item.title,
            children: inner
          }
        );
      } else {
        node = /* @__PURE__ */ jsx("span", { className, style, title: item.title, children: inner });
      }
      return /* @__PURE__ */ jsxs(Fragment$1, { children: [
        i > 0 && /* @__PURE__ */ jsx("span", { className: ctx.classes.chainArrow, children: "\u2192" }),
        node
      ] }, item.key);
    })
  ] });
}
function renderBuildRow(n, ctx) {
  const desc = n.payload.description;
  const repoMatch = extractLine(desc, "Repo")?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const imageRef = extractLine(desc, "Image");
  const runName = extractLine(desc, "Run");
  const tag = imageRef ? imageTag(imageRef) : void 0;
  const failed = n.payload.title.toLowerCase().includes("failed");
  const items = [];
  if (repoShort && sha) {
    items.push({
      key: "commit",
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`
    });
  }
  if (runName) {
    items.push({
      key: "ci",
      icon: PipelineIcon,
      label: "CI run",
      onClick: () => ctx.goToRun(runName),
      title: runName
    });
  }
  if (tag) {
    items.push({
      key: "published",
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: "View in Images tab"
    });
    const nickname = nicknameForImageTag(tag, ctx.pipelineRuns);
    if (nickname) {
      const hue = slugHue(nickname);
      items.push({
        key: "nickname",
        label: nickname,
        fg: `hsl(${hue}, 65%, 60%)`,
        bg: `hsla(${hue}, 65%, 60%, 0.12)`,
        title: "This build's flow, shared by every stage of the same run"
      });
    }
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Typography, { className: ctx.classes.rowTitle, children: failed ? "Build failed" : "Build completed, image pushed to registry" }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderDeployRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Environment");
  const repoMatch = extractLine(desc, "Repo")?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const imageRef = extractLine(desc, "Image");
  const runName = extractLine(desc, "Run");
  const tag = imageRef ? imageTag(imageRef) : void 0;
  const title = n.payload.title.toLowerCase();
  const outcome = title.includes("failed") ? "failed" : title.includes("cancelled") ? "cancelled" : "succeeded";
  const items = [];
  if (repoShort && sha) {
    items.push({
      key: "commit",
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`
    });
  }
  if (runName) {
    items.push({
      key: "ci",
      icon: PipelineIcon,
      label: "CI run",
      onClick: () => ctx.goToRun(runName),
      title: runName
    });
  }
  if (tag) {
    items.push({
      key: "image",
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: "View in Images tab"
    });
    const nickname = nicknameForImageTag(tag, ctx.pipelineRuns);
    if (nickname) {
      const hue = slugHue(nickname);
      items.push({
        key: "nickname",
        label: nickname,
        fg: `hsl(${hue}, 65%, 60%)`,
        bg: `hsla(${hue}, 65%, 60%, 0.12)`,
        title: "This build's flow, shared by every stage of the same run"
      });
    }
  }
  if (env) {
    items.push({
      key: "env",
      icon: EnvIcon,
      label: env,
      onClick: () => ctx.goToEnv(env)
    });
  }
  const headline = outcome === "failed" ? `Deploy failed${env ? ` in ${env}` : ""}` : outcome === "cancelled" ? `Deploy cancelled${env ? ` in ${env}` : ""}` : `Deploy succeeded${env ? ` in ${env}` : ""}`;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Typography, { className: ctx.classes.rowTitle, children: headline }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderPreviewEnvRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Environment");
  const prUrl = extractLine(desc, "PR");
  const author = extractLine(desc, "Opened by");
  const action = n.payload.title.includes("Deleted") ? "deleted" : "created";
  const prNumber = prUrl ? prNumberFromUrl(prUrl) : void 0;
  const items = [];
  if (prUrl) {
    items.push({
      key: "pr",
      icon: PreviewIcon,
      label: prNumber ? `PR #${prNumber}` : "Pull request",
      href: prUrl
    });
  }
  if (author) {
    items.push({
      key: "author",
      label: `opened by ${author}`,
      href: `https://github.com/${author}`,
      variant: "plain"
    });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Typography, { className: ctx.classes.rowTitle, children: [
      "Preview env ",
      env ?? "\u2014",
      " ",
      action
    ] }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderEnvRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Environment");
  const cluster = extractEnvLine(desc, "Cluster");
  const action = n.payload.title.includes("Deleted") ? "decommissioned" : "provisioned";
  const tierLabel = env ? ENV_TIER_LABEL[envTierOf(env, ctx.pipelineOrder)] : void 0;
  const items = [];
  if (tierLabel) items.push({ key: "tier", label: tierLabel });
  if (cluster) items.push({ key: "cluster", label: cluster });
  if (env)
    items.push({
      key: "env",
      icon: EnvIcon,
      label: env,
      onClick: () => ctx.goToEnv(env)
    });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Typography, { className: ctx.classes.rowTitle, children: [
      "Environment ",
      env ?? "\u2014",
      " ",
      action
    ] }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderConfigRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Env");
  const author = extractLine(desc, "Author");
  const prUrl = extractLine(desc, "PR");
  const prNumber = prUrl ? prNumberFromUrl(prUrl) : void 0;
  const items = [];
  if (author)
    items.push({
      key: "author",
      label: author,
      href: `https://github.com/${author}`
    });
  if (prUrl)
    items.push({
      key: "diff",
      icon: ConfigIcon,
      label: "View diff",
      href: `${prUrl}/files`
    });
  if (prUrl)
    items.push({
      key: "pr",
      label: prNumber ? `PR #${prNumber}` : "Pull request",
      href: prUrl
    });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Typography, { className: ctx.classes.rowTitle, children: [
      "Config changed for env ",
      env ?? "\u2014"
    ] }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderReleaseRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Environment");
  const repoMatch = extractLine(desc, "Repo")?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const imageRef = extractLine(desc, "Image");
  const tag = imageRef ? imageTag(imageRef) : void 0;
  const prUrl = extractLine(desc, "PR");
  const prNumber = prUrl ? prNumberFromUrl(prUrl) : void 0;
  const failed = n.payload.title.toLowerCase().includes("failed");
  const items = [];
  if (repoShort && sha) {
    items.push({
      key: "commit",
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`
    });
  }
  if (tag) {
    items.push({
      key: "image",
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: "View in Images tab"
    });
  }
  if (prUrl) {
    items.push({
      key: "pr",
      icon: PreviewIcon,
      label: prNumber ? `PR #${prNumber}` : "Pull request",
      href: prUrl
    });
  }
  if (env) {
    items.push({
      key: "env",
      icon: EnvIcon,
      label: env,
      onClick: () => ctx.goToTopology(env)
    });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Typography, { className: ctx.classes.rowTitle, children: failed ? `Release trigger failed for ${env ?? "\u2014"}` : `Release triggered for ${env ?? "\u2014"}` }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderDeployingRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Environment");
  const repoMatch = extractLine(desc, "Repo")?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const rawImageTag = env && sha ? ctx.deployHistory?.[env]?.find((e) => e.sha === sha)?.imageTag : void 0;
  const tag = rawImageTag ? imageTag(rawImageTag) : void 0;
  const items = [];
  if (repoShort && sha) {
    items.push({
      key: "commit",
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`
    });
  }
  if (tag) {
    items.push({
      key: "image",
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: "View in Images tab"
    });
  }
  if (env) {
    items.push({
      key: "env",
      icon: EnvIcon,
      label: `${env} \xB7 ArgoCD sync started`,
      onClick: () => ctx.goToEnv(env)
    });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Typography, { className: ctx.classes.rowTitle, children: [
      "Deploying release to ",
      env ?? "\u2014"
    ] }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx })
  ] });
}
function renderReleaseOutcomeRow(n, ctx) {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, "Environment");
  const chainId = extractLine(desc, "Chain");
  const succeeded = n.payload.title.toLowerCase().includes("succeeded");
  const items = [];
  if (env) {
    items.push({
      key: "env",
      icon: EnvIcon,
      label: `${env} \xB7 ${succeeded ? "Healthy" : "Degraded"}`,
      onClick: () => ctx.goToEnv(env)
    });
  }
  const siblings = chainId ? ctx.allNotifications.filter(
    (sib) => sib.id !== n.id && (sib.payload.topic === "release" || sib.payload.topic === "deploying") && extractLine(sib.payload.description, "Chain") === chainId
  ).sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
  ) : [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Typography, { className: ctx.classes.rowTitle, children: succeeded ? `Release succeeded in ${env ?? "\u2014"}` : `Release failed in ${env ?? "\u2014"}` }),
    /* @__PURE__ */ jsx(PillChain, { items, n, ctx }),
    siblings.length > 0 && /* @__PURE__ */ jsx("div", { className: ctx.classes.subSteps, children: siblings.map((sib, i) => /* @__PURE__ */ jsxs("div", { className: ctx.classes.subStep, children: [
      /* @__PURE__ */ jsx("span", { className: ctx.classes.subStepDot }),
      i < siblings.length - 1 && /* @__PURE__ */ jsx("span", { className: ctx.classes.subStepLine }),
      /* @__PURE__ */ jsx("span", { className: ctx.classes.subStepLabel, children: sib.payload.title }),
      /* @__PURE__ */ jsx(
        "span",
        {
          className: ctx.classes.subStepTime,
          title: formatDateTime(String(sib.created)),
          children: relativeTime(sib.created)
        }
      )
    ] }, sib.id)) })
  ] });
}
const CUSTOM_ROW_RENDERERS = {
  build: renderBuildRow,
  deploy: renderDeployRow,
  "preview-env": renderPreviewEnvRow,
  env: renderEnvRow,
  config: renderConfigRow,
  release: renderReleaseRow,
  deploying: renderDeployingRow,
  "release-outcome": renderReleaseOutcomeRow
};

export { CUSTOM_ROW_RENDERERS, renderBuildRow, renderConfigRow, renderDeployRow, renderDeployingRow, renderEnvRow, renderPreviewEnvRow, renderReleaseOutcomeRow, renderReleaseRow };
//# sourceMappingURL=activityRowRenderers.esm.js.map
