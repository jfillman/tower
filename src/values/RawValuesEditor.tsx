import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import Link from '@material-ui/core/Link';
import { ResponseErrorPanel } from '@backstage/core-components';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { YamlBlockEditor, validateYamlBlock } from '../YamlBlockEditor';
import { Button } from '../ui';
import { describeChart, type ChartRef } from '../environments/ownChart';
import type { ValuesSource } from './sources';

const useStyles = makeStyles<Theme, { t: HangarTokens }>({
  note: { fontSize: 12.5, color: ({ t }) => t.textFaint, marginBottom: 10, lineHeight: 1.5 },
  mono: { fontFamily: fontMono, fontSize: 12 },
  bar: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 },
});

/**
 * The values file of an environment that renders its own chart, edited as raw YAML (the values form describes
 * Airframe's chart). Saving opens a pull request with the whole file; `release` and `releaseTracking` (and a Ground
 * file's envName) are kept by the backend and cannot be changed here.
 */
export function RawValuesEditor({ source, chart }: { source: ValuesSource; chart: ChartRef }) {
  const t = useHangarTokens();
  const c = useStyles({ t });
  const original = source.data?.raw ?? '';
  const [text, setText] = useState(original);
  useEffect(() => setText(original), [original]);
  const check = validateYamlBlock(text);
  const dirty = text !== original;
  return (
    <div>
      <div className={c.note}>
        This environment renders its own chart, <span className={c.mono}>{describeChart(chart)}</span>, not Airframe&apos;s, so its values are
        edited as YAML here. The keys are that chart&apos;s. <span className={c.mono}>release</span> and{' '}
        <span className={c.mono}>releaseTracking</span> belong to the deploy and release flows and are kept as they are.
      </div>
      <YamlBlockEditor label={source.data?.path ?? 'values'} value={text} onChange={setText} rows={16} />
      <div className={c.bar}>
        <Button
          variant="primary"
          disabled={!dirty || !check.valid || source.submitting}
          onMouseDown={e => e.preventDefault()}
          onClick={() => void source.submitRaw(text, [`Edit ${source.data?.path ?? 'values'} as YAML (own chart)`]).catch(() => undefined)}
        >
          {source.submitting ? 'Opening pull request…' : 'Open pull request'}
        </Button>
        {source.result && (
          <Link className={c.mono} href={source.result.prUrl} target="_blank" rel="noopener noreferrer">
            {source.result.prUrl}
          </Link>
        )}
      </div>
      {source.submitError && <ResponseErrorPanel error={new Error(source.submitError)} />}
    </div>
  );
}
