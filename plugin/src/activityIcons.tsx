// Small line-icon set for RecentActivityPanel's per-category icon badges -
// ported directly from the "Story cards" mockup (Recent Activity Concepts
// artifact, concept 5) rather than reaching for @material-ui/icons, since
// the user specifically picked that mockup's icon vocabulary (2026-09-14
// feedback: "i loved the visual look of the story cards... lots of icons").
// Deliberately monochrome (stroke="currentColor") so each icon just inherits
// whatever severity/topic color its badge is given, same convention as the
// rest of Tower's status dots/pills.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function ImageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <path
        d="M9 2 16 5.5 16 12.5 9 16 2 12.5 2 5.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M2 5.5 9 9 16 5.5M9 9v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReleaseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <path
        d="M9 14V4M4.5 8.5 9 4l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 16h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PreviewIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <circle
        cx="5"
        cy="4"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="5"
        cy="14"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="14"
        cy="9"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 6v6M5 9c0-1.8 1.8-2.7 3.6-2.7H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function EnvIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <rect
        x="2.5"
        y="3"
        width="13"
        height="5"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="2.5"
        y="10"
        width="13"
        height="5"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ConfigIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <path
        d="M3 5.5h12M3 9h12M3 12.5h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="7" cy="5.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="9" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12.5" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CommitIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <circle
        cx="9"
        cy="9"
        r="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M2 9h4M12 9h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PipelineIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <circle cx="3" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <path
        d="M4.6 9h2.8M10.6 9h2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <path
        d="M14.5 9A5.5 5.5 0 0 1 4.6 12.1M3.5 9A5.5 5.5 0 0 1 13.4 5.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14.5 5.5v3.5H11M3.5 12.5V9h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SloIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" {...props}>
      <path
        d="M2 9.5h3l1.7-5 2.6 9 1.7-6.5 1.2 2.5h3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
