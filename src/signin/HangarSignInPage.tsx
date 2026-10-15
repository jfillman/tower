import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import GitHubIcon from '@material-ui/icons/GitHub';
import {
  githubAuthApiRef,
  useAnalytics,
  useApiHolder,
  type ApiRef,
  type BackstageIdentityApi,
  type IdentityApi,
  type ProfileInfoApi,
  type SessionApi,
  type SignInPageProps,
} from '@backstage/core-plugin-api';
import { ProxiedSignInPage, UserIdentity } from '@backstage/core-components';
import { HangarMark, type HangarGlyph } from '../brand/HangarMark';
import { fontBody, fontDisplay, fontMono, useHangarTokens, type HangarTokens } from '../brand/tokens';
import { Callout, Panel, SectionLabel } from '../ui';

// Hangar's sign-in page: the first screen anyone sees. Replaces the stock SignInPage (a Backstage header bar over
// a grid of provider cards) with the brand: the dial mark, the product family, and a single sign-in box.
//
// The stock page's provider plumbing (commonProvider, guestProvider, IdentityApiSignOutProxy) isn't exported, so
// this redoes the OAuth flow it uses, which is small: getBackstageIdentity({ instantPopup }) + getProfile() ->
// UserIdentity.create. Guest goes through the exported ProxiedSignInPage with provider "guest", which is the same
// ProxiedSignInIdentity the stock guest card builds. The legacy (backend-less) guest token isn't offered.
//
// The remembered provider uses the stock page's own localStorage key and the stock GitHub id, so a session started
// on the stock page restores here without signing in again (and the other way round).
const PROVIDER_STORAGE_KEY = '@backstage/core:SignInPage:provider';
const GUEST_ID = 'guest';

/** An OAuth provider the page offers. `id` is what's remembered between visits; keep it stable. */
export interface HangarSignInProvider {
  id: string;
  title: string;
  /** One line under the button, e.g. which accounts are allowed. */
  message?: string;
  apiRef: ApiRef<ProfileInfoApi & BackstageIdentityApi & SessionApi>;
  icon?: ReactNode;
}

export interface HangarSignInOptions {
  providers: HangarSignInProvider[];
  /** Offer "Continue as guest". Needs the backend guest provider; meant for local development only. */
  guest?: boolean;
  /** Replaces the default line under the wordmark. */
  tagline?: ReactNode;
}

export const githubSignInProvider: HangarSignInProvider = {
  id: 'github-auth-provider',
  title: 'GitHub',
  apiRef: githubAuthApiRef,
  icon: <GitHubIcon fontSize="small" />,
};

const DEFAULT_TAGLINE = 'The internal developer platform. Scaffold a service, ship it through a guarded pipeline, run it on any cluster.';

const PRODUCTS: Array<{ glyph: HangarGlyph; name: string; role: string }> = [
  { glyph: 'tower', name: 'Tower', role: 'Release command center' },
  { glyph: 'glidepath', name: 'Glidepath', role: 'Build, scan, sign, promote' },
  { glyph: 'airframe', name: 'Airframe', role: 'The service catalog' },
  { glyph: 'apron', name: 'Apron', role: 'Cluster ground infrastructure' },
  { glyph: 'autopilot', name: 'Autopilot', role: 'Agent workloads, bounded and audited' },
];

function readStored(): string | null {
  try {
    return window.localStorage.getItem(PROVIDER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id === null) window.localStorage.removeItem(PROVIDER_STORAGE_KEY);
    else window.localStorage.setItem(PROVIDER_STORAGE_KEY, id);
  } catch {
    // Storage blocked: sign-in still works, it just isn't remembered.
  }
}

/**
 * What to show for a failed popup sign-in (core-app-api's loginPopup names the errors). Closing the popup is a choice,
 * so it shows nothing; a blocked popup says how to fix it. A wrong app origin is also a PopupClosedError, and is shown.
 */
export function signInError(e: Error): Error | undefined {
  if (e.name === 'PopupClosedError' && e.message.endsWith('popup was closed')) return undefined;
  if (e.name === 'PopupRejectedError') return new Error('The browser blocked the sign-in window. Allow pop-ups for this site and try again.');
  return e;
}

