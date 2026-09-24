import {
  Fragment,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';
import Typography from '@material-ui/core/Typography';
import type { Notification } from '@backstage/plugin-notifications-common';
import { formatDateTime, relativeTime } from '../shared/format';
import { ENV_TIER_LABEL, envTierOf, imageTag, type DeployHistoryEntry } from './types';
import { slugHue } from './PipelineRunList';
import { nicknameForImageTag } from './useReleaseContext';
import type { PipelineRunSummary } from './tekton/types';
import {
  CommitIcon,
  ConfigIcon,
  EnvIcon,
  ImageIcon,
  PipelineIcon,
  PreviewIcon,
} from './activityIcons';

// Per-topic custom row bodies for RecentActivityPanel - 2026-09-14 feedback:
// a combo of the "Grouped timeline" mockup's day-grouped/connector-line
// structure (kept in RecentActivityPanel.tsx itself) and the "Story cards"
// mockup's pill/chip visual richness, applied one event type at a time
// rather than all six at once ("let's focus on one event and its format at
// a time"). Topics without an entry here still render RecentActivityPanel's
// own generic title+description body - 'slo' is the only one left generic
// so far.
//
// Every custom renderer parses its Notification's plain "Label: value"
// description lines (the one wire format every notify call already speaks -
// see notificationFormatting.tsx's own header) into the specific pills each
// event type needs, rather than requiring new structured payload fields.

export interface ActivityRowClasses {
  rowTitle: string;
  inlineTagLink: string;
  pillChain: string;
  pill: string;
  pillStatic: string;
  chainArrow: string;
  authorLink: string;
  time: string;
  // Nested sub-timeline (2026-09-14 release-flow redesign) - only
  // renderReleaseOutcomeRow uses these, see its own header.
  subSteps: string;
  subStep: string;
  subStepDot: string;
  subStepLine: string;
  subStepLabel: string;
  subStepTime: string;
}

export interface ActivityRowContext {
  goToImage: (tag: string) => void;
  goToRun: (runName: string) => void;
  goToEnv: (env: string) => void;
  goToTopology: (env: string) => void;
  // {lower, upper} env-name lists from this app's own cicd.yaml - the exact
  // shape envTierOf expects (types.ts:416-424) and usePipelineOrder's own
  // hook state already has as top-level fields (see TopologyTab.tsx/
  // CiCdTab.tsx's identical envTierOf(env, pipelineOrder) calls). Still
  // loading is fine - envTierOf's own safe default (Ground) applies.
  pipelineOrder: { lower?: string[]; upper?: string[] } | undefined;
  // For the real flow-correlation nickname (e.g. "lively finch") shown next
  // to an image tag - see useReleaseContext.ts's nicknameForImageTag, the
  // same lookup the release matrix/log use. deployHistory additionally lets
  // renderDeployingRow resolve the image tag its own PreSync CDEvent never
  // carried (see that renderer's header) via a real sha match, rather than
  // fabricating one.
  pipelineRuns: PipelineRunSummary[];
  deployHistory: Record<string, DeployHistoryEntry[]> | undefined;
  fg: string;
  bg: string;
  // Unfiltered/unsliced - renderReleaseOutcomeRow looks its own
  // Triggered/Deploying siblings up in here by chain-id (see its own
  // header), which should still be found even past the panel's current
  // category filter or 30-row cap.
  allNotifications: Notification[];
  classes: ActivityRowClasses;
}

function extractLine(
  description: string | undefined,
  label: string,
): string | undefined {
  if (!description) return undefined;
  return description.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1];
}

// 2026-09-15 feedback: env/cluster names are always lowercase at the
// Kubernetes level (DNS-1123) - rendering them any other way invents a
// display form the real resource doesn't have. Applied at the string
// itself (not a CSS textTransform on rowTitle/pill), since both are shared
// with surrounding prose or other pill kinds (PR numbers, usernames, shas)
// that must keep their own real casing.
function extractEnvLine(description: string | undefined, label: string): string | undefined {
  return extractLine(description, label)?.toLowerCase();
}

