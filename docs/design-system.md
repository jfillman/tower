# Design system

The plugin's shared look lives in `src/ui/` and `src/brand/tokens.ts`. It is taken from the Environments
mockup (board F of the design canvas) and is what every tab should use. Before it existed each tab redeclared
its own title, chip, table header and button styles with slightly different numbers (page and section titles at
14.5, 15, 16 and 20px; primary buttons with three different text colours, one of them unreadable on amber).

## Rules

- **Tokens, never hex.** Colours come from `useHangarTokens()`. Text on a solid amber fill is `onAmber`; `amberInk`
  is for text on `amberSoft`, not on amber.
- **Amber has four tokens, one per job** (the "Refined" tuning, 2026-10-22). Dark mode uses the same amber for all of
  them; light mode splits them, because `#B9791F` reads mustard-brown as a fill and fails AA as text (3.6:1).

  | Token | Job | Light | Dark |
  |---|---|---|---|
  | `amberFill` (+ `amberFillHover`, `amberFillPress`) | A fill behind text: the primary button, a count badge. Text on it is `onAmber` | `#E2A03A` | `#E8A33D` |
  | `amber` | Strokes, dots, bars, underlines, and the 1px edge of an amber fill | `#B9791F` | `#E8A33D` |
  | `amberText` | Amber words on a panel: an eyebrow, the Flight chip, a slow time | `#7A5115` | `#E8A33D` |
  | `amberSoft` / `amberLine` / `amberInk` | The warn tint: background, border, text | unchanged | unchanged |

  Never `color: t.amber` on text, and never a fill of `t.amber` behind text. The primary button's hover and press are
  the fill's own steps (no brightness filter); a disabled primary goes grey, not translucent amber.
- **Fonts.** Condensed display (`fontDisplay`) for titles, names and sub-tabs; Plex Sans for body; Plex Mono for
  labels, values, paths and chips.
- **Type scale** (2026-10-22). Seven sizes, `fontScale` in `brand/tokens.ts`, nothing under 11px: **11** labels, chips,
  column heads · **12** meta, mono values, hints · **13** body, buttons, table cells · **15** section title · **18**
  card / dialog title · **22** stat value, page title · **32** Ops Wall KPIs. It replaced 28 sizes from 8 to 64px (139
  declarations under 11). `yarn ratchet` fails on any other text size; an icon's size is exempt.
- **Surfaces.** A `Panel` is a 1px `line` border, 6px radius, `panel` background. An accented panel (amber line)
  is for the pending-changes panel only.
- **Labels.** `SectionLabel` (mono, uppercase, 11px) names a block; `ColumnLabel` (10.5px) heads a column.
- **Sections.** A block inside a tab is a `Section`: title 15px condensed 700, an optional `meta` right after it
  (a repo chip), and a `count` and `actions` at the right. `framed` draws it as a panel whose head is a bar, for a
  list or table that fills the panel. `level={2}` (13px) is for a title inside a card. `SectionTitle` is the title
  alone, for a head with its own layout (an icon before it).
- **Notes.** `EmptyNote` (italic) says there is nothing to show; `Hint` (not italic) explains. Both 12.5px textLo;
  `inset` adds the panel padding when the note sits straight inside a framed Section. `Count` is the mono count
  beside a title or at the end of a filter bar ("3 open", "39 images").
- **Refresh** is an action: `RefreshButton` is a small kit `Button`. It answers a click (the icon turns, Refreshing…,
  then Refreshed) because the re-fetch itself is often invisible.
- **Facts.** A label over its value is a `Fact` (label = the ColumnLabel look, value 12.5px mono); several go in a
  `FactGrid`: one wrapping row, each fact as wide as its value, so a value wraps only when it is wider than the row
  (`min` gives equal columns, for short values where alignment matters). `Fact inline` puts label and value on one ruled row, as in
  an environment card.
- **Tables.** `useTableKit()` gives `table`, `th` (the ColumnLabel look), `td`, `rowLink` (a row that opens
  something) and `rowSelected`; add `dense` to the table inside a small panel (events, the ArgoCD resource tree).
- **Links, again.** No hand-rolled sky text: a link is `TextLink`; a show/hide is `TextLink expanded`; anything that
  changes something (Copy, Extend, End session, Restart pod) is a small `Button`; a switch between views (a pod's
  Logs / Metrics / YAML) is a `FilterChip`.
- **Cards and tiles.** A `Card` is a Panel with the kit padding and an optional head (`title`, `meta`, `actions`). A
  card is radius 6; an item inside a card (a pod, a resource, a fact box) is a `Tile`, radius 4. No other radii.
- **Callouts.** A banner is a `Callout` in a status tone: `info` blue (in motion), `warn` amber (needs someone, or may
  be stale), `bad` red (failed), `ok`, `neutral`; optional `label` (mono caps), `icon` and `actions`. Say a thing once:
  "Couldn't reach ArgoCD" is one amber callout in the ArgoCD card, and the troubleshoot banner stays out of it.
