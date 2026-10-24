import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, fontScale, useHangarTokens, type HangarTokens } from '../brand/tokens';
import {
  Callout,
  Card,
  Count,
  EmptyNote,
  Fact,
  FactGrid,
  FilterBar,
  FilterChips,
  FilterSelect,
  Hint,
  Section,
  StatusChip,
  type StatusTone,
  useTableKit,
} from '../ui';
import { explain, type Verdict } from '../supplyChain';
import { diffSpecs, operationForSpan, specOperations, type OperationDiff } from './apiSpec';
import { formatRate, serviceNameOf } from './model';
import { useObservedOperations } from './useAirspace';
import type { EnvSpec } from './useDeployedSpecs';
import type { AirspaceWindow } from './queries';

// Phase 2: the spec each environment of an app runs, read from the image's signed api-spec attestation, and the diff
// between two environments. The diff is Tower's own reading (apiSpec.ts diffSpecs); the release check's oasdiff report
// on a release PR is the authoritative one (Release Record, "API compatibility").

const VERDICT_TONE: Record<Verdict, StatusTone> = { verified: 'ok', unverified: 'warn', contradicted: 'bad', missing: 'neutral' };

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  method: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.sky },
  path: { fontFamily: fontMono, fontSize: fontScale.md, color: ({ t }) => t.textHi },
  deprecatedPath: { textDecoration: 'line-through', color: ({ t }) => t.textFaint },
  mono: { fontFamily: fontMono, fontSize: fontScale.sm },
  changeList: { margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 },
  scrollBox: { overflowX: 'auto' },
  filterPad: { padding: '10px 14px 0' },
  factsPad: { padding: '0 14px' },
}));

const short = (s: string | undefined, n = 12) => (s ? s.replace(/^sha256:/, '').slice(0, n) : '—');
const tagOf = (image: string | undefined) => (image ? image.split('/').pop() ?? image : '—');
const envId = (e: EnvSpec) => `${e.cluster}/${e.env}`;

export function DeployedSpecsPanel({
  app,
  envs,
  win,
  compareTo,
}: {
  app: string;
  envs: EnvSpec[];
  win: AirspaceWindow;
  /** ?compare=<env>: open the diff with this environment as the newer side. */
  compareTo?: string;
}) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const withSpec = envs.filter(e => e.spec);
  const [envKey, setEnvKey] = useState(() => envId(withSpec[0] ?? envs[0]));
  useEffect(() => {
    if (!envs.some(e => envId(e) === envKey) && envs[0]) setEnvKey(envId(withSpec[0] ?? envs[0]));
  }, [envs, envKey, withSpec]);
  const current = envs.find(e => envId(e) === envKey) ?? envs[0];

  return (
    <>
      <Section title="Deployed specs" meta={<Count>signed onto each environment's image</Count>} framed>
        <div className={c.filterPad}>
          <FilterBar>
            <FilterChips
              label="Environment"
              options={envs.map(e => ({ id: envId(e), label: e.env, title: `${e.env} on ${e.cluster}` }))}
              value={envKey}
              onChange={setEnvKey}
            />
          </FilterBar>
        </div>
        {current && <EnvSpecDetail app={app} env={current} win={win} />}
      </Section>
      {withSpec.length >= 2 ? (
        <SpecDiffSection envs={withSpec} compareTo={compareTo} />
      ) : (
        <Hint>
          Only {withSpec[0]?.env ?? 'no environment'} carries a signed spec, so there is nothing to compare yet. Each build signs the
          spec onto its image; once a second environment runs one, the diff between them shows here.
        </Hint>
      )}
    </>
  );
}