function prNumberFromUrl(url: string): string | undefined {
  return url.match(/\/pull\/(\d+)/)?.[1];
}

interface PillItem {
  key: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  href?: string;
  onClick?: () => void;
  title?: string;
  // 'plain' is a lighter-weight link (no colored background) for secondary
  // attribution - e.g. "opened by <user>". Neither href nor onClick means a
  // non-interactive info tag (e.g. a tier or cluster name with no real
  // place to link to) - rendered as plain text, never a dead-looking button.
  variant?: 'pill' | 'plain';
  // Overrides the row's ambient ctx.fg/ctx.bg for just this one pill - e.g.
  // a release's real flow nickname gets its own slugHue color (matching the
  // same chip everywhere else it appears) instead of the topic's fixed tone.
  fg?: string;
  bg?: string;
}

// The timestamp + chained pills line every custom row shares - the "simple
// timestamp... with the vertical connector" from the Grouped timeline
// mockup is the connector drawn by RecentActivityPanel's own row/rowLine
// styles; this is just the timestamp text plus whatever pills a given topic
// needs, arrow-separated the same way the Story cards mockup chained its
// own steps.
function PillChain({
  items,
  n,
  ctx,
}: {
  items: PillItem[];
  n: Notification;
  ctx: ActivityRowContext;
}) {
  return (
    <div className={ctx.classes.pillChain}>
      <span
        className={ctx.classes.time}
        title={formatDateTime(String(n.created))}
      >
        {relativeTime(n.created)}
      </span>
      {items.map((item, i) => {
        const plain = item.variant === 'plain';
        const interactive = Boolean(item.href || item.onClick);
        let className = ctx.classes.pillStatic;
        if (plain) className = ctx.classes.authorLink;
        else if (interactive) className = ctx.classes.pill;
        const style = plain
          ? undefined
          : { color: item.fg ?? ctx.fg, backgroundColor: item.bg ?? ctx.bg };
        const inner = (
          <>
            {item.icon && <item.icon width={11} height={11} />}
            {item.label}
          </>
        );
        let node: ReactNode;
        if (item.href) {
          node = (
            <a
              className={className}
              style={style}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              title={item.title}
            >
              {inner}
            </a>
          );
        } else if (item.onClick) {
          node = (
            <button
              type="button"
              className={className}
              style={style}
              onClick={item.onClick}
              title={item.title}
            >
              {inner}
            </button>
          );
        } else {
          node = (
            <span className={className} style={style} title={item.title}>
              {inner}
            </span>
          );
        }
        return (
          <Fragment key={item.key}>
            {i > 0 && <span className={ctx.classes.chainArrow}>→</span>}
            {node}
          </Fragment>
        );
      })}
    </div>
  );
}

