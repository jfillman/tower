import { breakglassDeepLink } from './breakglassDeepLink';

describe('breakglassDeepLink', () => {
  it('reads the environment and a well-formed session id', () => {
    expect(breakglassDeepLink(new URLSearchParams('entity=component:default/x&tab=topology&env=prod&breakglass=k3j9m2p7q1r5'))).toEqual({
      env: 'prod',
      sessionId: 'k3j9m2p7q1r5',
    });
  });

  it('ignores a malformed id, and gives nothing without the parameters', () => {
    expect(breakglassDeepLink(new URLSearchParams('env=prod&breakglass=<script>'))).toEqual({ env: 'prod' });
    expect(breakglassDeepLink(new URLSearchParams('env=prod&breakglass=TOO-SHORT'))).toEqual({ env: 'prod' });
    expect(breakglassDeepLink(new URLSearchParams(''))).toEqual({});
  });
});
