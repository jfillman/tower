import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens, type HangarTokens } from '../../brand/tokens';
import { nicknameForImageTag, useReleaseContext } from '../useReleaseContext';
import { useTektonPipelineRuns } from '../tekton/useTektonPipelineRuns';
import { RefreshButton } from '../RefreshButton';
import { EnvironmentTopology } from '../EnvironmentTopology';
import { EnvPicker, type EnvPickerGroup } from '../EnvPicker';
import { envStageRank, envTierOf, health, imageTag, type EnvTier } from '../types';

// Modernized 2026-09-17 to match the rest of Tower's post-"Ground Control"
// look: the same tiered env picker the Deployments tab uses (item 1),
// driving a single-environment focused view (EnvironmentTopology) instead
// of every environment stacked on one long page - the same "pick one env,
// see everything about it" shape Deployments already established, so the
// two tabs read as one consistent system rather than two different UI
// languages for adjacent concerns.

const TIER_DISPLAY_ORDER: EnvTier[] = ['lower', 'upper', 'preview'];

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  main: { display: 'flex', flexDirection: 'column', gap: 16 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: 11,
    letterSpacing: '0.06em',
    color: ({ t }) => t.textFaint,
    textTransform: 'uppercase',
  },
  note: { fontSize: 12.5, fontStyle: 'italic', padding: '14px 20px', color: ({ t }) => t.textLo },
}));

export function TopologyTab() {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const { environments, loading, error, appName, pipelineOrder, refresh } = useReleaseContext();
  const pipelineRuns = useTektonPipelineRuns(appName);

  const [searchParams] = useSearchParams();
  const linkedEnv = searchParams.get('env') ?? undefined;

  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (selectedEnv && environments.some(e => e.env === selectedEnv)) return;
    if (linkedEnv && environments.some(e => e.env === linkedEnv)) {
      setSelectedEnv(linkedEnv);
      return;
    }
    setSelectedEnv(environments[0]?.env);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environments, linkedEnv]);

  const withTier = useMemo(
    () =>
      environments.map(env => ({
        env,
        tier: envTierOf(env.env, { lower: pipelineOrder.lower, upper: pipelineOrder.upper }),
        rank: envStageRank(env.env, pipelineOrder.data),
      })),
    [environments, pipelineOrder],
  );

  const pickerGroups: EnvPickerGroup[] = useMemo(
    () =>
      TIER_DISPLAY_ORDER.map(tier => {
        const items = withTier
          .filter(x => x.tier === tier)
          .sort((a, b) => a.rank - b.rank)
          .map(({ env: e }) => {
            const tag = e.image ? imageTag(e.image) : undefined;
            return {
              key: e.key,
              envName: e.env,
              cluster: e.cluster,
              health: health(e),
              active: e.env === selectedEnv,
              imageTag: tag,
              imageNickname: tag ? nicknameForImageTag(tag, pipelineRuns.runs) : undefined,
              onClick: () => setSelectedEnv(e.env),
            };
          });
        return { tier, items };
      }).filter(g => g.items.length > 0),
    [withTier, selectedEnv, pipelineRuns.runs],
  );

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={new Error(error)} />;
  if (environments.length === 0) {
    return (
      <div className={classes.main}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography className={classes.eyebrow}>
            route → service → workload → pods, real-time from each cluster
          </Typography>
          <RefreshButton onClick={refresh} />
        </div>
        <EnvPicker
          summary="0 environments"
          groups={[
            { tier: 'lower', items: [] },
            { tier: 'upper', items: [] },
          ]}
          showConnectors={false}
        />
        <Typography className={classes.note}>
          Once something's rolled out somewhere, its topology will show up here.
        </Typography>
      </div>
    );
  }

  const selected = environments.find(e => e.env === selectedEnv) ?? environments[0];
  const selectedTier = envTierOf(selected.env, { lower: pipelineOrder.lower, upper: pipelineOrder.upper });

  return (
    <div className={classes.main}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography className={classes.eyebrow}>
          route → service → workload → pods, real-time from each cluster
        </Typography>
        <RefreshButton onClick={refresh} />
      </div>

      <EnvPicker
        summary={`${environments.length} environment${environments.length === 1 ? '' : 's'}`}
        groups={pickerGroups}
        showConnectors={false}
      />

      <EnvironmentTopology env={selected} tier={selectedTier} />
    </div>
  );
}
