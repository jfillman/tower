import { useState } from 'react';
import { ownChartOf } from '../../environments/ownChart';
import { RawValuesEditor } from '../../values/RawValuesEditor';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { pipelinesNamingEnv, type CloudBlock, type Deploy, type EnvDef } from '../../environments/stagedChanges';
import { ConfigEditor } from '../../values/ValuesForm';
import { ConfigMapFilesPanel, EnvXrPanel } from '../../values/FlightPanels';
import { useChartValues } from '../../values/annotatedValues';
import { useComponentCatalog } from '../../values/componentCatalog';
import { useClusterAnalysisTemplates } from '../../values/useClusterAnalysisTemplates';
import { useEnvValuesLoader, useFlightValuesSource, useGroundValuesSource, type ValuesSource } from '../../values/sources';
import { useEnvLifecycle } from '../../environments/useEnvLifecycle';
import { EnvLifecycle } from './EnvLifecycle';
import { useStyles as useValuesStyles } from '../../values/styles';
import { Button, ColumnLabel, Field, Subtabs } from '../../ui';
import { useUi } from '../../ui/styles';
import { BLOCK_FIELDS, type DisplayRow } from './shared';
import { ENVS_ROOT } from '../../types';

type SubtabId = 'settings' | 'values' | 'promotion' | 'danger';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 18px 18px 48px', backgroundColor: ({ t }) => t.panelAlt, borderTop: ({ t }) => `1px solid ${t.line}` },
  body: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 22px', maxWidth: 760 },
  facts: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', alignItems: 'baseline' },
  mono: { fontFamily: fontMono, fontSize: 12.5 },
  steps: { margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.7 },
  foot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: ({ t }) => `1px solid ${t.line}`, paddingTop: 12, color: ({ t }) => t.textLo, fontSize: 12.5 },
}));

export interface RowDetailContext {
  owner?: string;
  appName?: string;
  entity: string;
  deploy?: Deploy;
  pipelines: unknown;
  targetLabel: string;
  cloudBlock?: CloudBlock;
  onSetField: (env: EnvDef, block: CloudBlock, field: string, value: string) => void;
  onRemove: (name: string) => void;
  onUndoRemove: (name: string) => void;
  /** The declared environments, for "Copy values from". */
  siblings: EnvDef[];
  /** The submitted change that is still waiting on this environment, if any. */
  pendingFor: (name: string) => { prUrl: string; requestUrl?: string } | undefined;
}

type RowProps = { row: DisplayRow & { def: EnvDef }; ctx: RowDetailContext };

/** Reads the environment's values file once, for the lifecycle and the Values tab, then renders the row. */
export function RowDetail(props: RowProps) {
  const { row, ctx } = props;
  const hasFile = !ctx.cloudBlock && row.state !== 'new' && row.state !== 'pr-open' && Boolean(ctx.owner && ctx.appName);
  if (!hasFile) return <RowDetailBody {...props} />;
  if (row.def.tier === 'flight') return <FlightRow {...props} />;
  return <GroundRow {...props} />;
}

function FlightRow(props: RowProps) {
  const { row, ctx } = props;
  const source = useFlightValuesSource({ owner: ctx.owner as string, appName: ctx.appName as string, cluster: row.def.cluster ?? row.where, env: row.name });
  return <RowDetailBody {...props} source={source} />;
}

function GroundRow(props: RowProps) {
  const { row, ctx } = props;
  const source = useGroundValuesSource({ owner: ctx.owner as string, appName: ctx.appName as string, env: row.name });
  return <RowDetailBody {...props} source={source} />;
}

