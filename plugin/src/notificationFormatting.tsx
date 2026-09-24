import type { ReactNode } from 'react';
import { imageTag } from './types';

// Extracted out of NotificationsTab.tsx (2026-09-13) so the new
// RecentActivityPanel can render the exact same Image:/Repo:/PR:/Commit:
// in-app links instead of forking a second regex-matching copy that could
// drift from this one. Every notification's description is a plain
// multi-line string built from fixed "Label: value" lines (see
// glidepathPromote.ts's sendReleaseNotification and glidepath-catalog's
// notify-backstage.yaml - both construct the exact same shapes) - there's no
// structured field to carry a real link, so this pattern-matches those known
// label prefixes at render time (2026-09-12: "any image should take you to
// the image in the Images tab, a PR should link you to the actual PR, any
// repo should link you to the repo/commit"). Takes a plain class name for
// the inline-link style rather than a caller's whole `classes` object, since
// callers (NotificationsTab, RecentActivityPanel) each have their own
// makeStyles instance with their own sizing for this element.
//
// 2026-09-14 release-flow redesign: added Chain:/Environment: field parsing
// alongside the existing Image:/Repo:/PR:/Commit: ones - RecentActivityPanel's
// pill-chain rendering for release/deploying/release-outcome topics and its
// chain-id-based grouping both read these same description lines rather than
// requiring a second, differently-shaped payload from the backend. Chain: is
// never meant to be read as prose (a bare correlation id, not a fact about the
// release) - renderNotificationDescription strips it from every rendered
// description, here and in the flat NotificationsTab, which imports this same
// function.
export function extractChainId(description: string): string | undefined {
  return description.match(/^Chain: (.+)$/m)?.[1];
}

export function extractEnvironment(description: string): string | undefined {
  return description.match(/^Environment: (.+)$/m)?.[1];
}

export function extractRepoCommit(
  description: string,
): { repoShort: string; sha: string } | undefined {
  const m = description.match(/^Repo: (\S+) @ (\S+)$/m);
  return m ? { repoShort: m[1], sha: m[2] } : undefined;
}

export function extractPrUrl(description: string): string | undefined {
  return description.match(/^PR: (\S+)$/m)?.[1];
}

export function renderNotificationDescription(
  description: string,
  goToImage: (tag: string) => void,
  inlineLinkClassName: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  description
    .split('\n')
    .filter(line => !line.match(/^Chain: /))
    .forEach((line, i) => {
      if (i > 0) nodes.push('\n');

      const imageMatch = line.match(/^Image: (.+)$/);
      const repoMatch = line.match(/^Repo: (\S+) @ (\S+)$/);
      const prMatch = line.match(/^PR: (\S+)$/);
      const commitMatch = line.match(/^Commit: (\S+)$/);

      if (imageMatch) {
        const ref = imageMatch[1];
        nodes.push(
          <span key={i}>
            Image:{' '}
            <button
              type="button"
              className={inlineLinkClassName}
              onClick={() => goToImage(imageTag(ref))}
            >
              {ref}
            </button>
          </span>,
        );
      } else if (repoMatch) {
        const [, repoShort, sha] = repoMatch;
        nodes.push(
          <span key={i}>
            Repo:{' '}
            <a
              className={inlineLinkClassName}
              href={`https://github.com/${repoShort}/commit/${sha}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {repoShort} @ {sha}
            </a>
          </span>,
        );
      } else if (prMatch) {
        nodes.push(
          <span key={i}>
            PR:{' '}
            <a
              className={inlineLinkClassName}
              href={prMatch[1]}
              target="_blank"
              rel="noopener noreferrer"
            >
              {prMatch[1]}
            </a>
          </span>,
        );
      } else if (commitMatch) {
        nodes.push(
          <span key={i}>
            Commit:{' '}
            <a
              className={inlineLinkClassName}
              href={commitMatch[1]}
              target="_blank"
              rel="noopener noreferrer"
            >
              {commitMatch[1]}
            </a>
          </span>,
        );
      } else {
        nodes.push(line);
      }
    });
  return nodes;
}
