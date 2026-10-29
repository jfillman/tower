import { PROMOTION } from './supplyChain';
import { flightPromotionOf } from './useReleaseRecords';

describe('flightPromotionOf (the live Promoted to Flight fact)', () => {
  it('carries the signer and its public Rekor entry with the predicate', () => {
    const p = flightPromotionOf({
      digest: 'sha256:x',
      attestations: [
        {
          predicateType: PROMOTION,
          predicate: { promotedAt: '2026-10-29T02:27:41Z', pullRequest: 'jfillman/gitops-gate-api#57@2bfd807' },
          certificate: { subject: '', issuer: 'GitHub', identity: 'https://github.com/riley-roooo/flight-promoter/.github/workflows/promote.yaml@refs/heads/main', validFrom: '', validTo: '' },
          transparencyLog: { logIndex: 3555857046 },
          verified: true,
        },
      ],
    });
    expect(p).toMatchObject({
      promotedAt: '2026-10-29T02:27:41Z',
      pullRequest: 'jfillman/gitops-gate-api#57@2bfd807',
      signer: 'https://github.com/riley-roooo/flight-promoter/.github/workflows/promote.yaml@refs/heads/main',
      logIndex: 3555857046,
      verified: true,
    });
  });

  it('is undefined for an image that was never promoted', () => {
    expect(flightPromotionOf({ digest: 'sha256:x', attestations: [] })).toBeUndefined();
  });
});
