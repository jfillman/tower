import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from './brand/tokens.esm.js';
import { StatusChip } from './ui/index.esm.js';

const useStyles = makeStyles(() => ({
  row: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }
}));
function SupplyChainChips({ provenance }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (!provenance) return null;
  const slsa = provenance.attestations.find((a) => a.predicateType === "https://slsa.dev/provenance/v0.2");
  const anyVerified = provenance.attestations.some((a) => a.verified);
  const rekor = provenance.attestations.find((a) => a.transparencyLog)?.transparencyLog;
  if (!slsa && !anyVerified) return null;
  return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
    anyVerified && /* @__PURE__ */ jsx(StatusChip, { tone: "ok", children: "cosign verified" }),
    slsa && /* @__PURE__ */ jsxs(StatusChip, { tone: slsa.verified ? "ok" : "warn", children: [
      "SLSA ",
      slsa.verified ? "provenance" : "unverified"
    ] }),
    rekor && // Not a link: this platform runs its own internal Rekor
    // (rekor-server.rekor-system, see glidepathProvenance.ts), which has
    // no public-facing search UI. logIndex is only meaningful against
    // that internal log, so linking out to sigstore's public
    // search.sigstore.dev would either 404 or, worse, silently resolve
    // to an unrelated public entry that happens to share the index.
    /* @__PURE__ */ jsxs(StatusChip, { tone: "info", children: [
      "Rekor entry #",
      rekor.logIndex
    ] })
  ] });
}

export { SupplyChainChips };
//# sourceMappingURL=SupplyChainChips.esm.js.map
