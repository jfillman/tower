import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, fontScale, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Count, EmptyNote, Fact, FactGrid, Hint, Section, StatusChip, TextLink, useTableKit } from '../ui';
import type { PrCheckRun } from '../pullRequests/usePullRequests';
import { apiCompatOf, VERDICT_LABEL, VERDICT_TONE, type ApiCompatReport, type ApiCompatState } from './apiCompat';
import { formatRate } from './model';

// The Release Record's "API compatibility": the api-compat release check's own report (oasdiff, the authoritative
// diff) read out of its gate comment. Absent when the release PR ran no api-compat check.

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  method: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.sky },
  path: { fontFamily: fontMono, fontSize: fontScale.sm, color: ({ t }) => t.textHi },
  mono: { fontFamily: fontMono, fontSize: fontScale.sm },
  scrollBox: { overflowX: 'auto' },
}));

const short = (s?: string) => (s ? s.replace(/^sha256:/, '').slice(0, 12) : '—');

export function ApiCompatSection({ checks, appName }: { checks: PrCheckRun[] | undefined; appName?: string }) {
  const state = apiCompatOf(checks);
  // Most release PRs (every one before the gate existed) have no api-compat check: render nothing, and touch no hooks.
  return state ? <ApiCompatReportSection state={state} appName={appName} /> : null;
}

function ApiCompatReportSection({ state, appName }: { state: ApiCompatState; appName?: string }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const [, setSearchParams] = useSearchParams();
  const { check, report } = state;
  const openDiff = (r: ApiCompatReport | undefined) =>
    appName && setSearchParams({ view: 'airspace', sub: 'contracts', app: appName, ...(r?.env ? { compare: r.env } : {}) });

  if (!report) {
    return (
      <Section title="API compatibility" level={2}>
        <EmptyNote>
          The api-compat check {check.status === 'completed' ? `finished (${check.conclusion ?? 'no conclusion'})` : 'is running'} but its
          comment carries no report Tower can read.
        </EmptyNote>
      </Section>
    );
  }
  return (
    <Section
      title="API compatibility"
      level={2}
      meta={
        <StatusChip tone={VERDICT_TONE[report.verdict]} title={`api-compat check: ${check.conclusion ?? check.status}`}>
          {VERDICT_LABEL[report.verdict]}
        </StatusChip>
      }
      actions={appName ? <TextLink onClick={() => openDiff(report)}>Spec diff in Contracts →</TextLink> : undefined}
    >
      <FactGrid>
        <Fact label="Against">{report.env ? `what ${report.env} runs` : '—'}</Fact>
        <Fact label="Running spec">
          <span className={c.mono}>
            {report.baseline ? `${report.baseline.version ?? '?'} · ${short(report.baseline.specSha256)}` : 'none'}
          </span>
        </Fact>
        <Fact label="This release's spec">
          <span className={c.mono}>
            {report.candidate ? `${report.candidate.version ?? '?'} · ${short(report.candidate.specSha256)}` : 'none'}
          </span>
        </Fact>
        <Fact label="Changes">
          <Count>
            {report.breaking.length} breaking · {report.nonBreakingCount} other
          </Count>
        </Fact>
        <Fact label="Usage">
          {report.usage.source === 'prometheus'
            ? `traces, last ${report.usage.window ?? '?'}${report.usage.callers.length ? ` · callers ${report.usage.callers.join(', ')}` : ''}`
            : 'unknown'}
        </Fact>
      </FactGrid>
      {report.override && (
        <Hint>
          Breaking change accepted by {report.override.by}
          {report.override.at ? ` on ${new Date(report.override.at).toLocaleString()}` : ''}
          {report.override.reason ? `: ${report.override.reason}` : ''}.
        </Hint>
      )}
      {report.verdict === 'no-spec' && <Hint>This release's image carries no signed spec, so nothing was compared.</Hint>}
      {report.verdict === 'no-baseline' && <Hint>{report.env || 'The target'} runs no signed spec yet: this is the first one.</Hint>}
      {report.breaking.length > 0 && (
        <div className={c.scrollBox}>
          <table className={tk.table}>
            <thead>
              <tr>
                <th className={tk.th}>Operation</th>
                <th className={tk.th}>Change</th>
                <th className={tk.th}>In use</th>
              </tr>
            </thead>
            <tbody>
              {report.breaking.map(b => (
                <tr key={b.id + b.text}>
                  <td className={tk.td}>
                    {b.operation ? (
                      <>
                        <span className={c.method}>{b.operation.method}</span> <span className={c.path}>{b.operation.path}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={tk.td}>{b.text}</td>
                  <td className={tk.td}>
                    <InUse inUse={b.inUse} rate={b.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Hint>"In use" is per operation, from traces; they don't say which fields a caller reads.</Hint>
    </Section>
  );
}

function InUse({ inUse, rate }: { inUse: boolean | null; rate: number | null }) {
  if (inUse === null) return <StatusChip tone="neutral">unknown</StatusChip>;
  if (!inUse) return <StatusChip tone="neutral">not seen</StatusChip>;
  return <StatusChip tone="warn">{rate !== null ? formatRate(rate) : 'yes'}</StatusChip>;
}
