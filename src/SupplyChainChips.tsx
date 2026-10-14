import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from './brand/tokens';
import type { ProvenanceResponse } from './types';
import { StatusChip, type StatusTone } from './ui';
import { explain, findSlsa, isSignedAndAttested, verdictOf, worstVerdict, type Verdict } from './supplyChain';

// One canonical rendering of "is this release's supply chain verified" -
// cosign + SLSA + a real Rekor transparency-log link. Previously duplicated
// inline in both ReleaseCard's SupplyChainBadges and ReleaseMatrix's cell
// expand; factored out for the 2026-09-16 Releases revamp, whose whole point
// was "supply-chain verification needs to be present throughout and
// accessible" without rendering the same facts three different ways. Used by
// ReleaseMatrix (matrix cell expand) and ReleaseLog (log row expand).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  row: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
}));

const VERDICT_TONE: Record<Verdict, StatusTone> = { verified: 'ok', unverified: 'warn', contradicted: 'bad', missing: 'neutral' };

export function SupplyChainChips({ provenance }: { provenance?: ProvenanceResponse }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (!provenance) return null;

  const slsa = findSlsa(provenance);
  const signedAndAttested = isSignedAndAttested(provenance);
  const rekor = provenance.attestations.find(a => a.transparencyLog)?.transparencyLog;
  const logged = worstVerdict(provenance.attestations.filter(a => a.transparencyLog));
  if (!slsa && provenance.attestations.length === 0) return null;
  const slsaVerdict = verdictOf(slsa);

  return (
    <div className={classes.row}>
      {signedAndAttested && <StatusChip tone="ok">cosign verified</StatusChip>}
      {slsa && (
        <StatusChip tone={VERDICT_TONE[slsaVerdict]}>
          SLSA {slsaVerdict === 'verified' ? 'provenance' : explain(slsa, 'build provenance').label}
        </StatusChip>
      )}
      {rekor && (
        // Not a link: this platform runs its own internal Rekor
        // (rekor-server.rekor-system, see glidepathProvenance.ts), which has
        // no public-facing search UI. logIndex is only meaningful against
        // that internal log, so linking out to sigstore's public
        // search.sigstore.dev would either 404 or, worse, silently resolve
        // to an unrelated public entry that happens to share the index.
        <StatusChip tone={logged === 'verified' ? 'ok' : 'warn'}>Rekor entry #{rekor.logIndex}</StatusChip>
      )}
    </div>
  );
}
