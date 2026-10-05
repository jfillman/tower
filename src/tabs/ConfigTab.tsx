import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { TowerEmptyState } from '../TowerEmptyState';
import { useReleaseContext } from '../useReleaseContext';
import { ConfigEditor } from '../values/ValuesForm';
import { useChartValues } from '../values/annotatedValues';
import { useComponentCatalog } from '../values/componentCatalog';
import { usePlatformValuesSource } from '../values/sources';
import { PageHeader, Panel, Subtabs } from '../ui';
import { useUi } from '../ui/styles';
import { useHangarTokens } from '../brand/tokens';
import type { PlatformEnvSelector } from '../types';

// App Configuration: the config that belongs to the app as a whole, not to one environment. Two files of the app's source
// repo, each edited with the same values form (and the same Pending changes panel) an environment's row uses:
//
//  - platform/base.yaml: the values every Ground environment starts from, so a change here reaches all of them.
//  - platform/pr-env.yaml: the template each preview environment is built from.
//
// An environment's own values (Ground and Flight) are edited in the Environments tab, in that environment's row.

type Section = 'base' | 'preview';

const SECTIONS: Array<{ id: Section; label: string; selector: PlatformEnvSelector; path: string; title: string; hint: string }> = [
  {
    id: 'base',
    label: 'Shared values',
    selector: { kind: 'base' },
    path: 'platform/base.yaml',
    title: 'Shared values (platform/base.yaml)',
    hint: 'The values every Ground environment starts from. An environment overrides any of them in its own file, so a change here reaches each environment that has not.',
  },
  {
    id: 'preview',
    label: 'Preview environments',
    selector: { kind: 'pr-env' },
    path: 'platform/pr-env.yaml',
    title: 'Preview environment template (platform/pr-env.yaml)',
    hint: 'The template every pull request preview environment is built from. Its name and image are set by the platform.',
  },
];

function PlatformValues({ owner, appName, section }: { owner: string; appName: string; section: (typeof SECTIONS)[number] }) {
  const source = usePlatformValuesSource({ owner, appName, selector: section.selector });
  const componentCatalog = useComponentCatalog(owner);
  const chart = useChartValues(owner);
  return <ConfigEditor owner={owner} appName={appName} source={source} title={section.title} layout="side" componentCatalog={componentCatalog} chart={chart} />;
}

export function ConfigTab() {
  const t = useHangarTokens();
  const ui = useUi({ t });
  const { owner, appName, loading, error } = useReleaseContext();
  const [section, setSection] = useState<Section>('base');
  const [searchParams, setSearchParams] = useSearchParams();

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (!owner || !appName) {
    return (
      <TowerEmptyState
        title="Can't resolve this app's source repo"
        description="App Configuration needs a resolved GitHub owner/repo (from a promoted environment's provenance) to know which repo's platform/ folder to read."
      />
    );
  }
  const active = SECTIONS.find(s => s.id === section) ?? SECTIONS[0];
  const legacyEnv = searchParams.get('env');
  const toEnvironments = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('env');
    next.set('tab', 'environments');
    setSearchParams(next);
  };

  return (
    <div>
      <PageHeader title="App Configuration" subtitle={`What ${appName} shares across its environments. Every change opens a pull request on the ${appName} repo; nothing is committed directly.`} />
      <Panel style={{ padding: 12, marginBottom: 16 }}>
        <span className={ui.note}>
          {legacyEnv ? `${legacyEnv}'s own values moved: ` : "An environment's own values are edited in its row on the "}
          <a href="#environments" onClick={e => { e.preventDefault(); toEnvironments(); }}>Environments tab</a>.
        </span>
      </Panel>
      <Subtabs label="App configuration sections" value={section} onChange={setSection} tabs={SECTIONS.map(s => ({ id: s.id, label: s.label }))} />
      <div className={ui.note} style={{ margin: '12px 0' }}>
        {active.hint} <code>{active.path}</code>
      </div>
      <PlatformValues key={active.id} owner={owner} appName={appName} section={active} />
    </div>
  );
}