- **Headline numbers.** A `Stat`: label, a 22px condensed value (`tone` colours it), an optional caption.
- **Amber is attention, sky is motion** (2026-10-22). Anything moving on its own (a running pipeline or task, a
  progressing rollout, a canary, a pod starting, a live log or metric) is sky; amber is kept for what waits on a person
  or is out of step (paused, OutOfSync, pending sign-off, stale, slow). Only the tab bar's activity dot pulses; in-panel
  "live" dots are still. A count badge is grey (`panelAlt`) unless the count is "needs you" (break-glass). Focus rings
  and focused inputs are sky, so a ring stays visible around an amber button.
- **One amber primary, and only when it is the next step.** A primary that is not needed right now drops to a default
  button (the ArgoCD card's Sync is primary only while OutOfSync). Rarely used actions go in a `MenuButton` ("More ▾",
  src/ui/MenuButton.tsx): items carry a hint, `danger`, and a disabled reason in their tooltip.
- **Pull requests** (src/ui/PrRef.tsx). A PR on screen is a `PrRef`: `inline` (sky mono "PR #482 ↗" in a sentence),
  `chip` (square: state glyph, #482, checks dot, one word) or `card` (a row with the title and a meta line; `PrButton`
  is this). State glyphs ○ open, ◌ draft, ✓ merged, ✕ closed; the one word is what it waits on (`prWord`: checks
  failing, changes requested, checks running, ready to merge) or how it ended. Every action that opens a PR is labelled
  "Open <kind> PR", shows `OPENING_PR` ("Opening PR…") on the pressed button, and ends in a `PrReceipt` in place of
  its actions: "PR #57 opened" or "PR #55 was already open[ · updated]", the PR as a card, and "Next: …". Never a raw
  URL, never a second dialog over the first. Use "PR" in labels, "pull request" only in sentences.
- **Reasons you can see** (2026-10-22). Why a primary action is unavailable is an `ActionReason` under the action bar
  (lock icon, one sentence, what you can still do), with the disabled button's `aria-describedby` on it; never only a
  tooltip. Detail that blocks nothing (what a button does, a PR's failing checks) is the kit `Tooltip`: 300 ms on hover,
  immediate on keyboard focus, works on a disabled button, and attaches straight to a DOM element (no wrapper, no
  layout change). A native `title=` is only for a truncated value's full text (the title repeats what the element
  shows). The 2026-10-22 sweep moved 100 other native titles to the kit Tooltip.
- **Loading and errors in Hangar** (2026-10-22). A tab loading is a `TabSkeleton` (header, three tiles, a panel of
  rows); a panel inside a tab is a `PanelSkeleton`. The shimmer stops under `prefers-reduced-motion`. A tab or panel
  that could not load is a `TabError`: "Couldn't load <what>", the first line of the error, Retry where the tab has a
  refresh, the rest behind Details. Backstage's `Progress` and `ResponseErrorPanel` are not used.
