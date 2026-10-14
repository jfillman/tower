import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { useHangarTokens } from './brand/tokens.esm.js';
import { StatusChip } from './ui/index.esm.js';
import { findSlsa, isSignedAndAttested, worstVerdict, verdictOf, explain } from './supplyChain.esm.js';

const useStyles = makeStyles(() => ({
  row: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }
}));
const VERDICT_TONE = { verified: "ok", unverified: "warn", contradicted: "bad", missing: "neutral" };
function SupplyChainChips({ provenance }) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  if (!provenance) return null;
  const slsa = findSlsa(provenance);
  const signedAndAttested = isSignedAndAttested(provenance);
  const rekor = provenance.attestations.find((a) => a.transparencyLog)?.transparencyLog;
  const logged = worstVerdict(provenance.attestations.filter((a) => a.transparencyLog));
  if (!slsa && provenance.attestations.length === 0) return null;
  const slsaVerdict = verdictOf(slsa);
  return /* @__PURE__ */ jsxs("div", { className: classes.row, children: [
    signedAndAttested && /* @__PURE__ */ jsx(StatusChip, { tone: "ok", children: "cosign verified" }),
    slsa && /* @__PURE__ */ jsxs(StatusChip, { tone: VERDICT_TONE[slsaVerdict], children: [
      "SLSA ",
      slsaVerdict === "verified" ? "provenance" : explain(slsa, "build provenance").label
    ] }),
    rekor && // Not a link: this platform runs its own internal Rekor
    // (rekor-server.rekor-system, see glidepathProvenance.ts), which has
    // no public-facing search UI. logIndex is only meaningful against
    // that internal log, so linking out to sigstore's public
    // search.sigstore.dev would either 404 or, worse, silently resolve
    // to an unrelated public entry that happens to share the index.
    /* @__PURE__ */ jsxs(StatusChip, { tone: logged === "verified" ? "ok" : "warn", children: [
      "Rekor entry #",
      rekor.logIndex
    ] })
  ] });
}

export { SupplyChainChips };
//# sourceMappingURL=SupplyChainChips.esm.js.map
