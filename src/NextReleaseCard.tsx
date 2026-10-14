import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { relativeTime } from './shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { NicknameChip } from './tabs/deployments/ImageTagPill';
import type { NextRelease, NextReleaseCandidate, ReadinessState } from './nextRelease';
import { Button, Card, EmptyNote, Hint, SectionTitle, StatusChip, TextLink, Tile } from './ui';

// The Record list's "Next release" card (Release Record proposal R1, 2026-10-13): the
// release in progress, before it reaches Flight - what's merged, what's still open, the
// images built from it, and how ready the leading one looks. Computed, nothing saved.
// Same dashed amber band as the record's Human context: this is the part people shape.

const SCOPE_SHOWN = 6;
const INCOMING_SHOWN = 3;
const PLANNED_SHOWN = 4;

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  // The kit Card, in the dashed amber of the record's Human context band.
  draft: {
    borderStyle: 'dashed',
    borderColor: ({ t }) => t.amberLine,
    backgroundColor: ({ t }) => t.amberSoft,
    marginBottom: 14,
  },
  meta: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 19, letterSpacing: '0.06em', color: ({ t }) => t.textHi },
  version: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.amberInk },
  after: { fontSize: 12, color: ({ t }) => t.textLo },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.25fr 1fr 1fr',
    gap: 12,
    '@media (max-width: 980px)': { gridTemplateColumns: '1fr' },
  },
  column: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  item: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, padding: '2px 0', minWidth: 0 },
  prTitle: { color: ({ t }) => t.textHi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  faint: { color: ({ t }) => t.textFaint, fontSize: 12 },
  planned: { borderBottom: ({ t }) => `1px solid ${t.lineSoft}`, paddingBottom: 8, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 4 },
  sub: { borderTop: ({ t }) => `1px solid ${t.lineSoft}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 },
  issues: { display: 'flex', flexWrap: 'wrap', gap: 8, fontFamily: fontMono, fontSize: 11, marginTop: 4 },
  tag: { fontFamily: fontMono, fontSize: 11.5, color: ({ t }) => t.textHi },
  cand: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 },
  leadMark: { fontFamily: fontMono, fontSize: 10, color: ({ t }) => t.amberInk, letterSpacing: '0.06em' },
  meter: { height: 6, borderRadius: 3, backgroundColor: ({ t }) => t.panelAlt, overflow: 'hidden', margin: '2px 0 6px' },
  meterFill: { display: 'block', height: '100%', backgroundColor: ({ t }) => t.amber },
  check: { fontFamily: fontMono, width: 14, flex: '0 0 14px', textAlign: 'center' },
  checkLabel: { color: ({ t }) => t.textHi, flex: 'none' },
}));

const CHECK: Record<ReadinessState, string> = { ok: '✓', todo: '!', unknown: '?' };

function checkColor(t: HangarTokens, state: ReadinessState): string {
  if (state === 'ok') return t.good;
  if (state === 'todo') return t.amberInk;
  return t.textFaint;
}

function soakText(c: NextReleaseCandidate): string {
  if (c.liveOn.length > 0) return `${c.liveOn.join(', ')} · ${relativeTime(c.firstGroundAt).replace(/ ago$/, '')}`;
  return c.firstGroundAt ? 'no longer on Ground' : 'not deployed';
}

export function NextReleaseCard({
  next,
  name,
  previousName,
  promoteTo,
  onPromote,
  modeLabel,
  children,
}: {
  next: NextRelease;
  /** The app's release mode, shown beside the draft chip (R2). */
  modeLabel?: string;
  /** The draft editor (R2), under the three columns. */
  children?: ReactNode;
  /** The draft's release name; undefined until the app's release history has loaded. */
  name?: string;
  previousName?: string;
  /** The first Flight environment, when the leading candidate can be promoted from here. */
  promoteTo?: string;
  onPromote?: (candidate: NextReleaseCandidate) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { scope, incoming, issues, candidates, leading, readiness, previous } = next;
  const ok = readiness.filter(i => i.state === 'ok').length;
  const previousLabel = previous ? `${previousName ?? ''}${previousName ? ' · ' : ''}${previous.version ?? previous.imageTag}` : undefined;
  const scopeIssues = issues.filter(i => i.merged);
  const incomingIssues = issues.filter(i => !i.merged);

  const promote =
    leading && (leading.liveOn.length > 0 || leading.image) && promoteTo && onPromote ? (
      <Button variant="primary" small onClick={() => onPromote(leading)}>
        {`Promote ${leading.nickname ?? leading.imageTag} to ${promoteTo}`}
      </Button>
    ) : undefined;

  return (
    <Card
      className={classes.draft}
      aria-label="Next release"
      title={name ? <span className={classes.name}>{name}</span> : 'Next release'}
      meta={
        <span className={classes.meta}>
          <StatusChip tone="warn" dot>
            {name ? 'next release · draft' : 'draft'}
          </StatusChip>
          {next.suggestedVersion && (
            <span className={classes.version} title={`From the merged PRs${next.breaking ? ', including a breaking change' : ''}`}>
              v{next.suggestedVersion} suggested
            </span>
          )}
          {previousLabel && <span className={classes.after}>after {previousLabel}</span>}
          {modeLabel && <span className={classes.after}>· {modeLabel}</span>}
        </span>
      }
      actions={promote}
    >
      <div className={classes.grid}>
        <Tile className={classes.column}>
          {next.planned?.milestone && (
            <div className={classes.planned}>
              <SectionTitle level={2}>
                {`Planned · ${next.planned.milestone.title} · ${next.planned.issues.filter(i => i.state === 'closed').length} of ${next.planned.issues.length} closed`}
              </SectionTitle>
              {next.planned.issues
                .filter(i => i.state === 'open')
                .slice(0, PLANNED_SHOWN)
                .map(i => (
                  <div key={i.number} className={classes.item}>
                    <TextLink href={i.url}>#{i.number}</TextLink>
                    <span className={classes.prTitle} title={i.title}>
                      {i.title}
                    </span>
                    {i.assignee && <span className={classes.faint}>{i.assignee}</span>}
                  </div>
                ))}
              {next.planned.issues.filter(i => i.state === 'open').length > PLANNED_SHOWN && (
                <span className={classes.faint}>
                  + {next.planned.issues.filter(i => i.state === 'open').length - PLANNED_SHOWN} more open
                </span>
              )}
            </div>
          )}
          <SectionTitle level={2}>
            {`Scope · ${scope.length} PR${scope.length === 1 ? '' : 's'}`}
            {next.changeCategories.features + next.changeCategories.fixes > 0 &&
              ` · ${next.changeCategories.features} feat / ${next.changeCategories.fixes} fix`}
          </SectionTitle>
          {scope.length === 0 && <EmptyNote>Nothing merged to main since the last release.</EmptyNote>}
          {[...scope]
            .reverse()
            .slice(0, SCOPE_SHOWN)
            .map(pr => (
              <div key={pr.number} className={classes.item}>
                <TextLink href={pr.url}>#{pr.number}</TextLink>
                <span className={classes.prTitle} title={pr.title}>
                  {pr.title}
                </span>
              </div>
            ))}
          {scope.length > SCOPE_SHOWN && <span className={classes.faint}>+ {scope.length - SCOPE_SHOWN} older</span>}
          {next.scopeMayBeIncomplete && (
            <Hint>Tower only sees the 20 newest merged PRs; older ones in this release aren't listed.</Hint>
          )}
          {scopeIssues.length > 0 && (
            <div className={classes.issues}>
              <span className={classes.faint}>Closes</span>
              {scopeIssues.map(i => (
                <TextLink key={i.url} href={i.url}>{i.label}</TextLink>
              ))}
            </div>
          )}
          <div className={classes.sub}>
            <SectionTitle level={2}>{`Incoming · ${incoming.length} open`}</SectionTitle>
            {incoming.length === 0 && <EmptyNote>No open PRs.</EmptyNote>}
            {incoming.slice(0, INCOMING_SHOWN).map(pr => (
              <div key={pr.number} className={classes.item}>
                <TextLink href={pr.url}>#{pr.number}</TextLink>
                <span className={classes.prTitle} title={pr.title}>
                  {pr.title}
                </span>
                {pr.draft && <span className={classes.faint}>draft</span>}
              </div>
            ))}
            {incoming.length > INCOMING_SHOWN && <span className={classes.faint}>+ {incoming.length - INCOMING_SHOWN} more</span>}
            {incomingIssues.length > 0 && (
              <div className={classes.issues}>
                <span className={classes.faint}>Would close</span>
                {incomingIssues.map(i => (
                  <TextLink key={i.url} href={i.url}>{i.label}</TextLink>
                ))}
              </div>
            )}
          </div>
        </Tile>

        <Tile className={classes.column}>
          <SectionTitle level={2}>{`Candidates · ${candidates.length}`}</SectionTitle>
          {candidates.length === 0 && <EmptyNote>No image built from main since the last release.</EmptyNote>}
          {candidates.map(c => (
            <div key={c.imageTag} className={classes.cand}>
              {c.nickname && <NicknameChip nickname={c.nickname} />}
              <span className={classes.tag}>{c.imageTag}</span>
              <span className={classes.faint}>{soakText(c)}</span>
              <span className={classes.faint}>
                {c.prCount} PR{c.prCount === 1 ? '' : 's'}
              </span>
              {c === leading && <span className={classes.leadMark}>LEADING</span>}
            </div>
          ))}
        </Tile>

        <Tile className={classes.column}>
          <SectionTitle level={2}>{`Readiness · ${ok} of ${readiness.length}`}</SectionTitle>
          <div className={classes.meter} role="img" aria-label={`${ok} of ${readiness.length} readiness checks pass`}>
            <span className={classes.meterFill} style={{ width: `${readiness.length ? (ok / readiness.length) * 100 : 0}%` }} />
          </div>
          {readiness.map(item => (
            <div key={item.id} className={classes.item} title={item.detail}>
              <span className={classes.check} style={{ color: checkColor(t, item.state) }}>
                {CHECK[item.state]}
              </span>
              <span className={classes.checkLabel}>{item.label}</span>
              <span className={classes.faint}>{item.detail}</span>
            </div>
          ))}
        </Tile>
      </div>
      {children}
      <Hint>
        Scope, candidates and readiness are computed from merged PRs and images. Only the notes and owner below are
        saved; the record is written when this release reaches Flight.
      </Hint>
    </Card>
  );
}