function RowDetailBody({ row, ctx, source }: RowProps & { source?: ValuesSource }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  const [tab, setTab] = useState<SubtabId>(ctx.cloudBlock ? 'settings' : 'values');
  const removed = row.state === 'removed';
  const steps = pipelinesNamingEnv(ctx.pipelines, row.name);
  const valuesFileExists = Boolean(source?.data?.raw?.trim());
  const pending = ctx.pendingFor(row.name);
  const ghost = row.state === 'pr-open';
  const lifecycle = useEnvLifecycle(
    {
      owner: ctx.owner ?? '',
      appName: ctx.appName ?? '',
      env: row.name,
      tier: def.tier,
      cluster: def.cluster ?? row.where,
      declared: !ghost && row.state !== 'new',
      cicdPrUrl: pending?.prUrl,
      knownRequestUrl: pending?.requestUrl,
      deployed: row.deployed,
      valuesFileExists,
      valuesFilePath: source?.data?.path ?? `${ENVS_ROOT}/envs/${row.name}.yaml`,
    },
    !ctx.cloudBlock && Boolean(ctx.owner && ctx.appName) && row.state !== 'new' && row.state !== 'removed',
  );
  const unfinished = lifecycle.steps.some(x => x.state !== 'done');

  // A pull request is open for it but nothing exists yet: there is only progress to show, and nothing to edit.
  if (ghost) {
    return (
      <div className={c.wrap}>
        <EnvLifecycle steps={lifecycle.steps} initiallyOpen />
        <div className={ui.note}>Nothing here can be edited until the environment exists. It appears in the table as it is created.</div>
      </div>
    );
  }

  return (
    <div className={c.wrap}>
      {!ctx.cloudBlock && unfinished && row.state !== 'new' && <EnvLifecycle steps={lifecycle.steps} />}
      <Subtabs
        label={`${row.name} sections`}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'settings', label: 'Settings' },
          { id: 'values', label: 'Values' },
          { id: 'promotion', label: 'Promotion' },
          { id: 'danger', label: 'Danger zone' },
        ]}
      />
      <div className={c.body}>
        {tab === 'settings' && <Settings row={row} ctx={ctx} />}
        {tab === 'values' && <Values row={row} ctx={ctx} source={source} />}
        {tab === 'promotion' && (
          <div className={ui.note}>
            {def.tier === 'ground' ? (
              <>
                <b>Ground.</b> Deploys automatically on every push to the default branch.
              </>
            ) : (
              <>
                <b>Flight.</b> Never deploys without an approved release: a pull request on{' '}
                <span className={c.mono}>gitops-{ctx.appName}</span> that Argo CD applies once it merges.
              </>
            )}
            <div style={{ marginTop: 10 }}>
              {steps.length > 0 ? (
                <>
                  {def.tier === 'ground' ? 'Deploy' : 'Release'} step in pipeline {steps.map(s => `"${s}"`).join(', ')}.
                </>
              ) : (
                <span className={ui.problem}>
                  No pipeline step {def.tier === 'ground' ? 'deploys' : 'releases'} to {row.name}. Add one in the Glidepath tab.
                </span>
              )}
            </div>
          </div>
        )}
        {tab === 'danger' && <Danger row={row} ctx={ctx} removed={removed} />}
      </div>
      {tab === 'settings' && ctx.cloudBlock && (
        <div className={c.foot}>
          <span>Staged. Nothing is submitted until you open the pull request from the pending changes.</span>
        </div>
      )}
    </div>
  );
}

