import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import type { ProvenanceResponse } from './types';

// One canonical rendering of "is this release's supply chain verified" -
// cosign + SLSA + a real Rekor transparency-log link. Previously duplicated
// inline in both ReleaseCard's SupplyChainBadges and ReleaseMatrix's cell
// expand; factored out for the 2026-09-16 Releases revamp, whose whole point
// was "supply-chain verification needs to be present throughout and
// accessible" without rendering the same facts three different ways. Used by
// ReleaseMatrix (matrix cell expand) and ReleaseLog (log row expand).

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  row: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '3px 9px',
    borderRadius: 11,
    border: '1px solid',
    textDecoration: 'none',
  },
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
        <span className={classes.chip} style={{ backgroundColor: t.goodSoft, borderColor: t.good, color: t.good }}>
          cosign verified
        </span>
      )}
      {slsa && (
        <span
          className={classes.chip}
          style={
            slsa.verified
              ? { backgroundColor: t.goodSoft, borderColor: t.good, color: t.good }
              : { backgroundColor: t.amberSoft, borderColor: t.amberLine, color: t.amberInk }
          }
        >
          SLSA {slsa.verified ? 'provenance' : 'unverified'}
        </span>
      )}
      {rekor && (
        // Not a link: this platform runs its own internal Rekor
        // (rekor-server.rekor-system, see glidepathProvenance.ts), which has
        // no public-facing search UI. logIndex is only meaningful against
        // that internal log, so linking out to sigstore's public
        // search.sigstore.dev would either 404 or, worse, silently resolve
        // to an unrelated public entry that happens to share the index.
        <span
          className={classes.chip}
          style={{ backgroundColor: t.skySoft, borderColor: t.skyLine, color: t.sky }}
        >
          Rekor entry #{rekor.logIndex}
        </span>
      )}
    </div>
  );
}
