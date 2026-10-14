import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { relativeTime } from './shared/format';
import { fontMono, useHangarTokens, type HangarTokens } from './brand/tokens';
import { NOTE_CATEGORIES, NOTE_LABEL, type NoteCategory, type ReleaseDraft } from './releaseFlow';
import { Button, Field, Hint, TextLink } from './ui';

// The part of the next release people write (Release Record R2): notes in Keep a Changelog
// sections, known issues, an owner and the risk. Saved as a direct commit to the app repo's
// glidepath/releases/next.yaml, and copied into the record when the release reaches Flight.

const MAIN: NoteCategory[] = ['added', 'changed', 'fixed', 'security'];

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  summary: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, fontSize: 12.5, color: ({ t }) => t.textLo },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
    '@media (max-width: 860px)': { gridTemplateColumns: '1fr' },
  },
  textarea: { fontFamily: fontMono, fontSize: 12, minHeight: 64, resize: 'vertical', width: '100%' },
  line: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  saved: { fontSize: 12, color: ({ t }) => t.textLo },
  error: { fontSize: 12, color: ({ t }) => t.bad },
}));

const toText = (l?: string[]) => (l ?? []).join('\n');
const toLines = (s: string) =>
  s
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

interface Form {
  owner: string;
  notes: Record<NoteCategory, string>;
  knownIssues: string;
  riskLevel: '' | 'low' | 'medium' | 'high';
  riskNotes: string;
  rollback: string;
}

function formOf(d: ReleaseDraft | undefined): Form {
  return {
    owner: d?.owner ?? '',
    notes: Object.fromEntries(NOTE_CATEGORIES.map(c => [c, toText(d?.notes?.[c])])) as Record<NoteCategory, string>,
    knownIssues: toText(d?.knownIssues),
    riskLevel: d?.risk?.level ?? '',
    riskNotes: d?.risk?.notes ?? '',
    rollback: d?.risk?.rollback ?? '',
  };
}

export function draftOf(f: Form): ReleaseDraft {
  const notes: Partial<Record<NoteCategory, string[]>> = {};
  NOTE_CATEGORIES.forEach(c => {
    const l = toLines(f.notes[c]);
    if (l.length > 0) notes[c] = l;
  });
  return {
    owner: f.owner.trim() || undefined,
    notes,
    knownIssues: toLines(f.knownIssues),
    risk: { level: f.riskLevel || undefined, notes: f.riskNotes.trim() || undefined, rollback: f.rollback.trim() || undefined },
  };
}

export function ReleaseDraftEditor({
  saved,
  suggested,
  canEdit,
  saving,
  error,
  commitUrl,
  onSave,
}: {
  saved?: ReleaseDraft;
  /** Notes pre-filled from the scope PRs, offered for empty sections. */
  suggested: Partial<Record<NoteCategory, string[]>>;
  canEdit: boolean;
  saving: boolean;
  error?: string;
  commitUrl?: string;
  onSave: (draft: ReleaseDraft) => void;
}) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<Form>(() => formOf(saved));
  useEffect(() => setForm(formOf(saved)), [saved]);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(formOf(saved)), [form, saved]);
  const noteCount = NOTE_CATEGORIES.reduce((n, c) => n + (saved?.notes?.[c]?.length ?? 0), 0);
  const canSuggest = NOTE_CATEGORIES.some(c => !form.notes[c].trim() && (suggested[c]?.length ?? 0) > 0);
  const shown = showAll ? [...NOTE_CATEGORIES] : NOTE_CATEGORIES.filter(c => MAIN.includes(c) || form.notes[c].trim());

  return (
    <div className={classes.wrap}>
      <div className={classes.summary}>
        <TextLink expanded={open} onClick={() => setOpen(v => !v)}>
          Notes and owner
        </TextLink>
        <span>
          {noteCount > 0 ? `${noteCount} note${noteCount === 1 ? '' : 's'}` : 'No notes yet'} · owner{' '}
          {saved?.owner ?? 'not named'}
          {saved?.updatedAt && ` · saved ${relativeTime(saved.updatedAt)}${saved.updatedBy ? ` by ${saved.updatedBy.replace(/^user:default\//, '')}` : ''}`}
        </span>
      </div>
      {open && (
        <>
          <div className={classes.grid}>
            {shown.map(c => (
              <Field key={c} id={`rd-notes-${c}`} label={`${NOTE_LABEL[c]} (one per line)`}>
                {props => (
                  <textarea
                    {...props}
                    className={`${props.className} ${classes.textarea}`}
                    value={form.notes[c]}
                    disabled={!canEdit}
                    onChange={e => setForm(f => ({ ...f, notes: { ...f.notes, [c]: e.target.value } }))}
                  />
                )}
              </Field>
            ))}
          </div>
          <div className={classes.line}>
            {canEdit && canSuggest && (
              <TextLink
                onClick={() =>
                  setForm(f => ({
                    ...f,
                    notes: Object.fromEntries(
                      NOTE_CATEGORIES.map(c => [c, f.notes[c].trim() ? f.notes[c] : toText(suggested[c])]),
                    ) as Record<NoteCategory, string>,
                  }))
                }
              >
                Fill empty sections from the merged PRs
              </TextLink>
            )}
            {!showAll && (
              <TextLink onClick={() => setShowAll(true)}>Deprecated and Removed sections</TextLink>
            )}
          </div>
          <div className={classes.grid}>
            <Field id="rd-known-issues" label="Known issues (one per line)">
              {props => (
                <textarea
                  {...props}
                  className={`${props.className} ${classes.textarea}`}
                  value={form.knownIssues}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, knownIssues: e.target.value }))}
                />
              )}
            </Field>
            <Field id="rd-rollback" label="Rollback notes (data, migrations, flags)">
              {props => (
                <textarea
                  {...props}
                  className={`${props.className} ${classes.textarea}`}
                  value={form.rollback}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, rollback: e.target.value }))}
                />
              )}
            </Field>
            <Field id="rd-owner" label="Release owner">
              {props => (
                <input
                  {...props}
                  value={form.owner}
                  disabled={!canEdit}
                  placeholder="Who makes the go / no-go call"
                  onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                />
              )}
            </Field>
            <Field id="rd-risk" label="Risk">
              {props => (
                <select
                  {...props}
                  value={form.riskLevel}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, riskLevel: e.target.value as Form['riskLevel'] }))}
                >
                  <option value="">Not assessed</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              )}
            </Field>
            <Field id="rd-risk-notes" label="Risk notes">
              {props => (
                <textarea
                  {...props}
                  className={`${props.className} ${classes.textarea}`}
                  value={form.riskNotes}
                  disabled={!canEdit}
                  onChange={e => setForm(f => ({ ...f, riskNotes: e.target.value }))}
                />
              )}
            </Field>
          </div>
          <div className={classes.line}>
            {canEdit ? (
              <Button small disabled={!dirty || saving} onClick={() => onSave(draftOf(form))}>
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
            ) : (
              <Hint>Only the app's owners and admins can edit the draft.</Hint>
            )}
            {commitUrl && !dirty && (
              <span className={classes.saved}>
                Saved to glidepath/releases/next.yaml · <TextLink href={commitUrl}>commit ↗</TextLink>
              </span>
            )}
            {error && <span className={classes.error}>{error}</span>}
          </div>
          <Hint>
            Saved as a commit to glidepath/releases/next.yaml in the app's repo (it builds nothing). When this release
            reaches Flight, Tower copies the draft into its record and clears it for the next one.
          </Hint>
        </>
      )}
    </div>
  );
}
