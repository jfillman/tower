import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IdentityApi } from '@backstage/core-plugin-api';
import { HangarSignInPage, githubSignInProvider, signInError } from './HangarSignInPage';

const STORAGE_KEY = '@backstage/core:SignInPage:provider';
const identity = { type: 'user' as const, userEntityRef: 'user:default/ada', ownershipEntityRefs: ['user:default/ada'] };

const mockAuth = {
  getBackstageIdentity: jest.fn(),
  getProfile: jest.fn(async () => ({ email: 'ada@example.com', displayName: 'Ada' })),
  signOut: jest.fn(async () => {}),
  sessionState$: jest.fn(),
};
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApiHolder: () => ({ get: () => mockAuth }),
  useAnalytics: () => ({ captureEvent: () => {} }),
}));
jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  ProxiedSignInPage: ({ provider }: { provider: string }) => <span>proxied:{provider}</span>,
}));

const renderPage = (guest = false) => {
  const onSignInSuccess = jest.fn<void, [IdentityApi]>();
  render(<HangarSignInPage onSignInSuccess={onSignInSuccess} providers={[githubSignInProvider]} guest={guest} />);
  return onSignInSuccess;
};

describe('HangarSignInPage', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('signs in with GitHub through the popup and remembers the provider', async () => {
    mockAuth.getBackstageIdentity.mockResolvedValue({ id: 'ada', token: 't', identity });
    const onSignInSuccess = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Continue with GitHub/ }));
    await waitFor(() => expect(onSignInSuccess).toHaveBeenCalledTimes(1));
    expect(mockAuth.getBackstageIdentity).toHaveBeenCalledWith({ instantPopup: true });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('github-auth-provider');

    const signedIn = onSignInSuccess.mock.calls[0][0];
    expect((await signedIn.getBackstageIdentity()).userEntityRef).toBe('user:default/ada');
    await signedIn.signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores a remembered session without a click', async () => {
    localStorage.setItem(STORAGE_KEY, 'github-auth-provider');
    mockAuth.getBackstageIdentity.mockResolvedValue({ id: 'ada', token: 't', identity });
    const onSignInSuccess = renderPage();
    await waitFor(() => expect(onSignInSuccess).toHaveBeenCalledTimes(1));
    expect(mockAuth.getBackstageIdentity).toHaveBeenCalledWith({ optional: true });
  });

  it('shows the buttons when the remembered session has expired', async () => {
    localStorage.setItem(STORAGE_KEY, 'github-auth-provider');
    mockAuth.getBackstageIdentity.mockResolvedValue(undefined);
    const onSignInSuccess = renderPage();
    expect(await screen.findByRole('button', { name: /Continue with GitHub/ })).toBeTruthy();
    expect(onSignInSuccess).not.toHaveBeenCalled();
  });

  it('says nothing when the popup is closed, and reports a real failure', async () => {
    const closed = Object.assign(new Error('Login failed, popup was closed'), { name: 'PopupClosedError' });
    mockAuth.getBackstageIdentity.mockRejectedValueOnce(closed).mockRejectedValueOnce(new Error('bad client secret'));
    renderPage();
    const button = await screen.findByRole('button', { name: /Continue with GitHub/ });

    await act(async () => fireEvent.click(button));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Continue with GitHub/ })));
    expect(screen.getByRole('alert').textContent).toContain('bad client secret');
  });

  it('explains a blocked popup and keeps a wrong-origin failure', () => {
    const blocked = Object.assign(new Error('Failed to open auth popup.'), { name: 'PopupRejectedError' });
    expect(signInError(blocked)?.message).toMatch(/blocked the sign-in window/);
    const origin = Object.assign(new Error('Login failed, Incorrect app origin, expected http://a'), { name: 'PopupClosedError' });
    expect(signInError(origin)).toBe(origin);
  });

  it('offers guest only when asked, through the proxied guest identity', async () => {
    renderPage(false);
    await screen.findByRole('button', { name: /Continue with GitHub/ });
    expect(screen.queryByRole('button', { name: /guest/ })).toBeNull();
  });

  it('hands guest sign-in to ProxiedSignInPage', async () => {
    renderPage(true);
    fireEvent.click(await screen.findByRole('button', { name: /Continue as guest/ }));
    expect(screen.getByText('proxied:guest')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('guest');
  });
});