/** Signing out forgets the provider, so the next visit lands on this page instead of restoring silently. */
function withSignOut(identity: IdentityApi): IdentityApi {
  return {
    getProfileInfo: () => identity.getProfileInfo(),
    getBackstageIdentity: () => identity.getBackstageIdentity(),
    getCredentials: () => identity.getCredentials(),
    signOut: async () => {
      writeStored(null);
      await identity.signOut();
    },
  };
}

// Narrow = below MUI's md breakpoint (960px): one column, the box under the brand.
const NARROW = '@media (max-width: 959.95px)';

const useStyles = makeStyles<Theme, { t: HangarTokens }>(() => ({
  root: {
    position: 'relative',
    minHeight: '100vh',
    overflow: 'hidden',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.15fr) minmax(360px, 0.85fr)',
    alignItems: 'center',
    gap: 48,
    padding: '48px clamp(24px, 6vw, 96px)',
    boxSizing: 'border-box',
    backgroundColor: ({ t }) => t.bg,
    color: ({ t }) => t.textHi,
    fontFamily: fontBody,
    [NARROW]: {
      gridTemplateColumns: 'minmax(0, 1fr)',
      alignItems: 'start',
      alignContent: 'start',
      gap: 32,
      padding: '32px 16px',
    },
  },
  // The sign-in box sits at the centre of a faint instrument face, like the glyph in the mark.
  boxWrap: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 'min(88vh, 760px)',
    [NARROW]: { minHeight: 0 },
  },
  dial: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 'min(88vh, 760px)',
    height: 'min(88vh, 760px)',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    [NARROW]: { display: 'none' },
  },
  hero: { position: 'relative', maxWidth: 620 },
  brand: { display: 'flex', alignItems: 'center', gap: 20, margin: '12px 0 20px' },
  wordmark: {
    fontFamily: fontDisplay,
    fontWeight: 700,
    fontSize: 64,
    lineHeight: 1,
    letterSpacing: '-0.01em',
    [NARROW]: { fontSize: 44 },
  },
  tagline: {
    margin: 0,
    fontSize: 17,
    lineHeight: 1.55,
    color: ({ t }) => t.textLo,
    maxWidth: 520,
  },
  products: {
    listStyle: 'none',
    margin: '40px 0 0',
    padding: '20px 0 0',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px 24px',
    borderTop: ({ t }) => `1px solid ${t.line}`,
    [NARROW]: { display: 'none' },
  },
  product: { display: 'flex', alignItems: 'center', gap: 12 },
  productName: { display: 'block', fontFamily: fontDisplay, fontWeight: 600, fontSize: 15 },
  productRole: { display: 'block', fontSize: 12.5, color: ({ t }) => t.textLo },
  box: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    justifySelf: 'center',
    padding: 32,
    boxSizing: 'border-box',
    [NARROW]: { padding: 24, maxWidth: 'none' },
  },
  boxHeading: { margin: '6px 0 6px', fontFamily: fontDisplay, fontWeight: 700, fontSize: 24 },
  boxLead: { margin: '0 0 24px', fontSize: 13.5, color: ({ t }) => t.textLo },
  actions: { display: 'flex', flexDirection: 'column', gap: 12 },
  provider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    height: 44,
    borderRadius: 6,
    border: ({ t }) => `1px solid ${t.line}`,
    backgroundColor: ({ t }) => t.bgRaised,
    color: ({ t }) => t.textHi,
    fontFamily: fontBody,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    '&:hover:not(:disabled)': { borderColor: ({ t }) => t.textFaint },
    '&:focus-visible': { outline: ({ t }) => `2px solid ${t.textLo}`, outlineOffset: 2 },
    '&:disabled': { cursor: 'default', opacity: 0.6 },
  },
  providerPrimary: {
    borderColor: ({ t }) => t.amber,
    backgroundColor: ({ t }) => t.amber,
    color: ({ t }) => t.onAmber,
    '&:hover:not(:disabled)': { borderColor: ({ t }) => t.amberInk },
  },
  providerMessage: { margin: '-4px 0 0', fontSize: 12, color: ({ t }) => t.textLo, textAlign: 'center' },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '4px 0',
    fontFamily: fontMono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: ({ t }) => t.textFaint,
    '&::before, &::after': { content: '""', flex: 1, borderTop: ({ t }) => `1px solid ${t.lineSoft}` },
  },
  devTag: {
    fontFamily: fontMono,
    fontSize: 10.5,
    padding: '1px 6px',
    borderRadius: 4,
    color: ({ t }) => t.textLo,
    border: ({ t }) => `1px solid ${t.line}`,
  },
  status: { minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 },
  statusText: { fontFamily: fontMono, fontSize: 12, color: ({ t }) => t.textLo },
  errorSpace: { marginBottom: 20 },
  foot: {
    margin: '28px 0 0',
    paddingTop: 16,
    borderTop: ({ t }) => `1px solid ${t.lineSoft}`,
    fontFamily: fontMono,
    fontSize: 11,
    color: ({ t }) => t.textFaint,
  },
}));

