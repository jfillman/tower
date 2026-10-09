import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { useHangarTokens, type HangarTokens } from './brand/tokens';
import type { ProvenanceResponse } from './types';
import { StatusChip } from './ui';

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

export function SupplyChainChips({ provenance }: { provenance?: ProvenanceResponse }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (!provenance) return null;

  const slsa = provenance.attestations.find(a => a.predicateType === 'https://slsa.dev/provenance/v0.2');
  const anyVerified = provenance.attestations.some(a => a.verified);
  const rekor = provenance.attestations.find(a => a.transparencyLog)?.transparencyLog;
  if (!slsa && !anyVerified) return null;

  return (
    <div className={classes.row}>
      {anyVerified && (
        <StatusChip tone="ok">cosign verified</StatusChip>
      )}
      {slsa && (
        <StatusChip tone={slsa.verified ? 'ok' : 'warn'}>SLSA {slsa.verified ? 'provenance' : 'unverified'}</StatusChip>
      )}
      {rekor && (
        // Not a link: this platform runs its own internal Rekor
        // (rekor-server.rekor-system, see glidepathProvenance.ts), which has
        // no public-facing search UI. logIndex is only meaningful against
        // that internal log, so linking out to sigstore's public
        // search.sigstore.dev would either 404 or, worse, silently resolve
        // to an unrelated public entry that happens to share the index.
        <StatusChip tone="info">Rekor entry #{rekor.logIndex}</StatusChip>
      )}
    </div>
  );
}
