# Design system

The plugin's shared look lives in `src/ui/` and `src/brand/tokens.ts`. It is taken from the Environments
mockup (board F of the design canvas) and is what every tab should use. Before it existed each tab redeclared
its own title, chip, table header and button styles with slightly different numbers (page and section titles at
14.5, 15, 16 and 20px; primary buttons with three different text colours, one of them unreadable on amber).

## Rules

- **Tokens, never hex.** Colours come from `useHangarTokens()`. Text on a solid amber fill is `onAmber`; `amberInk`
  is for text on `amberSoft`, not on amber.
- **Fonts.** Condensed display (`fontDisplay`) for titles, names and sub-tabs; Plex Sans for body; Plex Mono for
  labels, values, paths and chips.
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
- **Environment groups** are told apart by name and tier chip (Ground sky, Flight amber), never by an extra hue.
- **Four kinds of control, four looks.** Pick by what the control does, not by where it sits:

  | Kind | Does | Looks like | Kit |
  |---|---|---|---|
  | Action | Changes something (Sync, Promote, Re-run, Cancel, Open PR, Download) | A box: `Button`, one amber `primary` per view, `danger` for destructive, `small` inside a panel or row | `Button`, `IconButton`, `ActionSelect` |
  | Filter | Changes what this view shows, nothing else (History, Tier, Type, Status, View: Cards/List) | Separate pills with a label in front; the one that is on is amber. Search is a field in the same row | `FilterChips` (one on), `FilterChip` in a `FilterGroup` (several on), `FilterSelect` (too many values for pills), `SearchField` |
  | Link | Goes somewhere (another tab, GitHub, the registry) or shows/hides a detail | Sky mono text, no box: `→` for another tab, `↗` for another site, `▸`/`▾` for show/hide | `TextLink` (`href` for external, `expanded` for show/hide) |
  | Status | Says what state something is in (Healthy, promoted, failed, running) | Rounded, a soft tint of the state's colour, optional dot; clickable only when it opens what it describes | `StatusChip` (tone `ok`, `warn`, `bad`, `info`, `neutral`), `StatusDot` in tables |

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

`PageHeader`, `Panel`, `Section`, `SectionTitle`, `EmptyNote`, `Hint`, `Count`, `Fact`, `FactGrid`, `useTableKit`, `Card`, `Tile`, `Callout`, `Stat`, `SectionLabel`, `ColumnLabel`, `Button`, `IconButton`, `ActionSelect`, `Chip`, `TierChip`,
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
