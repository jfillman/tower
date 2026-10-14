import { chainIdToSlug } from './chainSlug';

// The same vectors as glidepath's hack/ci/chain_slug_test.sh: the two copies of the
// word lists must map every chain-id to the same slug.
describe('chainIdToSlug', () => {
  it.each([
    ['00000000-0000-4000-8000-000000000000', 'able-heron'],
    ['ffff0000-0000-4000-8000-000000000000', 'cheeky-smelt'],
    ['c429209a-1111-4111-8111-111111111111', 'still-pipit'],
    ['0d563bd5-2222-4222-8222-222222222222', 'balmy-moose'],
    ['7f80abcd-3333-4333-8333-333333333333', 'lucky-jackal'],
  ])('%s -> %s', (chainId, slug) => {
    expect(chainIdToSlug(chainId)).toBe(slug);
  });

  it('gives every first-two-byte value its own slug', () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 65536; i += 1) {
      slugs.add(chainIdToSlug(i.toString(16).padStart(4, '0'))!);
    }
    expect(slugs.size).toBe(65536);
  });

  it('returns undefined for a chain-id that is not hex', () => {
    expect(chainIdToSlug('zz12')).toBeUndefined();
  });
});