// Build/publish (topic 'build'): line 1 names success/failure; line 2
// chains commit -> CI run -> published, each independently clickable.
// Parses the exact lines notify-backstage.yaml's build-stage call already
// sends (Repo:/Image:/Run:).
//
// 2026-09-15 bug: line 1 used to be a fixed "Build completed, image pushed
// to registry" regardless of outcome - a failed build's row got the right
// red severity color (rowColor already escalates on severity 'high'/
// 'critical') but still claimed to have succeeded, because notify-backstage.
// yaml's own title (`"${APP_NAME} · Build Failed"` for a real failure, via
// its generic `*)` stage-title fallback) was never actually read here.
// Same `title.toLowerCase().includes('failed')` check renderReleaseRow
// already uses for the same reason.
//
// 2026-09-14 feedback: the CI pill used to be a plain <a target="_blank">
// to the notification's own top-level `link` (that Task's RUN_URL, a fully
// qualified /tower?...&tab=ci-cd&run=... URL meant for sharing outside the
// app, e.g. in Slack) - clicking it opened a whole second browser tab and
// reloaded the app instead of just switching tabs in place. Now an in-app
// `goToRun` (a setSearchParams call, same shape as OverviewTab's own
// goToImage/goToRollout) built from the parsed run name, not that link.
export function renderBuildRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const repoMatch = extractLine(desc, 'Repo')?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const imageRef = extractLine(desc, 'Image');
  const runName = extractLine(desc, 'Run');
  const tag = imageRef ? imageTag(imageRef) : undefined;
  const failed = n.payload.title.toLowerCase().includes('failed');

  const items: PillItem[] = [];
  if (repoShort && sha) {
    items.push({
      key: 'commit',
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`,
    });
  }
  if (runName) {
    items.push({
      key: 'ci',
      icon: PipelineIcon,
      label: 'CI run',
      onClick: () => ctx.goToRun(runName),
      title: runName,
    });
  }
  if (tag) {
    items.push({
      key: 'published',
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: 'View in Images tab',
    });
    // The real flow-correlation nickname (e.g. "lively finch") - same
    // lookup/color the release matrix and log use, so this build and the
    // release it eventually becomes read as the same chip everywhere.
    const nickname = nicknameForImageTag(tag, ctx.pipelineRuns);
    if (nickname) {
      const hue = slugHue(nickname);
      items.push({
        key: 'nickname',
        label: nickname,
        fg: `hsl(${hue}, 65%, 60%)`,
        bg: `hsla(${hue}, 65%, 60%, 0.12)`,
        title: "This build's flow, shared by every stage of the same run",
      });
    }
  }

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        {failed ? 'Build failed' : 'Build completed, image pushed to registry'}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// Lower-env deploy (topic 'deploy', deploy.yaml's own finally notify-backstage
// call - direct-commit dev/test-tier promotions, distinct from 'deploying'
// below which is the upper-env ArgoCD PreSync mid-flow signal). Missing from
// CUSTOM_ROW_RENDERERS entirely until now (2026-09-16 bug: "a deployment
// event has lost its formatting and looks just like the notification in the
// notification tab") - every other stage topic had its own row body, this
// one silently fell through to RecentActivityPanel's generic title+description
// rendering. Same Repo/Image/Run parsing as renderBuildRow (deploy.yaml's
// notify-backstage call carries the identical fields, plus a real
// Environment: line build never has), env-led title matching the other
// release-lifecycle rows.
export function renderDeployRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Environment');
  const repoMatch = extractLine(desc, 'Repo')?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const imageRef = extractLine(desc, 'Image');
  const runName = extractLine(desc, 'Run');
  const tag = imageRef ? imageTag(imageRef) : undefined;
  const title = n.payload.title.toLowerCase();
  const outcome: 'failed' | 'cancelled' | 'succeeded' = title.includes('failed')
    ? 'failed'
    : title.includes('cancelled')
      ? 'cancelled'
      : 'succeeded';

  const items: PillItem[] = [];
  if (repoShort && sha) {
    items.push({
      key: 'commit',
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`,
    });
  }
  if (runName) {
    items.push({
      key: 'ci',
      icon: PipelineIcon,
      label: 'CI run',
      onClick: () => ctx.goToRun(runName),
      title: runName,
    });
  }
  if (tag) {
    items.push({
      key: 'image',
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: 'View in Images tab',
    });
    const nickname = nicknameForImageTag(tag, ctx.pipelineRuns);
    if (nickname) {
      const hue = slugHue(nickname);
      items.push({
        key: 'nickname',
        label: nickname,
        fg: `hsl(${hue}, 65%, 60%)`,
        bg: `hsla(${hue}, 65%, 60%, 0.12)`,
        title: "This build's flow, shared by every stage of the same run",
      });
    }
  }
  if (env) {
    items.push({
      key: 'env',
      icon: EnvIcon,
      label: env,
      onClick: () => ctx.goToEnv(env),
    });
  }

  const headline =
    outcome === 'failed'
      ? `Deploy failed${env ? ` in ${env}` : ''}`
      : outcome === 'cancelled'
        ? `Deploy cancelled${env ? ` in ${env}` : ''}`
        : `Deploy succeeded${env ? ` in ${env}` : ''}`;

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>{headline}</Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// Preview env create/delete (topic 'preview-env'): line 1 names the env and
// the action; line 2 chains the spawning PR -> its author, when
// recentActivity.ts's env poller managed to resolve them (best-effort - see
// that file's resolvePreviewEnvPr). A preview env whose PR lookup failed
// still renders, just with fewer pills.
export function renderPreviewEnvRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Environment');
  const prUrl = extractLine(desc, 'PR');
  const author = extractLine(desc, 'Opened by');
  const action = n.payload.title.includes('Deleted') ? 'deleted' : 'created';
  const prNumber = prUrl ? prNumberFromUrl(prUrl) : undefined;

  const items: PillItem[] = [];
  if (prUrl) {
    items.push({
      key: 'pr',
      icon: PreviewIcon,
      label: prNumber ? `PR #${prNumber}` : 'Pull request',
      href: prUrl,
    });
  }
  if (author) {
    items.push({
      key: 'author',
      label: `opened by ${author}`,
      href: `https://github.com/${author}`,
      variant: 'plain',
    });
  }

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        Preview env {env ?? '—'} {action}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// Real environment create/delete (topic 'env' - not a preview env). Line 1
// names the env and a plain-language action; line 2 chains a Ground/Flight
// tier tag -> the cluster name -> the env itself (clickable, jumps to the
// CI/CD tab the same way OverviewTab's own env cards do) - broadest to
// narrowest. Tier and cluster have no real place to link to today, so they
// render as static info tags rather than dead-looking buttons - only the
// env name pill is interactive. "Provisioned"/"decommissioned" (not
// "created"/"deleted") - infra vocabulary consistent with this being a
// real, not ephemeral, environment.
export function renderEnvRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Environment');
  const cluster = extractEnvLine(desc, 'Cluster');
  const action = n.payload.title.includes('Deleted')
    ? 'decommissioned'
    : 'provisioned';
  const tierLabel = env
    ? ENV_TIER_LABEL[envTierOf(env, ctx.pipelineOrder)]
    : undefined;

  // 2026-09-15 feedback: tier -> cluster -> env - broadest to narrowest
  // (which "kind" of env, which cluster it lives on, which env specifically),
  // rather than the earlier tier -> env -> cluster order.
  const items: PillItem[] = [];
  if (tierLabel) items.push({ key: 'tier', label: tierLabel });
  if (cluster) items.push({ key: 'cluster', label: cluster });
  if (env)
    items.push({
      key: 'env',
      icon: EnvIcon,
      label: env,
      onClick: () => ctx.goToEnv(env),
    });

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        Environment {env ?? '—'} {action}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// Config change (topic 'config', see configChangePoll.ts). Line 1 names the
// target env (parsed off the gitops repo's own <cluster>/<env>/values.yaml
// path convention - see that file's envFromFiles); line 2 chains who made
// the change -> a diff pill (GitHub's own Files-changed view for the PR,
// the closest thing to an in-app diff today) -> the PR itself.
export function renderConfigRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Env');
  const author = extractLine(desc, 'Author');
  const prUrl = extractLine(desc, 'PR');
  const prNumber = prUrl ? prNumberFromUrl(prUrl) : undefined;

  const items: PillItem[] = [];
  if (author)
    items.push({
      key: 'author',
      label: author,
      href: `https://github.com/${author}`,
    });
  if (prUrl)
    items.push({
      key: 'diff',
      icon: ConfigIcon,
      label: 'View diff',
      href: `${prUrl}/files`,
    });
  if (prUrl)
    items.push({
      key: 'pr',
      label: prNumber ? `PR #${prNumber}` : 'Pull request',
      href: prUrl,
    });

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        Config changed for env {env ?? '—'}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// A release's three lifecycle notifications (topics 'release'/'deploying'/
// 'release-outcome' - 2026-09-14 release-flow redesign, see glidepath's
// docs/admin/multi-cluster.md and notify-backstage.yaml's own header for the
// full mechanism). "Requested"/"Deploying"/"Succeeded" used to read as one
// misleading "Release Succeeded" at PR-open time and an unlabeled second
// event later - these three renderers, plus renderReleaseOutcomeRow's own
// consolidation below, are what actually closes that gap in the UI.
//
// Env, not app name, leads every title here - same reasoning as
// notify-backstage.yaml's own title switch: this panel is already scoped to
// one app (useAppNotifications(appName)), so which ENVIRONMENT matters more
// than repeating the app name on every row.

