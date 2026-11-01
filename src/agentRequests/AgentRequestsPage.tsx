import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { formatDateTime, relativeTime } from '../shared/format';
import { Button, Callout, Card, EmptyNote, PageHeader, TextLink } from '../ui';
import { AnswerError, shortRef, useAgentRequests, type AgentRequest } from './useAgentRequests';
import { useAgentRequestStatuses } from './useAgentRequestStatuses';

// The Agent requests page (?view=agent-requests): each question an agent asked that you may answer, from your own
// session or for one of your teams. Options become one button each; a question without options takes a written
// answer. One answer per question: whoever answers first wins, and Clearance records who it was. A notification links
// to its own question (&id=<id>): that one is scrolled to and outlined, or, when it is no longer open, the page says
// what became of it.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: { padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 },
  body: { display: 'flex', flexDirection: 'column', gap: 10 },
  meta: { fontFamily: fontMono, fontSize: 11, color: ({ t }) => t.textFaint, display: 'flex', gap: 14, flexWrap: 'wrap' },
  question: { margin: 0, fontSize: 15, lineHeight: 1.45, color: ({ t }) => t.textHi, whiteSpace: 'pre-wrap' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' },
  text: {
    flex: '1 1 320px',
    minHeight: 64,
    fontFamily: 'inherit',
    fontSize: 13,
    padding: 8,
    borderRadius: 4,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
  },
  done: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.good },
  linked: { outline: ({ t }) => `2px solid ${t.amber}`, outlineOffset: 2 },
}));

type Outcome = { ok: true; answer: string } | { ok: false; message: string; hint?: string };

function RequestCard({ r, linked, onAnswer }: { r: AgentRequest; linked?: boolean; onAnswer: (id: string, answer: string) => Promise<AgentRequest> }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (linked) ref.current?.scrollIntoView?.({ block: 'center' });
  }, [linked]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();

  const send = async (answer: string) => {
    setBusy(true);
    try {
      const done = await onAnswer(r.id, answer);
      setOutcome({ ok: true, answer: done.answer ?? answer });
    } catch (e) {
      const err = e as AnswerError;
      setOutcome({ ok: false, message: err.message, hint: err.hint });
    } finally {
      setBusy(false);
    }
  };

  const from = r.group ? `${shortRef(r.owner)} · team ${shortRef(r.group)}` : shortRef(r.owner);
  return (
    <Card
      ref={ref}
      className={linked ? c.linked : undefined}
      title={r.agent}
      aria-label={`Question from ${r.agent}`}
      aria-current={linked ? 'true' : undefined}
      meta={
        <span className={c.meta}>
          <span title={r.owner}>{from}</span>
          <span title={formatDateTime(r.created_at)}>asked {relativeTime(r.created_at)}</span>
          <span title={formatDateTime(r.expires_at)}>expires {relativeTime(r.expires_at)}</span>
          <span title={`session ${r.session}`}>{r.task_id}</span>
        </span>
      }
    >
      <div className={c.body}>
      <p className={c.question}>{r.question}</p>
      {outcome?.ok ? (
        <span className={c.done}>Answered: {outcome.answer}</span>
      ) : (
        <div className={c.actions}>
          {r.options.length > 0 ? (
            r.options.map(o => (
              <Button key={o} small disabled={busy} onClick={() => send(o)}>
                {o}
              </Button>
            ))
          ) : (
            <>
              <textarea
                className={c.text}
                aria-label="Your answer"
                value={text}
                maxLength={4000}
                onChange={e => setText(e.target.value)}
              />
              <Button small disabled={busy || !text.trim()} onClick={() => send(text.trim())}>
                Send answer
              </Button>
            </>
          )}
        </div>
      )}
      {outcome && !outcome.ok && (
        <Callout tone="bad" title="Not answered">
          {outcome.message}
          {outcome.hint ? ` ${outcome.hint}` : ''}
        </Callout>
      )}
      </div>
    </Card>
  );
}

export function AgentRequestsPage({ onBack }: { onBack: () => void }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const requests = useAgentRequests();
  const items = requests.data ?? [];
  const [searchParams] = useSearchParams();
  const linkedId = searchParams.get('id') ?? undefined;
  const gone = !!linkedId && !!requests.data && !items.some(r => r.id === linkedId);
  const status = useAgentRequestStatuses(gone && linkedId ? [linkedId] : []).data?.[linkedId ?? ''];
  let goneTitle = 'That question is no longer open';
  if (status?.status === 'answered') {
    goneTitle = `That question was answered${status.answered_by ? ` by ${shortRef(status.answered_by)}` : ''}${status.answered_at ? ` ${relativeTime(status.answered_at)}` : ''}`;
  } else if (status?.status === 'expired') {
    goneTitle = `That question expired ${relativeTime(status.expires_at)}`;
  }
  return (
    <div className={c.root}>
      <TextLink onClick={onBack}>← All services</TextLink>
      <PageHeader
        title="Agent requests"
        subtitle="Questions Hangar agents asked that you may answer: from your own sessions, or for one of your teams. Agents don't wait for you; each reads your answer when it's ready."
      />
      {requests.error && !requests.data && (
        <Callout tone={requests.error.includes('not configured') ? 'warn' : 'bad'} title="Agent requests are unavailable">
          {requests.error}
        </Callout>
      )}
      {requests.loading && !requests.data && !requests.error && <EmptyNote>Loading…</EmptyNote>}
      {gone && <Callout tone="neutral" title={goneTitle}>The agent has moved on; nothing is waiting on an answer to it.</Callout>}
      {requests.data && items.length === 0 && <EmptyNote>No agent is waiting on you.</EmptyNote>}
      {items.map(r => (
        <RequestCard key={r.id} r={r} linked={r.id === linkedId} onAnswer={requests.answer} />
      ))}
    </div>
  );
}