- **Configure** (2026-10-22). Environments, shared values and `cicd.yaml` are one top-level tab with sub-tabs
  Environments / Shared values (base.yaml) / Pipeline (cicd.yaml). The sub-tab ids are the old tab ids
  (`environments`, `config`, `glidepath`), so `?tab=environments` and every other old link still lands in place.
  Tab labels are sentence case.
  A sub-tab, once opened, stays mounted (hidden), so changes staged in it survive switching away; every `PendingPanel`
  reports its line count to the nearest `StagedScope` (src/configure/stagedScope.tsx), Configure marks the sub-tabs
  holding staged changes and names them above the content. Each sub-tab still opens its own PR. **Find a setting**
  (src/configure) searches key paths and values across `cicd.yaml`, the shared values files and every environment's
  values file, read once on first use, and opens the sub-tab (and the environment's row, `?row=<env>`) that edits it.
- **Nothing waits in a dialog for a pipeline.** Promote to a Flight environment closes once the release run starts;
  `ReleaseRunTracker` at the top of the Releases tab follows the run (GET `/glidepath/release-run`) and becomes the
  PR's receipt.
- **Environment groups** are told apart by name and tier chip (Ground sky, Flight amber), never by an extra hue.
- **Four kinds of control, four looks.** Pick by what the control does, not by where it sits:

  | Kind | Does | Looks like | Kit |
  |---|---|---|---|
  | Action | Changes something (Sync, Promote, Re-run, Cancel, Open PR, Download) | A box: `Button`, one amber `primary` per view, `danger` for destructive, `small` inside a panel or row | `Button`, `IconButton`, `ActionSelect` |
  | Filter | Changes what this view shows, nothing else (History, Tier, Type, Status, View: Cards/List) | Separate pills with a label in front; the one that is on is amber. Search is a field in the same row | `FilterChips` (one on), `FilterChip` in a `FilterGroup` (several on), `FilterSelect` (too many values for pills), `SearchField` |
  | Link | Goes somewhere (another tab, GitHub, the registry) or shows/hides a detail | Sky mono text, no box: `→` for another tab, `↗` for another site, `▸`/`▾` for show/hide | `TextLink` (`href` for external, `expanded` for show/hide) |
  | Status | Says what state something is in (Healthy, promoted, failed, running) | Rounded, a soft tint of the state's colour, optional dot; clickable only when it opens what it describes | `StatusChip` (tone `ok`, `warn`, `bad`, `info`, `neutral`), `StatusDot` in tables |
  | YAML | Shows a file or a resource as it is (a PipelineRun, a Rollout, cicd.yaml, a values file, merged chart values) | Mono on the base background in a soft-line box: keys sky, numbers and booleans amber, comments faint, a line-number gutter, Copy at the top right, a line filter when long. Never a bare `<pre>` | `YamlBlock` (`title`, `filter`, `maxHeight`, `lineNumbers`); `CopyButton` where a view keeps its own header |

  A label (Ground, Flight, Container app, a repo name) is the square `Chip`: square means "what it is", rounded means
  "what state it is in". Status tones: `ok` done or healthy; `info` (blue) in motion or live, such as progressing,
  spun up, not yet promoted; `warn` (amber) waiting on someone or out of step, such as paused, pending, OutOfSync;
  `bad` failed; `neutral` unknown or none. Health uses `healthTone`, ArgoCD's words use `argoTone` (src/argoTone.ts).
  The release slug (the hue-coloured nickname chip, `flow: <slug>`) is not a status and keeps its own look.

  The ArgoCD Refresh/Sync buttons are actions; the Pipelines History pills are a filter. They used to look alike;
  they must not.
- **Filter bars.** `FilterBar` holds a list's filters: filters and search first, in reading order, at the left; a result
  count, a hint or a view switch (`end`) at the right. A page's actions (Refresh, Add environment) stay in the
  `PageHeader`, not in the filter bar.
- Kit controls already prevent the focus-scroll jump in the nested-scroll layout. Their styles live in their own hook
  (`useControls`): makeStyles with function values builds every rule per hook call, so adding rarely used controls to
  the shared sheet made every Button and Chip pay for them (a 71-test file ran out of memory).
- **Chips.** `TierChip` for Ground (sky) and Flight (amber); `Chip tone="ok" | "bad"` for staged state.
- **Sub-tabs** (`Subtabs`) split a page or a long form into sections.
- **Fields.** `Field` = label, optional source tag ("set here" / "app-level"), then the input.

## Kit

`PageHeader`, `Panel`, `Section`, `MenuButton`, `PrRef`, `PrReceipt`, `Tooltip`, `ActionReason`, `TabSkeleton`, `PanelSkeleton`, `Skeleton`, `TabError`, `SectionTitle`, `EmptyNote`, `Hint`, `Count`, `Fact`, `FactGrid`, `useTableKit`, `Card`, `Tile`, `Callout`, `Stat`, `SectionLabel`, `ColumnLabel`, `Button`, `IconButton`, `ActionSelect`, `Chip`, `TierChip`,
`FilterBar`, `FilterChips`, `FilterChip`, `FilterGroup`, `FilterSelect`, `SearchField`, `TextLink`, `Subtabs`, `StatusDot`, `Field`, `PendingPanel` (`src/ui/PendingPanel.tsx`), `healthColor`, `HEALTH_LABEL` (`src/ui/index.tsx`); the class set is in
`src/ui/styles.ts`.

## Migration status

**Page frame: done on every tab.** Each tab opens with the kit's `PageHeader` (title, one line saying what the tab
shows, its actions such as Refresh on the right) and starts at the tab bar's left edge, with no padding of its own
(Environments, Glidepath and the cloud Deployments tab used to add 24px). The Releases tab's views use `Subtabs`.

**Controls: done everywhere** (2026-10-09). Every filter, search, action button and link in Tower uses the kit:
Services, Pipelines and its run list, Environments, Images, Release log, Deployments (ArgoCD actions, stage detail),
Release matrix and records, Topology, Overview's Recent activity, pod logs, the dialogs and the Ops Wall. Status chips
too (2026-10-09): every state display is a `StatusChip`.

**Inside the tabs: done** (2026-10-11, tower#80, #81, #83). Section titles, notes, label/value facts, tables, cards,
tiles, banners and headline numbers use the kit on every tab. Local styles that redo a kit piece went from 328 to
119; what is left is bespoke on purpose (the Pipeline and Rollout DAGs, the Release matrix grid, EnvPicker, the
Canary ramp chart, the Topology flow strip, the Ops Wall layout, the break-glass session strip, the App
Configuration form) or layout.

**The ratchet.** `yarn ratchet` (scripts/style-ratchet.mjs, run in CI) counts those local styles per kind and fails if
any count goes up; when one goes down, run `node scripts/style-ratchet.mjs --update` and commit the baseline
(scripts/style-ratchet.json). It also fails on a `classes.x` whose sheet has no `x`: such an element renders with no
style and tsc does not see it, because the class map is loosely typed. That happens most when a style is removed from
a sheet another file borrows (the break-glass views share `useBreakglassStyles`, the Rollout DAG borrows the Pipeline
DAG's).

To check a change by eye, run the backstage app locally (`yarn start` with guest sign-in) and copy this package's
built `dist/` into its `node_modules/@jfillman/tower/dist`; the dev server needs a restart to pick it up.