export function renderReleaseRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Environment');
  const repoMatch = extractLine(desc, 'Repo')?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  // Real data, not a stand-in like renderDeployingRow's own commit-only pill
  // (see that renderer's header) - notify-backstage.yaml's release-stage
  // message (and glidepathPromote.ts's sendReleaseNotification, which
  // mirrors it field-for-field) both already carry an Image: line.
  const imageRef = extractLine(desc, 'Image');
  const tag = imageRef ? imageTag(imageRef) : undefined;
  const prUrl = extractLine(desc, 'PR');
  const prNumber = prUrl ? prNumberFromUrl(prUrl) : undefined;
  const failed = n.payload.title.toLowerCase().includes('failed');

  const items: PillItem[] = [];
  if (repoShort && sha) {
    items.push({
      key: 'commit',
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`,
    });
  }
  if (tag) {
    items.push({
      key: 'image',
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: 'View in Images tab',
    });
  }
  if (prUrl) {
    items.push({
      key: 'pr',
      icon: PreviewIcon,
      label: prNumber ? `PR #${prNumber}` : 'Pull request',
      href: prUrl,
    });
  }
  // 2026-09-15 feedback: this used to be a `variant: 'plain'` item with
  // neither href nor onClick - PillChain still styled it like a link
  // (authorLink's color + hover-underline) even though it was really a
  // plain <span>, so it looked clickable and did nothing. Now a real pill,
  // linked to Topology (not goToEnv/CI-CD like Deploying/Resolved use) -
  // nothing has synced for this env yet at trigger time, so there's no
  // CD-tab state worth jumping to yet, but the env's current live topology
  // already exists regardless of this release's own progress.
  if (env) {
    items.push({
      key: 'env',
      icon: EnvIcon,
      label: env,
      onClick: () => ctx.goToTopology(env),
    });
  }

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        {failed
          ? `Release trigger failed for ${env ?? '—'}`
          : `Release triggered for ${env ?? '—'}`}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// Deploying (topic 'deploying', fired from an ArgoCD PreSync hook - the