/** The dial from the mark, drawn as a faint instrument face behind the page. Decorative only. */
function DialFace({ className, t }: { className: string; t: HangarTokens }) {
  const minor = Array.from({ length: 72 }, (_, i) => i * 5).filter(a => a % 45 !== 0);
  return (
    <svg className={className} viewBox="0 0 96 96" aria-hidden focusable="false">
      <circle cx="48" cy="48" r="40" fill="none" stroke={t.line} strokeWidth={0.25} />
      <circle cx="48" cy="48" r="31" fill="none" stroke={t.lineSoft} strokeWidth={0.2} />
      <g stroke={t.lineSoft} strokeWidth={0.2}>
        {minor.map(a => (
          <line key={a} x1="48" y1="8" x2="48" y2={a % 15 === 0 ? 11 : 10} transform={`rotate(${a} 48 48)`} />
        ))}
      </g>
      <g stroke={t.line} strokeWidth={0.45}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <line key={a} x1="48" y1="8" x2="48" y2="14" transform={`rotate(${a} 48 48)`} />
        ))}
      </g>
      <polygon points="46.5,5 49.5,5 48,7.6" fill={t.amber} opacity={0.6} />
    </svg>
  );
}

export function HangarSignInPage({ onSignInSuccess, providers, guest = false, tagline = DEFAULT_TAGLINE }: SignInPageProps & HangarSignInOptions) {
  const t = useHangarTokens();
  const classes = useStyles({ t });
  const apis = useApiHolder();
  const analytics = useAnalytics();
  const [phase, setPhase] = useState<'restoring' | 'ready' | 'guest'>('restoring');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<Error>();
  const done = useRef(false);

  const finish = (identity: IdentityApi) => {
    if (done.current) return;
    done.current = true;
    onSignInSuccess(withSignOut(identity));
    analytics.captureEvent('signIn', 'success');
  };

  const authApi = (p: HangarSignInProvider) => {
    const api = apis.get(p.apiRef);
    if (!api) throw new Error(`No API registered for ${p.title} (${p.apiRef.id})`);
    return api;
  };

  const complete = async (p: HangarSignInProvider, instantPopup: boolean) => {
    const api = authApi(p);
    const response = await api.getBackstageIdentity(instantPopup ? { instantPopup: true } : { optional: true });
    if (!response) return false;
    const profile = await api.getProfile();
    finish(UserIdentity.create({ identity: response.identity, profile, authApi: api }));
    return true;
  };

  // A provider remembered from the last visit signs in silently, as on the stock page.
  useEffect(() => {
    const failed = new URLSearchParams(window.location.search).get('error');
    if (failed) setError(new Error(failed));
    const stored = readStored();
    const remembered = providers.find(p => p.id === stored);
    if (stored === GUEST_ID && guest) {
      setPhase('guest');
      return undefined;
    }
    if (!remembered) {
      setPhase('ready');
      return undefined;
    }
    let cancelled = false;
    complete(remembered, false)
      .then(ok => {
        if (!ok && !cancelled) setPhase('ready');
      })
      .catch(() => {
        writeStored(null);
        if (!cancelled) setPhase('ready');
      });
    return () => {
      cancelled = true;
    };
    // Mount only: providers come from the module options and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (p: HangarSignInProvider) => {
    setBusy(p.id);
    setError(undefined);
    writeStored(p.id);
    try {
      if (!(await complete(p, true))) throw new Error(`The ${p.title} provider is not configured to support sign-in`);
    } catch (e) {
      writeStored(null);
      setBusy(undefined);
      setError(signInError(e as Error));
    }
  };

  const signInAsGuest = () => {
    setError(undefined);
    writeStored(GUEST_ID);
    setPhase('guest');
  };

  // Created once (the setters are stable) so ProxiedSignInPage doesn't see a new component type on every render.
  const [GuestFailed] = useState(() =>
    function GuestFailed({ error: guestError }: { error?: Error }) {
      useEffect(() => {
        writeStored(null);
        setError(new Error(`Guest sign-in failed: ${guestError?.message ?? 'no response from the auth backend'}`));
        setPhase('ready');
      }, [guestError]);
      return null;
    },
  );

  let body: ReactNode;
  if (phase === 'restoring') {
    body = (
      <div className={classes.status}>
        <span className={classes.statusText}>Checking for a session…</span>
      </div>
    );
  } else if (phase === 'guest') {
    body = (
      <div className={classes.status}>
        <span className={classes.statusText}>Signing in as guest…</span>
        <ProxiedSignInPage provider={GUEST_ID} onSignInSuccess={finish} ErrorComponent={GuestFailed} />
      </div>
    );
  } else {
    body = (
      <div className={classes.actions}>
        {providers.map((p, i) => (
          <div key={p.id} className={classes.actions}>
            <button
              type="button"
              className={`${classes.provider} ${i === 0 ? classes.providerPrimary : ''}`}
              disabled={busy !== undefined}
              onClick={() => signIn(p)}
            >
              {p.icon}
              {busy === p.id ? `Waiting for ${p.title}…` : `Continue with ${p.title}`}
            </button>
            {p.message && <p className={classes.providerMessage}>{p.message}</p>}
          </div>
        ))}
        {guest && (
          <>
            {providers.length > 0 && <span className={classes.divider}>or</span>}
            <button type="button" className={classes.provider} disabled={busy !== undefined} onClick={signInAsGuest}>
              Continue as guest <span className={classes.devTag}>dev</span>
            </button>
          </>
        )}
        {providers.length === 0 && !guest && (
          <Callout tone="warn" title="No sign-in method is configured">
            Pass at least one provider to createHangarSignInModule.
          </Callout>
        )}
      </div>
    );
  }

  return (
    <main className={classes.root}>
      <section className={classes.hero} aria-label="Hangar">
        <SectionLabel>Hangar platform</SectionLabel>
        <div className={classes.brand}>
          <HangarMark glyph="hangar" size={88} />
          <span className={classes.wordmark}>Hangar</span>
        </div>
        <p className={classes.tagline}>{tagline}</p>
        <ul className={classes.products}>
          {PRODUCTS.map(p => (
            <li key={p.name} className={classes.product}>
              <HangarMark glyph={p.glyph} size={36} />
              <span>
                <span className={classes.productName}>{p.name}</span>
                <span className={classes.productRole}>{p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className={classes.boxWrap}>
        <DialFace className={classes.dial} t={t} />
        <Panel className={classes.box}>
          <SectionLabel>Sign in</SectionLabel>
          <h1 className={classes.boxHeading}>Welcome to Hangar</h1>
          <p className={classes.boxLead}>Sign in with your organization account to continue.</p>
          {error && (
            <div className={classes.errorSpace}>
              <Callout tone="bad" title="Sign-in failed">
                {error.message}
              </Callout>
            </div>
          )}
          {body}
          <p className={classes.foot}>Tower · Backstage</p>
        </Panel>
      </div>
    </main>
  );
}
