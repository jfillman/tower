import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEntity } from '@backstage/plugin-catalog-react';
import { CAP, hasCapabilities } from '../serviceClass';
import { Hint, Subtabs } from '../ui';
import { SettingFinder } from '../configure/SettingFinder';
import type { SettingHit } from '../configure/settingIndex';
import { StagedScope } from '../configure/stagedScope';
import { ConfigTab } from './ConfigTab';
import { EnvironmentsTab } from './EnvironmentsTab';
import { GlidepathTab } from './GlidepathTab';

// Everything about a service that lives in git, in one top-level tab (2026-10-22 UI pass, recommendation 4). It used
// to be three: Environments, App Configuration and Glidepath, and a first-time user could not tell which one owned a
// setting. The sub-tab ids are the old top-level tab ids, so every existing deep link (?tab=environments,
// ?tab=config, ?tab=glidepath, Backstage's "Finish in Tower") still lands in the right place: TowerPage maps those ids
// onto this tab.
//
// A sub-tab, once opened, stays mounted (hidden) so changes staged in it survive switching to another; a sub-tab
// holding staged changes is marked, and the line above the content names them. "Find a setting" searches every file
// the three sub-tabs edit.

export const CONFIGURE_SUBTABS = ['environments', 'config', 'glidepath'] as const;
export type ConfigureSubtab = (typeof CONFIGURE_SUBTABS)[number];

export function isConfigureSubtab(id: string | null | undefined): id is ConfigureSubtab {
  return (CONFIGURE_SUBTABS as readonly string[]).includes(id ?? '');
}

const SUBTABS: Array<{ id: ConfigureSubtab; label: string; Component: () => JSX.Element | null }> = [
  { id: 'environments', label: 'Environments', Component: EnvironmentsTab },
  { id: 'config', label: 'Shared values (base.yaml)', Component: ConfigTab },
  { id: 'glidepath', label: 'Pipeline (cicd.yaml)', Component: GlidepathTab },
];

export function ConfigureTab() {
  const { entity } = useEntity();
  const [searchParams, setSearchParams] = useSearchParams();
  // Shared values are Helm values files: a cloud target (ECS, Lambda) has none.
  const subtabs = SUBTABS.filter(s => s.id !== 'config' || hasCapabilities(entity, [CAP.valuesConfig]));
  const param = searchParams.get('tab');
  const active: ConfigureSubtab = isConfigureSubtab(param) && subtabs.some(s => s.id === param) ? param : subtabs[0].id;
  const [visited, setVisited] = useState<Set<ConfigureSubtab>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));
  const [staged, setStaged] = useState<Partial<Record<ConfigureSubtab, number>>>({});
  const onTotal = useMemo(
    () =>
      Object.fromEntries(
        CONFIGURE_SUBTABS.map(id => [id, (n: number) => setStaged(prev => (prev[id] === n ? prev : { ...prev, [id]: n }))]),
      ) as Record<ConfigureSubtab, (n: number) => void>,
    [],
  );

  const go = useCallback(
    (id: ConfigureSubtab, row?: string) =>
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        if (row) next.set('row', row);
        else next.delete('row');
        return next;
      }),
    [setSearchParams],
  );
  const openHit = (hit: SettingHit) => go(hit.file.subtab, hit.file.env);

  const elsewhere = subtabs.filter(s => s.id !== active && (staged[s.id] ?? 0) > 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <Subtabs
          label="Configure"
          tabs={subtabs.map(s => ({ id: s.id, label: s.label, marked: (staged[s.id] ?? 0) > 0 }))}
          value={active}
          onChange={id => go(id)}
        />
        <SettingFinder onOpen={openHit} />
      </div>
      {elsewhere.length > 0 && (
        <Hint>
          Staged and not yet opened in{' '}
          {elsewhere.map(s => `${s.label} (${staged[s.id]})`).join(', ')}. They stay staged while you work here; each sub-tab
          opens its own PR.
        </Hint>
      )}
      <div style={{ marginTop: 16 }}>
        {subtabs
          .filter(s => visited.has(s.id))
          .map(({ id, Component }) => (
            <div key={id} hidden={id !== active}>
              <StagedScope onTotal={onTotal[id]}>
                <Component />
              </StagedScope>
            </div>
          ))}
      </div>
    </div>
  );
}