// mid-flow signal between a release PR being opened and ArgoCD confirming an
// outcome). The real image tag this env is deploying isn't threaded through
// the PreSync CDEvent envelope itself (only git-revision is) - resolved
// instead via a real correlation, not a guess: deployHistory (already
// fetched for the Timeline/Lead-Time panels) pairs a sha with the imageTag
// it deployed, so a match on this event's own sha gives the real tag. Falls
// back to just commit -> env (no image pill) if deployHistory hasn't loaded
// yet or genuinely has no matching entry - never fabricated. Second/third
// pill mirrors renderEnvRow's own goToEnv navigation - "linked to env in the
// CD panel".
export function renderDeployingRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Environment');
  const repoMatch = extractLine(desc, 'Repo')?.match(/^(\S+) @ (\S+)$/);
  const repoShort = repoMatch?.[1];
  const sha = repoMatch?.[2];
  const rawImageTag = env && sha ? ctx.deployHistory?.[env]?.find(e => e.sha === sha)?.imageTag : undefined;
  const tag = rawImageTag ? imageTag(rawImageTag) : undefined;

  const items: PillItem[] = [];
  if (repoShort && sha) {
    items.push({
      key: 'commit',
      icon: CommitIcon,
      label: sha.slice(0, 7),
      href: `https://github.com/${repoShort}/commit/${sha}`,
      title: `${repoShort} @ ${sha}`,
    });
  }
  if (tag) {
    items.push({
      key: 'image',
      icon: ImageIcon,
      label: tag,
      onClick: () => ctx.goToImage(tag),
      title: 'View in Images tab',
    });
  }
  if (env) {
    items.push({
      key: 'env',
      icon: EnvIcon,
      label: `${env} · ArgoCD sync started`,
      onClick: () => ctx.goToEnv(env),
    });
  }

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        Deploying release to {env ?? '—'}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
    </>
  );
}

