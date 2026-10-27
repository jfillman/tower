import { imageTag, splitImageRef } from './types';

const D = 'sha256:53de992b7d3b3f5965a10695b5b04a02cc0558807c0ad3a8f1c10971c3bd762d';

describe('imageTag', () => {
  it('returns the tag of repo:tag', () => {
    expect(imageTag('ghcr.io/o/app:2.0.5-832e475')).toBe('2.0.5-832e475');
  });
  it('keeps the tag when the release is pinned by digest (repo:tag@digest)', () => {
    expect(imageTag(`ghcr.io/o/app:2.0.5-832e475@${D}`)).toBe('2.0.5-832e475');
  });
  it('shows the short digest for a bare repo@digest', () => {
    expect(imageTag(`ghcr.io/o/app@${D}`)).toBe('sha256:53de992b7d3b…');
  });
  it('does not mistake a registry port for a tag', () => {
    expect(imageTag('registry:5000/app')).toBe('registry:5000/app');
  });
});

describe('splitImageRef', () => {
  it('splits repo:tag', () => {
    expect(splitImageRef('ghcr.io/o/app:1.0.0-abc')).toEqual({ repo: 'ghcr.io/o/app', tag: '1.0.0-abc' });
  });
  it('drops a digest pin', () => {
    expect(splitImageRef(`ghcr.io/o/app:1.0.0-abc@${D}`)).toEqual({ repo: 'ghcr.io/o/app', tag: '1.0.0-abc' });
  });
  it('has no tag for a bare digest', () => {
    expect(splitImageRef(`ghcr.io/o/app@${D}`)).toBeUndefined();
  });
});