function Settings({ row, ctx }: { row: DisplayRow & { def: EnvDef }; ctx: RowDetailContext }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const vc = useValuesStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  const block = ctx.cloudBlock;
  if (block) {
    const appLevel = (ctx.deploy?.[block] ?? {}) as Record<string, unknown>;
    const own = (def[block] ?? {}) as Record<string, unknown>;
    return (
      <>
        <div className={ui.note}>This environment&apos;s {ctx.targetLabel} resource. Leave a field empty to use the app-level value.</div>
        <div className={c.grid}>
          {BLOCK_FIELDS[block].map(f => (
            <Field
              key={f}
              id={`env-${row.name}-${f}`}
              label={f}
              source={own[f] !== undefined && own[f] !== '' ? { text: 'set here', set: true } : { text: 'app-level' }}
            >
              {p => (
                <input
                  {...p}
                  value={String(own[f] ?? '')}
                  placeholder={String(appLevel[f] ?? '')}
                  onChange={e => ctx.onSetField(def, block, f, e.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <div className={c.facts}>
        <ColumnLabel>Tier</ColumnLabel>
        <span>{def.tier === 'flight' ? 'Flight' : 'Ground'}</span>
        <ColumnLabel>Cluster</ColumnLabel>
        <span className={c.mono}>{def.cluster ?? row.where}</span>
        <ColumnLabel>Target</ColumnLabel>
        <span>{row.target}</span>
      </div>
      <div className={ui.note}>
        Tier, cluster and target cannot change on an existing environment. Remove it and add it again.
      </div>
      {def.tier === 'flight' && ctx.owner && ctx.appName && (
        <>
          <EnvXrPanel owner={ctx.owner} appName={ctx.appName} env={row.name} classes={vc} />
          <ConfigMapFilesPanel owner={ctx.owner} appName={ctx.appName} cluster={def.cluster ?? row.where} env={row.name} classes={vc} />
        </>
      )}
    </>
  );
}

function Values({ row, ctx, source }: { row: DisplayRow & { def: EnvDef }; ctx: RowDetailContext; source?: ValuesSource }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  // The values file may not exist yet (a Flight environment's is written by Crossplane, a Ground one's by the onboarding
  // pull request). Editing before then would open a pull request that creates the file out of order.
  const gate = (src?: ValuesSource) =>
    src && !src.loading && !src.error && src.data && !src.data.raw.trim() ? (
      <div className={ui.note}>
        The values file <span className={c.mono}>{src.data.path}</span> does not exist yet, so there is nothing to edit. The progress above shows what it is
        waiting on. It can be edited here as soon as it exists.
      </div>
    ) : undefined;
  if (ctx.cloudBlock) {
    return <div className={ui.note}>A cloud environment has no chart values. Its target resource is under Settings.</div>;
  }
  // An environment rendering its own chart (glidepath ADR-0023) gets raw YAML: the form describes Airframe's chart.
  const own = ownChartOf(ctx.deploy, row.name);
  if (def.tier === 'ground') {
    if (row.state === 'new') {
      return (
        <div className={ui.note}>
          Its values file, <span className={c.mono}>{ENVS_ROOT}/envs/{row.name}.yaml</span>, is created by a second pull request after the
          cicd.yaml change merges. Edit its values here once that is merged.
        </div>
      );
    }
    if (own) return gate(source) ?? <RawValuesEditor source={source as ValuesSource} chart={own} />;
    return gate(source) ?? <GroundValues ctx={ctx} env={row.name} cluster={row.where} source={source as ValuesSource} />;
  }
  if (own) return gate(source) ?? <RawValuesEditor source={source as ValuesSource} chart={own} />;
  return gate(source) ?? <FlightValues ctx={ctx} env={row.name} cluster={def.cluster ?? row.where} source={source as ValuesSource} />;
}

function useCopyFrom(ctx: RowDetailContext, env: string) {
  const load = useEnvValuesLoader();
  const others = ctx.siblings.filter(e => e.name !== env);
  return {
    options: others.map(e => ({ id: e.name, label: `${e.name} (${e.tier === 'flight' ? 'Flight' : 'Ground'})` })),
    load: (id: string) => {
      const e = ctx.siblings.find(x => x.name === id) as EnvDef;
      return load({ owner: ctx.owner as string, appName: ctx.appName as string, env: id, tier: e.tier, cluster: e.cluster });
    },
  };
}

function GroundValues({ ctx, env, cluster, source }: { ctx: RowDetailContext; env: string; cluster: string; source: ValuesSource }) {
  const copyFrom = useCopyFrom(ctx, env);
  const clusterTemplates = useClusterAnalysisTemplates(cluster);
  const componentCatalog = useComponentCatalog(ctx.owner);
  const chart = useChartValues(ctx.owner);
  return (
    <ConfigEditor
      owner={ctx.owner as string}
      appName={ctx.appName as string}
      source={source}
      title={env.toUpperCase()}
      layout="inline"
      copyFrom={copyFrom}
      analysisCluster={cluster}
      clusterAnalysisTemplates={clusterTemplates}
      componentCatalog={componentCatalog} chart={chart}
      sloContext={{ cluster, namespace: `app-${ctx.appName}-${env}`, app: ctx.appName as string }}
    />
  );
}

function FlightValues({ ctx, env, cluster, source }: { ctx: RowDetailContext; env: string; cluster: string; source: ValuesSource }) {
  const copyFrom = useCopyFrom(ctx, env);
  const clusterTemplates = useClusterAnalysisTemplates(cluster);
  const componentCatalog = useComponentCatalog(ctx.owner);
  const chart = useChartValues(ctx.owner);
  return (
    <ConfigEditor
      owner={ctx.owner as string}
      appName={ctx.appName as string}
      source={source}
      title={`${env.toUpperCase()} (${cluster})`}
      prod={/^prod/i.test(env)}
      layout="inline"
      copyFrom={copyFrom}
      analysisCluster={cluster}
      clusterAnalysisTemplates={clusterTemplates}
      componentCatalog={componentCatalog} chart={chart}
      sloContext={{ cluster, namespace: `app-${ctx.appName}-${env}`, app: ctx.appName as string }}
    />
  );
}

function Danger({ row, ctx, removed }: { row: DisplayRow & { def: EnvDef }; ctx: RowDetailContext; removed: boolean }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const ui = useUi({ t });
  const { def } = row;
  if (removed) {
    return (
      <>
        <div className={ui.note}>{row.name} is staged for removal. Nothing happens until you open the pull request.</div>
        <div>
          <Button onClick={() => ctx.onUndoRemove(row.name)}>Undo removal</Button>
        </div>
      </>
    );
  }
  if (def.tier === 'ground') {
    return (
      <>
        <div className={ui.note}>
          {ctx.cloudBlock
            ? `Removes ${row.name} from cicd.yaml. The ${ctx.targetLabel} resource it deployed to is not deleted.`
            : `Removes ${row.name} from cicd.yaml and deletes its values files in the same pull request. Argo CD then deletes everything running in it.`}
        </div>
        <div>
          <Button variant="danger" onClick={() => ctx.onRemove(row.name)}>
            Remove {row.name}…
          </Button>
        </div>
      </>
    );
  }
  return (
    <div className={ui.problem}>
      <b>Removing a Flight environment</b>
      <div className={ui.note}>
        Tower does not remove Flight environments. Deleting the ApplicationEnvironment does not delete the files it wrote, so a partial
        removal would leave an Application still deploying. By hand, in this order:
        <ol className={c.steps}>
          <li>Remove the pipeline step that releases to {row.name} (Glidepath tab).</li>
          <li>
            In the tenants repo, delete{' '}
            <span className={c.mono}>
              tenants/{ctx.appName}/{row.name}/
            </span>{' '}
            so the Application is no longer generated.
          </li>
          <li>
            In <span className={c.mono}>gitops-{ctx.appName}</span>, delete{' '}
            <span className={c.mono}>
              {def.cluster ?? '<cluster>'}/{row.name}/
            </span>
            .
          </li>
          <li>Delete the ApplicationEnvironment request, then remove {row.name} from cicd.yaml.</li>
        </ol>
      </div>
    </div>
  );
}