// Resolved (topic 'release-outcome', ArgoCD PostSync/SyncFail - the
// authoritative confirmed outcome). Consolidated per 2026-09-14 feedback:
// "don't touch/remove the older requested and deployed events from the
// timeline... when the resolved event comes in, pull in the past events to
// display the consolidated event." The Triggered/Deploying rows stay exactly
// where they already are, unmodified, elsewhere in the same list - this row
// only ever ADDS a nested summary of them beneath its own pill chain,
// matched by the Chain: line every release/deploying/release-outcome
// notification carries (see notify-backstage.yaml/glidepathPromote.ts).
// Deliberately rendered as a plain nested list (subSteps/subStep* classes),
// not a bordered/filled card - stays one more row in the same continuous
// timeline instead of a component that visually breaks out of it.
export function renderReleaseOutcomeRow(
  n: Notification,
  ctx: ActivityRowContext,
): ReactNode {
  const desc = n.payload.description;
  const env = extractEnvLine(desc, 'Environment');
  const chainId = extractLine(desc, 'Chain');
  const succeeded = n.payload.title.toLowerCase().includes('succeeded');

  const items: PillItem[] = [];
  if (env) {
    items.push({
      key: 'env',
      icon: EnvIcon,
      label: `${env} · ${succeeded ? 'Healthy' : 'Degraded'}`,
      onClick: () => ctx.goToEnv(env),
    });
  }

  const siblings = chainId
    ? ctx.allNotifications
        .filter(
          sib =>
            sib.id !== n.id &&
            (sib.payload.topic === 'release' ||
              sib.payload.topic === 'deploying') &&
            extractLine(sib.payload.description, 'Chain') === chainId,
        )
        .sort(
          (a, b) =>
            new Date(a.created).getTime() - new Date(b.created).getTime(),
        )
    : [];

  return (
    <>
      <Typography className={ctx.classes.rowTitle}>
        {succeeded
          ? `Release succeeded in ${env ?? '—'}`
          : `Release failed in ${env ?? '—'}`}
      </Typography>
      <PillChain items={items} n={n} ctx={ctx} />
      {siblings.length > 0 && (
        <div className={ctx.classes.subSteps}>
          {siblings.map((sib, i) => (
            <div key={sib.id} className={ctx.classes.subStep}>
              <span className={ctx.classes.subStepDot} />
              {i < siblings.length - 1 && (
                <span className={ctx.classes.subStepLine} />
              )}
              <span className={ctx.classes.subStepLabel}>
                {sib.payload.title}
              </span>
              <span
                className={ctx.classes.subStepTime}
                title={formatDateTime(String(sib.created))}
              >
                {relativeTime(sib.created)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export const CUSTOM_ROW_RENDERERS: Partial<
  Record<string, (n: Notification, ctx: ActivityRowContext) => ReactNode>
> = {
  build: renderBuildRow,
  deploy: renderDeployRow,
  'preview-env': renderPreviewEnvRow,
  env: renderEnvRow,
  config: renderConfigRow,
  release: renderReleaseRow,
  deploying: renderDeployingRow,
  'release-outcome': renderReleaseOutcomeRow,
};
