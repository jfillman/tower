import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { formatDateTime } from './shared/format';
import { fontDisplay, fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { NOTE_CATEGORIES, NOTE_LABEL } from './releaseFlow';
import { outcomeChip } from './ReleaseOutcome';
import type { ReleaseNames } from './useReleaseNames';
import { Card, EmptyNote, SectionTitle, StatusChip, TextLink } from './ui';

// The app's changelog (Release Record R3): every committed release's notes, newest first, as the
// team wrote them in the draft before it shipped. Read from the /release-records listing.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  list: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 },
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 },
  name: { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, letterSpacing: '0.06em', color: ({ t }) => t.textHi },
  version: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  date: { fontSize: 12, color: ({ t }) => t.textFaint, marginLeft: 'auto' },
  section: { fontSize: 13, color: ({ t }) => t.textHi },
  bullets: { margin: '2px 0 0', paddingLeft: 18 },
}));

export function ReleaseChangelog({ names, onBack }: { names?: ReleaseNames; onBack: () => void }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const entries = [...(names?.index ?? [])].reverse();

  return (
    <div>
      <TextLink onClick={onBack}>← Back to records</TextLink>
      <div style={{ marginTop: 14 }}>
        <SectionTitle>Changelog</SectionTitle>
      </div>
      {!names && <EmptyNote>Loading the release history…</EmptyNote>}
      {names && entries.length === 0 && <EmptyNote>No release has a record yet.</EmptyNote>}
      <div className={classes.list}>
        {entries.map(e => {
          const notes = NOTE_CATEGORIES.filter(c => (e.notes?.[c]?.length ?? 0) > 0);
          const chip = outcomeChip(e.outcome);
          return (
            <Card key={e.imageTag}>
              <div className={classes.head}>
                <span className={classes.name}>{names!.byTag.get(e.imageTag) ?? ''}</span>
                <span className={classes.version}>{e.imageTag}</span>
                {chip && (
                  <StatusChip tone={chip.tone} dot>
                    {chip.label}
                  </StatusChip>
                )}
                {e.githubRelease?.url && <TextLink href={e.githubRelease.url}>{`${e.githubRelease.tag ?? 'GitHub Release'} ↗`}</TextLink>}
                <span className={classes.date}>
                  {formatDateTime(e.generatedAt)}
                  {e.owner ? ` · ${e.owner}` : ''}
                </span>
              </div>
              {notes.length === 0 && !e.knownIssues?.length && <EmptyNote>No notes were written for this release.</EmptyNote>}
              {notes.map(c => (
                <div key={c} className={classes.section}>
                  <b>{NOTE_LABEL[c]}</b>
                  <ul className={classes.bullets}>
                    {e.notes![c]!.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {(e.knownIssues?.length ?? 0) > 0 && (
                <div className={classes.section}>
                  <b>Known issues</b>
                  <ul className={classes.bullets}>
                    {e.knownIssues!.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