function EnvSpecDetail({ app, env, win }: { app: string; env: EnvSpec; win: AirspaceWindow }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const observed = useObservedOperations(env.cluster, serviceNameOf(app, env.env), win);
  const ops = useMemo(() => (env.spec ? specOperations(env.spec.predicate.spec) : []), [env.spec]);
  // Server spans that name a route, matched to the spec's operations. A span carrying only a method matches nothing.
  const usage = useMemo(() => {
    const out = new Map<string, number>();
    for (const o of observed.operations) {
      const op = operationForSpan(o.name, ops);
      if (op) out.set(op.key, (out.get(op.key) ?? 0) + o.rate);
    }
    return out;
  }, [observed.operations, ops]);

  if (env.loading) return <EmptyNote inset>Reading {env.env}'s image…</EmptyNote>;
  if (env.error) {
    return (
      <Callout tone="neutral" title={`Couldn't read ${env.env}'s image attestations`}>
        {env.error}
      </Callout>
    );
  }
  if (!env.spec) {
    return (
      <EmptyNote inset>
        {env.env} runs {tagOf(env.image)}, which carries no signed spec: it was built before the app had an openapi.yaml (cicd.yaml
        api.spec), or before Glidepath attested specs.
      </EmptyNote>
    );
  }
  const p = env.spec.predicate;
  const why = explain(env.spec.attestation, 'API spec');
  return (
    <>
      <div className={c.factsPad}>
        <FactGrid>
          <Fact label="API">
            {p.title || app} {p.version && <span className={c.mono}>{p.version}</span>}
          </Fact>
          <Fact label="Format">
            {p.apiType} {p.specVersion}
          </Fact>
          <Fact label="Signature" title={`${why.headline}. ${why.body}`}>
            <StatusChip tone={VERDICT_TONE[env.spec.verdict]} title={why.headline}>
              {why.label}
            </StatusChip>
          </Fact>
          <Fact label="Image">
            <span className={c.mono}>{tagOf(env.image)}</span>
          </Fact>
          <Fact label="Digest">
            <span className={c.mono}>{short(env.digest)}</span>
          </Fact>
          <Fact label="Spec file">
            <span className={c.mono}>
              {p.path} · {short(p.sha256)}
            </span>
          </Fact>
        </FactGrid>
      </div>
      {env.spec.verdict !== 'verified' && (
        <Hint inset>
          {why.headline}. {why.consequence ?? why.body}
        </Hint>
      )}
      <div className={c.scrollBox}>
        <table className={tk.table}>
          <thead>
            <tr>
              <th className={tk.th}>Method</th>
              <th className={tk.th}>Path</th>
              <th className={tk.th}>Summary</th>
              <th className={tk.th}>Seen in {env.env}</th>
            </tr>
          </thead>
          <tbody>
            {ops.map(o => (
              <tr key={o.key}>
                <td className={tk.td}>
                  <span className={c.method}>{o.method}</span>
                </td>
                <td className={tk.td}>
                  <span className={`${c.path} ${o.deprecated ? c.deprecatedPath : ''}`}>{o.path}</span>
                </td>
                <td className={tk.td}>{o.summary || '—'}</td>
                <td className={tk.td}>{usage.has(o.key) ? formatRate(usage.get(o.key)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint inset>
        "Seen" is per operation, from server spans in the last {win} that name a route. Traces don't say which fields a caller
        reads, and frameworks that report only the method match no operation.
      </Hint>
    </>
  );
}

function SpecDiffSection({ envs, compareTo }: { envs: EnvSpec[]; compareTo?: string }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const ids = envs.map(envId);
  const initialTo = envs.find(e => e.env === compareTo) ?? envs[envs.length - 1];
  const initialFrom = envs.find(e => e !== initialTo && envId(e) !== envId(initialTo)) ?? envs[0];
  const [from, setFrom] = useState(envId(initialFrom));
  const [to, setTo] = useState(envId(initialTo));
  const a = envs.find(e => envId(e) === from);
  const b = envs.find(e => envId(e) === to);
  const diff = useMemo(() => (a?.spec && b?.spec ? diffSpecs(a.spec.predicate.spec, b.spec.predicate.spec) : undefined), [a, b]);
  const same = a?.spec && b?.spec && a.spec.predicate.sha256 === b.spec.predicate.sha256;
  const options = envs.map(e => ({ value: envId(e), label: `${e.env} · ${e.spec?.predicate.version || short(e.spec?.predicate.sha256, 7)}` }));
  const unverified = [a, b].filter(e => e?.spec && e.spec.verdict !== 'verified').map(e => e!.env);
  let emptyNote: string | undefined;
  if (from === to) emptyNote = 'Pick two different environments.';
  else if (same) emptyNote = `Both run the same spec file (${short(a?.spec?.predicate.sha256)}).`;
  else if (!diff || diff.operations.length === 0) {
    emptyNote = 'The files differ, but no operation, parameter, request body or success response changed.';
  }

  return (
    <Section
      title={`Diff ${a?.env ?? '?'} → ${b?.env ?? '?'}`}
      meta={diff ? <Count>{diff.breakingCount} breaking · {diff.nonBreakingCount} other · {diff.unchangedCount} unchanged</Count> : undefined}
      framed
    >
      <div className={c.filterPad}>
        <FilterBar>
          <FilterSelect label="From" value={from} options={options} onChange={setFrom} />
          <FilterSelect label="To" value={to} options={options.filter(o => ids.includes(o.value))} onChange={setTo} />
        </FilterBar>
      </div>
      <Hint inset>
        What changed from the spec {a?.env} runs to the one {b?.env} runs, read by Tower: removed operations, parameters and request
        fields that became required, and response fields removed or retyped count as breaking. A release PR's api-compat check
        (oasdiff) is the authoritative report; it shows on the Release Record.
      </Hint>
      {unverified.length > 0 && (
        <Hint inset>The spec on {unverified.join(' and ')} is not verified: the diff reads it as it is, without trusting it.</Hint>
      )}
      {emptyNote || !diff ? (
        <EmptyNote inset>{emptyNote}</EmptyNote>
      ) : (
        <div className={c.scrollBox}>
          <table className={tk.table}>
            <thead>
              <tr>
                <th className={tk.th}>Change</th>
                <th className={tk.th}>Method</th>
                <th className={tk.th}>Path</th>
                <th className={tk.th}>What</th>
              </tr>
            </thead>
            <tbody>
              {diff.operations.map(d => (
                <DiffRow key={d.key} d={d} c={c} tk={tk} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function DiffRow({ d, c, tk }: { d: OperationDiff; c: ReturnType<typeof useStyles>; tk: ReturnType<typeof useTableKit> }) {
  const label = { added: 'Added', removed: 'Removed', changed: 'Changed' }[d.kind];
  return (
    <tr>
      <td className={tk.td}>
        <StatusChip tone={d.breaking ? 'warn' : 'neutral'}>{d.breaking ? `${label} · breaking` : label}</StatusChip>
      </td>
      <td className={tk.td}>
        <span className={c.method}>{d.method}</span>
      </td>
      <td className={tk.td}>
        <span className={c.path}>{d.path}</span>
      </td>
      <td className={tk.td}>
        <ul className={c.changeList}>
          {d.changes.map(x => (
            <li key={x.text}>{x.breaking ? <strong>{x.text}</strong> : x.text}</li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

/** The card shown when an app provides an API but no environment's image carries a signed spec. */
export function NoDeployedSpec({ app }: { app: string }) {
  return (
    <Card title="Deployed specs">
      <Hint>
        No environment of {app} runs an image with a signed spec yet. Glidepath signs the file named by cicd.yaml api.spec
        (default openapi.yaml at the repo root) onto every build; once a build with one is deployed, each environment's spec and
        the diff between them show here.
      </Hint>
    </Card>
  );
}
