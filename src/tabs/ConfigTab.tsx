import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { TowerEmptyState } from '../TowerEmptyState';
import { useReleaseContext } from '../useReleaseContext';
import { ENVS_ROOT } from '../types';
import { ConfigEditor } from '../values/ValuesForm';
import { useChartValues } from '../values/annotatedValues';
import { useComponentCatalog } from '../values/componentCatalog';
import { useFlightBaseValuesSource, usePlatformValuesSource, type ValuesSource } from '../values/sources';
import { RawValuesEditor } from '../values/RawValuesEditor';
import { useCicdConfig } from '../useConfigData';
import { readEnvironments, type Deploy } from '../environments/stagedChanges';
import { ownChartOf, type ChartRef } from '../environments/ownChart';
import { PageHeader, Panel, Subtabs } from '../ui';
import { useUi } from '../ui/styles';
import { useHangarTokens } from '../brand/tokens';
import type { PlatformEnvSelector } from '../types';

// App Configuration: the config that belongs to the app as a whole, not to one environment, each edited with the same
// values form (and Pending changes panel) an environment's row uses:
//
//  - Ground shared values: glidepath/base.yaml in the source repo, under every Ground environment's own file.
//  - Flight shared values, one per cluster the app has Flight environments on: gitops-<app>/<cluster>/base.yaml, under
//    each Flight environment's values.yaml on that cluster. A separate file on purpose: a source-repo change must
//    never reach a Flight environment without a reviewed PR on its gitops repo (owner decision, 2026-10-09).
//  - Preview environments: glidepath/pr-env.yaml, the template each pull request preview is built from.
//
// An app whose environments render their own chart (deploy.chart, glidepath ADR-0023) gets the raw YAML editor for the
// shared values, as its environment rows do: the form describes Airframe's chart. Previews always render the default
// chart, so their template keeps the form.
//
// An environment's own values (Ground and Flight) are edited in the Environments tab, in that environment's row.

type Section =
  | { id: 'base'; label: string; title: string; hint: string; path: string; kind: 'base' }
  | { id: string; label: string; title: string; hint: string; path: string; kind: 'flight'; cluster: string }
  | { id: 'preview'; label: string; title: string; hint: string; path: string; kind: 'pr-env' };

/** The tab's sections for an app with Flight environments on `clusters`. */
export function configSections(appName: string, clusters: string[]): Section[] {
  const several = clusters.length > 1;
  return [
    {
      id: 'base',
      kind: 'base',
      label: 'Ground shared values',
      title: 'Ground shared values',
      path: `${ENVS_ROOT}/base.yaml`,
      hint: 'The values every Ground environment starts from; an environment overrides any of them in its own file. Flight environments do not read this file: they have their own shared values, changed through a reviewed PR on the gitops repo.',
    },
    ...clusters.map(cluster => ({
      id: `flight-${cluster}`,
      kind: 'flight' as const,
      cluster,
      label: several ? `Flight shared values (${cluster})` : 'Flight shared values',
      title: `Flight shared values on ${cluster}`,
      path: `gitops-${appName}/${cluster}/base.yaml`,
      hint: `The values every Flight environment on ${cluster} starts from; an environment overrides any of them in its own values.yaml. A change opens a PR on gitops-${appName} and reaches those environments when it merges, like a release.`,
    })),
    {
      id: 'preview',
      kind: 'pr-env',
      label: 'Preview environments',
      title: 'Preview environment template',
      path: `${ENVS_ROOT}/pr-env.yaml`,
      hint: "The template every pull request preview environment is built from (on the cluster's default chart). Its name and image are set by the platform.",
    },
  ];
}

function Editor({ owner, appName, section, source, own }: { owner: string; appName: string; section: Section; source: ValuesSource; own?: ChartRef }) {
  const componentCatalog = useComponentCatalog(owner);
  const chart = useChartValues(owner);
  if (own && section.kind !== 'pr-env') return <RawValuesEditor source={source} chart={own} />;
  return (
    <ConfigEditor
      owner={owner}
      appName={appName}
      source={source}
      title={`${section.title} (${section.path})`}
      layout="side"
      componentCatalog={componentCatalog}
      chart={chart}
      shared={section.kind !== 'pr-env'}
    />
  );
}

function PlatformValues(props: { owner: string; appName: string; section: Section; selector: PlatformEnvSelector; own?: ChartRef }) {
  const source = usePlatformValuesSource({ owner: props.owner, appName: props.appName, selector: props.selector });
  return <Editor {...props} source={source} />;
}

function FlightValues(props: { owner: string; appName: string; section: Section; cluster: string; own?: ChartRef }) {
  const source = useFlightBaseValuesSource({ owner: props.owner, appName: props.appName, cluster: props.cluster });
  return <Editor {...props} source={source} />;
}

export function ConfigTab() {
  const t = useHangarTokens();
  const ui = useUi({ t });
  const { owner, appName, loading, error } = useReleaseContext();
  const [sectionId, setSection] = useState<string>('base');
  const cicd = useCicdConfig(owner && appName ? { owner, appName } : undefined);
  const deploy = cicd.data?.values.deploy as Deploy | undefined;
  const clusters = useMemo(
    () => [...new Set(readEnvironments(deploy).envs.filter(e => e.tier === 'flight' && e.cluster).map(e => e.cluster as string))],
    [deploy],
  );
  // No environment is named "": only deploy.chart applies, the chart the app's environments render by default.
  const own = ownChartOf(deploy, '');
  const [searchParams, setSearchParams] = useSearchParams();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (!owner || !appName) {
    return (
      <TowerEmptyState
        title="Can't resolve this app's source repo"
        description="App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which repo's environments folder to read."
      />
    );
  }
  const sections = configSections(appName, clusters);
  const active = sections.find(s => s.id === sectionId) ?? sections[0];
  const legacyEnv = searchParams.get('env');
  const toEnvironments = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('env');
    next.set('tab', 'environments');
    setSearchParams(next);
  };

  return (
    <div>
      <PageHeader title="App Configuration" subtitle={`What ${appName} shares across its environments. Every change opens a pull request (on the ${appName} repo, or gitops-${appName} for Flight); nothing is committed directly.`} />
      <Panel style={{ padding: 12, marginBottom: 16 }}>
        <span className={ui.note}>
          {legacyEnv ? `${legacyEnv}'s own values moved: ` : "An environment's own values are edited in its row on the "}
          <a href="#environments" onClick={e => { e.preventDefault(); toEnvironments(); }}>Environments tab</a>.
        </span>
      </Panel>
      <Subtabs label="App configuration sections" value={active.id} onChange={setSection} tabs={sections.map(s => ({ id: s.id, label: s.label }))} />
      <div className={ui.note} style={{ margin: '12px 0' }}>
        {active.hint} <code>{active.path}</code>
      </div>
      {active.kind === 'flight' ? (
        <FlightValues key={active.id} owner={owner} appName={appName} section={active} cluster={active.cluster} own={own} />
      ) : (
        <PlatformValues key={active.id} owner={owner} appName={appName} section={active} selector={{ kind: active.kind }} own={own} />
      )}
    </div>
  );
}
