import { useSearchParams } from 'react-router-dom';
import { useEntity } from '@backstage/plugin-catalog-react';
import { CAP, hasCapabilities } from '../serviceClass';
import { Subtabs } from '../ui';
import { ConfigTab } from './ConfigTab';
import { EnvironmentsTab } from './EnvironmentsTab';
import { GlidepathTab } from './GlidepathTab';

// Everything about a service that lives in git, in one top-level tab (2026-10-22 UI pass, recommendation 4). It used
// to be three: Environments, App Configuration and Glidepath, and a first-time user could not tell which one owned a
// setting. Each sub-tab says which file it edits. The sub-tab ids are the old top-level tab ids, so every existing
// deep link (?tab=environments, ?tab=config, ?tab=glidepath, Backstage's "Finish in Tower") still lands in the right
// place: TowerPage maps those ids onto this tab.

export const CONFIGURE_SUBTABS = ['environments', 'config', 'glidepath'] as const;
export type ConfigureSubtab = (typeof CONFIGURE_SUBTABS)[number];

export function isConfigureSubtab(id: string | null | undefined): id is ConfigureSubtab {
  return (CONFIGURE_SUBTABS as readonly string[]).includes(id ?? '');
}

const SUBTABS: Array<{ id: ConfigureSubtab; label: string }> = [
  { id: 'environments', label: 'Environments' },
  { id: 'config', label: 'Shared values (base.yaml)' },
  { id: 'glidepath', label: 'Pipeline (cicd.yaml)' },
];

export function ConfigureTab() {
  const { entity } = useEntity();
  const [searchParams, setSearchParams] = useSearchParams();
  // Shared values are Helm values files: a cloud target (ECS, Lambda) has none.
  const subtabs = SUBTABS.filter(s => s.id !== 'config' || hasCapabilities(entity, [CAP.valuesConfig]));
  const param = searchParams.get('tab');
  const active: ConfigureSubtab = isConfigureSubtab(param) && subtabs.some(s => s.id === param) ? param : subtabs[0].id;
  const select = (id: ConfigureSubtab) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', id);
      return next;
    });

  return (
    <div>
      <Subtabs label="Configure" tabs={subtabs} value={active} onChange={select} />
      <div style={{ marginTop: 16 }}>
        {active === 'environments' && <EnvironmentsTab />}
        {active === 'config' && <ConfigTab />}
        {active === 'glidepath' && <GlidepathTab />}
      </div>
    </div>
  );
}
